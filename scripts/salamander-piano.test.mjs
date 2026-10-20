import assert from "node:assert/strict";
import test from "node:test";
import {
  salamanderSample, salamanderTrackPan, mixSalamanderNote,
  createSalamanderSampleCache, renderSalamanderPiano,
} from "../src/salamanderPiano.js";
import { deskAudioParams, parseDeskHeaders } from "../src/deskDialect.js";

function buffer(length = 512, rate = 1000, count = 2) {
  const channels = Array.from({ length: count }, () => new Float32Array(length));
  return { length, sampleRate: rate, numberOfChannels: count,
    getChannelData: (channel) => channels[channel] };
}
const note = (changes = {}) => ({
  pitch: 60, volume: 80, pianoVelocity: 80,
  start: 0, end: 0.1, pianoReleaseMs: 80, ...changes,
});

test("all 16 velocity layers use the source boundaries and pre-mix strike strength", () => {
  const limits = [26, 34, 36, 43, 46, 50, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127];
  for (let velocity = 1; velocity <= 127; velocity++) {
    assert.equal(salamanderSample(note({ pianoVelocity: velocity })).layer,
      limits.findIndex((limit) => velocity <= limit) + 1);
  }
  assert.equal(salamanderSample(note({ volume: 20, pianoVelocity: 110 })).layer, 14);
  assert.equal(salamanderSample(note({ pianoVelocity: 0 })).layer, 1);
  assert.equal(salamanderSample(note({ pianoVelocity: 150 })).layer, 16);
});

test("native minor-third mapping includes D4-D5, keyboard edges, and pinned encoded URLs", () => {
  const pitches = [62, 64, 66, 67, 69, 71, 73, 74];
  assert.deepEqual(pitches.map((pitch) => salamanderSample(note({ pitch })).root),
    [63, 63, 66, 66, 69, 72, 72, 75]);
  assert.equal(salamanderSample(note({ pitch: 0 })).root, 21);
  assert.equal(salamanderSample(note({ pitch: 127 })).root, 108);
  assert.match(salamanderSample(note({ pitch: 62 })).url,
    /3382bf9496bba2486f5ab0de55a264d1dfc38404\/Samples\/D%234v10\.flac$/);
  for (const changes of [{ pitch: NaN }, { pitch: -1 }, { pianoVelocity: NaN }]) {
    assert.throws(() => salamanderSample(note(changes)), /valid MIDI/);
  }
});

test("render settings are opt-in and leave the standard source as default", () => {
  const { meta } = parseDeskHeaders("X:1\nInst:piano\nK:C\nC|");
  assert.equal(deskAudioParams(meta).highQualityPiano, false);
  const progress = () => {};
  const options = deskAudioParams(meta, { highQualityPiano: true, onPianoLoadProgress: progress });
  assert.equal(options.highQualityPiano, true);
  assert.equal(options.onPianoLoadProgress, progress);
});

test("timing, mix gain and linear release preserve the written rhythmic slot", () => {
  const sample = buffer();
  sample.getChannelData(0).fill(0.4);
  sample.getChannelData(1).fill(0.2);
  const output = buffer();
  mixSalamanderNote(output, sample, note({ start: 0.05, end: 0.15, volume: 40 }), 1);
  const gain = 0.6 * 0.5 * (80 / 127) ** 0.54;
  assert.equal(output.getChannelData(0)[49], 0);
  assert.ok(Math.abs(output.getChannelData(0)[50] - 0.4 * gain) < 1e-7);
  assert.ok(Math.abs(output.getChannelData(1)[50] - 0.2 * gain) < 1e-7);
  assert.ok(Math.abs(output.getChannelData(0)[190] - 0.4 * gain * 0.5) < 1e-7);
  assert.equal(output.getChannelData(0)[230], 0);
});

test("transposition, cents and sample-rate conversion are applied without changing onset", () => {
  const sample = buffer(512, 2000);
  for (let c = 0; c < 2; c++) for (let i = 0; i < 512; i++) sample.getChannelData(c)[i] = i / 1000;
  const output = buffer();
  mixSalamanderNote(output, sample, note({ end: 0.02, cents: 1200, pianoReleaseMs: 0 }), 1);
  const gain = 0.6 * (80 / 127) ** 0.54;
  assert.ok(Math.abs(output.getChannelData(0)[10] - 0.04 * gain) < 1e-7);
});

test("stereo panning follows the Web Audio stereo-panner law and preserves track slots", () => {
  const sample = buffer();
  sample.getChannelData(0).fill(0.4);
  sample.getChannelData(1).fill(0.2);
  const output = buffer();
  mixSalamanderNote(output, sample, note(), 1, -1);
  assert.ok(Math.abs(output.getChannelData(0)[0] - 0.6 * 0.6 * (80 / 127) ** 0.54) < 1e-7);
  assert.equal(output.getChannelData(1)[0], 0);
  for (const [index, expected] of [-0.2, 0.2, -0.6, 0.6].entries()) {
    assert.ok(Math.abs(salamanderTrackPan(0.4, index, 4) - expected) < 1e-12);
  }
  assert.equal(salamanderTrackPan([-2, 0.5], 0, 3), -1);
  assert.equal(salamanderTrackPan([-2, 0.5], 2, 3), 0);
});

test("the decoded cache reuses samples, separates rates, and evicts least-recently-used buffers", async () => {
  const requests = [];
  const cache = createSalamanderSampleCache({ maxBytes: 128,
    fetchSample: async (url, options) => {
      assert.equal(options.cache, "force-cache");
      requests.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    } });
  const context = { sampleRate: 1000, decodeAudioData: async () => buffer(8) };
  const a = salamanderSample(note()), b = salamanderSample(note({ pitch: 63 }));
  const c = salamanderSample(note({ pitch: 66 }));
  await cache.load(context, a);
  await cache.load(context, b);
  await cache.load(context, a);
  await cache.load(context, c);
  await cache.load(context, b);
  assert.equal(requests.length, 4);
  await cache.load({ ...context, sampleRate: 2000 }, b);
  assert.equal(requests.length, 5);
});

test("download, decode, and cancellation failures surface without a standard-piano fallback", async () => {
  const sample = salamanderSample(note());
  const context = { sampleRate: 1000, decodeAudioData: async () => buffer(8) };
  const failed = createSalamanderSampleCache({
    fetchSample: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(failed.load(context, sample), /HTTP 503.*High-quality piano/);
  const undecodable = createSalamanderSampleCache({
    fetchSample: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
  });
  await assert.rejects(undecodable.load({
    ...context, decodeAudioData: async () => { throw new Error("FLAC decoding failed"); },
  }, sample), /FLAC decoding failed.*High-quality piano/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(failed.load(context, sample, controller.signal), { name: "AbortError" });
});

test("concurrent loads do not inflate the cache budget and interrupted downloads can be retried", async () => {
  let requests = 0;
  const context = { sampleRate: 1000, decodeAudioData: async () => buffer(8) };
  const cache = createSalamanderSampleCache({ maxBytes: 128,
    fetchSample: async (_url, { signal }) => {
      requests++;
      await new Promise((resolve) => setTimeout(resolve, 1));
      signal?.throwIfAborted();
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    } });
  const a = salamanderSample(note()), b = salamanderSample(note({ pitch: 63 }));
  await Promise.all([cache.load(context, a), cache.load(context, a)]);
  await cache.load(context, b);
  await cache.load(context, a);
  assert.equal(requests, 3);
  const controller = new AbortController();
  const c = salamanderSample(note({ pitch: 66 }));
  const pending = cache.load(context, c, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await cache.load(context, c);
  assert.equal(requests, 5);
});

test("invalid timelines and pan fail explicitly", () => {
  const input = buffer(), output = buffer();
  for (const changes of [{ start: NaN }, { end: -1 }, { pianoReleaseMs: -1 }, { volume: NaN }]) {
    assert.throws(() => mixSalamanderNote(output, input, note(changes), 1), /performance timeline/);
  }
  assert.throws(() => mixSalamanderNote(buffer(10), input, note(), 1), /performance timeline/);
  assert.throws(() => salamanderTrackPan([NaN], 0, 1), /pan must be finite/);
});

test("silent and non-piano performances do not request any Salamander samples", async () => {
  const output = buffer();
  const progress = [];
  const result = await renderSalamanderPiano(
    { createBuffer: () => { throw new Error("Unnecessary allocation"); } },
    [[note({ volume: 0 })]], output, 1,
    { onPianoLoadProgress: (event) => progress.push(event) },
  );
  assert.equal(result, output);
  assert.deepEqual(progress, [{ completed: 0, total: 0 }]);
});
