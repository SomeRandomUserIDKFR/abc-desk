import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  iowaViolinSample, isViolinInstrument, mixIowaViolinNote,
  createIowaViolinSampleCache, renderIowaViolin,
} from "../src/iowaViolin.js";
import { IOWA_VIOLIN_SAMPLES } from "../src/iowaViolinSamples.js";
import { primePianoSynth } from "../src/pianoTone.js";
import { deskAudioParams, parseDeskHeaders, balanceHeldNotes } from "../src/deskDialect.js";

function buffer(length = 5000, rate = 1000, count = 2) {
  const channels = Array.from({ length: count }, () => new Float32Array(length));
  return { length, sampleRate: rate, numberOfChannels: count,
    getChannelData: channel => channels[channel] };
}
const note = (changes = {}) => ({
  instrument: "violin", pitch: 62, start: .05, end: .15,
  volume: 80, violinVelocity: 80, ...changes,
});

test("violin is opt-in, persisted-setting compatible, and does not change other instruments' vibrato", () => {
  const { meta } = parseDeskHeaders("X:1\nInst:violin\nK:D\nD|");
  const progress = () => {};
  assert.equal(deskAudioParams(meta).highQualityViolin, false);
  assert.equal(deskAudioParams(meta).callbackContext.violinVibrato, true);
  const options = deskAudioParams(meta, { highQualityViolin: true, onViolinLoadProgress: progress });
  assert.equal(options.highQualityViolin, true);
  assert.equal(options.onViolinLoadProgress, progress);
  assert.equal(options.callbackContext.violinVibrato, false);
  const viola = parseDeskHeaders("X:1\nInst:viola\nK:C\nC|").meta;
  assert.equal(deskAudioParams(viola, { highQualityViolin: true }).callbackContext.violinVibrato, true);
  assert.ok(isViolinInstrument(" Violin "));
  assert.ok(isViolinInstrument("fiddle"));
  assert.ok(!isViolinInstrument("viola"));
  assert.ok(!isViolinInstrument("pizzicato_strings"));
});

test("pp/mf/ff layers follow pre-mix bow strength, not ensemble attenuation", () => {
  for (let velocity = 0; velocity <= 127; velocity++) {
    assert.equal(iowaViolinSample(note({ violinVelocity: velocity })).layer,
      velocity <= 62 ? "pp" : velocity <= 96 ? "mf" : "ff");
  }
  assert.equal(iowaViolinSample(note({ volume: 15, violinVelocity: 110 })).layer, "ff");
  const tracks = [[{ ...note(), volume: 110 }]];
  balanceHeldNotes(tracks);
  assert.equal(tracks[0][0].violinVelocity, 110);
  assert.equal(iowaViolinSample(tracks[0][0]).layer, "ff");
  for (const changes of [{ pitch: NaN }, { pitch: -1 }, { violinVelocity: NaN }]) {
    assert.throws(() => iowaViolinSample(note(changes)), /valid MIDI/);
  }
});

test("the audition's D-major pitches retain exact recorded roots and edges transpose honestly", () => {
  for (const pitch of [62, 64, 66, 67, 69, 71, 73, 74]) {
    for (const violinVelocity of [45, 80, 112]) {
      assert.equal(iowaViolinSample(note({ pitch, violinVelocity })).root, pitch);
    }
  }
  assert.equal(iowaViolinSample(note({ pitch: 0 })).root, 55);
  assert.equal(iowaViolinSample(note({ pitch: 127 })).root, 100);
  assert.equal(iowaViolinSample(note({ pitch: 100, violinVelocity: 112 })).root, 96);
});

test("standalone samples use the embedded bank and missing entries fail explicitly", (t) => {
  const previous = globalThis.abcDeskIowaSamples;
  t.after(() => {
    if (previous === undefined) delete globalThis.abcDeskIowaSamples;
    else globalThis.abcDeskIowaSamples = previous;
  });
  const sample = iowaViolinSample(note());
  const url = "data:audio/flac;base64,ZkxhQw==";
  globalThis.abcDeskIowaSamples = { [sample.name]: url };
  assert.equal(iowaViolinSample(note()).url, url);
  globalThis.abcDeskIowaSamples = {};
  assert.throws(() => iowaViolinSample(note()), /Embedded Iowa violin sample missing/);
});

test("all lossless assets have exact provenance hashes and safe sustain regions", async () => {
  const manifest = JSON.parse(await fs.readFile(new URL("../public/iowa-violin/provenance.json", import.meta.url)));
  assert.equal(manifest.samples.length, 53);
  assert.equal(Object.keys(IOWA_VIOLIN_SAMPLES).length, 53);
  for (const source of manifest.samples) {
    const bytes = await fs.readFile(new URL(`../public/iowa-violin/${source.name}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
    assert.ok(source.loopStart >= 0 && source.loopStart + source.crossfade < source.loopEnd);
    assert.ok(source.loopEnd < source.packagedSeconds);
    assert.ok(Math.abs(source.cents) <= 60 && source.voicedWindows >= 2);
  }
});

test("onset, gate, release and pan preserve score timing, with no dropped long notes", () => {
  const input = buffer();
  input.getChannelData(0).fill(.2); input.getChannelData(1).fill(.1);
  const output = buffer(8000);
  mixIowaViolinNote(output, input, note({ end: 6.05 }), 1);
  const gain = 3 * 80 / 127;
  assert.equal(output.getChannelData(0)[49], 0);
  assert.equal(output.getChannelData(0)[50], 0);
  assert.ok(Math.abs(output.getChannelData(0)[51] - .2 * gain) < 1e-6);
  assert.ok(Math.abs(output.getChannelData(0)[5000] - .2 * gain) < 1e-6);
  assert.ok(Math.abs(output.getChannelData(0)[6150] - .1 * gain) < 1e-6);
  assert.equal(output.getChannelData(0)[6250], 0);
  const panned = buffer();
  mixIowaViolinNote(panned, input, note(), 1, -1);
  assert.ok(Math.abs(panned.getChannelData(0)[60] - .3 * gain) < 1e-6);
  assert.equal(panned.getChannelData(1)[60], 0);
});

test("resampling and cents affect sample position, not onset or rhythmic duration", () => {
  const input = buffer(10000, 2000);
  for (let c = 0; c < 2; c++) for (let i = 0; i < input.length; i++) input.getChannelData(c)[i] = i / 10000;
  const output = buffer();
  mixIowaViolinNote(output, input, note({ cents: 1200 }), 1);
  assert.ok(Math.abs(output.getChannelData(0)[60] - .004 * 3 * 80 / 127) < 1e-6);
  assert.equal(output.getChannelData(0)[49], 0);
  assert.equal(output.getChannelData(0)[350], 0);
});

test("loop crossfades stay continuous at wrap points and rendering is deterministic", () => {
  const input = buffer();
  for (let c = 0; c < 2; c++) for (let i = 0; i < input.length; i++) input.getChannelData(c)[i] = Math.sin(i * .02) * .05;
  const a = buffer(10000), b = buffer(10000);
  mixIowaViolinNote(a, input, note({ end: 8.05 }), 1);
  mixIowaViolinNote(b, input, note({ end: 8.05 }), 1);
  assert.deepEqual(a.getChannelData(0), b.getChannelData(0));
  const channel = a.getChannelData(0);
  for (const wrap of [2200, 3075, 3950]) {
    assert.ok(Math.abs(channel[wrap] - channel[wrap - 1]) < .01);
  }
});

test("sample loads are cached and failures/cancellation are explicit and retryable", async () => {
  let requests = 0;
  const context = { sampleRate: 1000, decodeAudioData: async () => buffer() };
  const sample = iowaViolinSample(note());
  const cache = createIowaViolinSampleCache({ fetchSample: async (_url, options) => {
    assert.equal(options.cache, "force-cache"); requests++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  } });
  await cache.load(context, sample); await cache.load(context, sample);
  assert.equal(requests, 1);
  const failed = createIowaViolinSampleCache({
    fetchSample: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(failed.load(context, sample), /HTTP 503.*Use high quality violin/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(cache.load(context, sample, abort.signal), { name: "AbortError" });
  await assert.rejects(cache.load({ ...context, sampleRate: 2000,
    decodeAudioData: async () => { throw new Error("bad FLAC"); } }, sample), /bad FLAC/);
});

test("invalid mixing timelines never turn into silence-shaped success", () => {
  for (const changes of [{ start: NaN }, { start: -1 }, { end: 0 }, { volume: NaN }, { cents: Infinity }]) {
    assert.throws(() => mixIowaViolinNote(buffer(), buffer(), note(changes), 1), /timeline/);
  }
  assert.throws(() => mixIowaViolinNote(buffer(), buffer(2), note(), 1), /timeline/);
  assert.throws(() => mixIowaViolinNote({ ...buffer(), sampleRate: NaN }, buffer(), note(), 1), /timeline/);
  assert.throws(() => mixIowaViolinNote(buffer(), { ...buffer(), length: NaN }, note(), 1), /timeline/);
  assert.throws(() => mixIowaViolinNote(buffer(), buffer(), note({ cents: 1e10 }), 1), /timeline/);
});

test("piano, Iowa violin and ordinary instruments share one processed timeline without duplication", async (t) => {
  const oldFetch = globalThis.fetch;
  const urls = [], captures = [];
  globalThis.fetch = async url => {
    urls.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const context = {
    sampleRate: 1000, createBuffer: (count, length, rate) => buffer(length, rate, count),
    decodeAudioData: async () => {
      const result = buffer(); result.getChannelData(0).fill(.1); result.getChannelData(1).fill(.1);
      return result;
    },
  };
  const raw = ["piano", "violin", "flute"].map(instrument => [
    { ...note({ instrument, start: .1, end: .2 }), cmd: "note", duration: .1 },
  ]);
  let callbacks = 0;
  class CreateSynth {
    async init(options) {
      this.options = options; this.sequenceCallback = options.options.sequenceCallback;
      this.flattened = { tracks: structuredClone(raw), totalDuration: .5 };
      this.millisecondsPerMeasure = 1000; this.meterSize = 1;
    }
    async prime() {
      const tracks = structuredClone(raw);
      this.sequenceCallback?.(tracks, this.options.options.callbackContext);
      this.audioBuffers = [buffer()];
      for (const track of tracks) for (const event of track) {
        this.audioBuffers[0].getChannelData(0)[Math.round(event.start * 1000)] += event.volume / 1000;
      }
      return { duration: 5 };
    }
    getAudioBuffer() { return this.audioBuffers[0]; }
    stop() {}
  }
  const synth = new CreateSynth();
  await primePianoSynth({ synth: { CreateSynth, activeAudioContext: () => context } }, synth, {
    options: {
      highQualityPiano: true, highQualityViolin: true, pan: [-1, 1, 0],
      sequenceCallback(tracks) {
        callbacks++;
        for (const event of tracks.flat()) { event.start += .1; event.end += .1; }
      },
    },
    onPerformanceTracks(tracks) { captures.push(structuredClone(tracks)); },
  });
  assert.equal(callbacks, 1);
  assert.equal(captures[0].flat().length, 3);
  assert.ok(captures[0].flat().every(event => event.start === .2));
  assert.ok(urls.some(url => url.includes("SalamanderGrandPiano")));
  assert.ok(urls.some(url => url.includes("iowa-violin")));
  assert.equal(synth.getAudioBuffer().getChannelData(1)[199], 0);
  assert.ok(synth.getAudioBuffer().getChannelData(1)[202] > 0);
});

test("silent violin tracks do not fetch samples and progress counts unique recordings", async () => {
  const progress = [];
  const context = { createBuffer: (count, length, rate) => buffer(length, rate, count) };
  const output = buffer();
  assert.equal(await renderIowaViolin(context, [[note({ volume: 0 })]], output, 1,
    { onViolinLoadProgress: value => progress.push(value) }), output);
  assert.deepEqual(progress, [{ completed: 0, total: 0 }]);
});
