import assert from "node:assert/strict";
import test from "node:test";
import { balanceHeldNotes, deskAudioParams, parseDeskHeaders } from "../src/deskDialect.js";
import { isPianoInstrument, pianoToneBand, primePianoSynth, renderPianoTone } from "../src/pianoTone.js";

test("only acoustic and bright pianos use strike tone shaping", () => {
  for (const instrument of ["piano", "acoustic_grand_piano", "Bright Acoustic Piano"]) {
    assert.equal(isPianoInstrument(instrument), true);
  }
  for (const instrument of ["violin", "electric_piano_1", "church_organ", undefined]) {
    assert.equal(isPianoInstrument(instrument), false);
  }
});

test("strike bands are bounded, monotonic, and use strike rather than mix velocity", () => {
  let previous = -1;
  for (let velocity = 0; velocity <= 127; velocity++) {
    const band = pianoToneBand({ pianoVelocity: velocity, volume: 12 });
    assert.ok(band >= previous && band >= 0 && band <= 4);
    previous = band;
  }
  assert.equal(pianoToneBand({ volume: -10 }), 0);
  assert.equal(pianoToneBand({ volume: 200 }), 4);
  assert.equal(pianoToneBand({ pianoVelocity: 110, volume: 20 }), 4);
  assert.throws(() => pianoToneBand({ volume: NaN }), /velocity must be finite/);
});

test("chord and bass compensation do not turn a strong strike into a soft tone", () => {
  const notes = Array.from({ length: 4 }, (_, index) => ({
    cmd: "note", pitch: 36 + index * 7, volume: 110,
    instrument: "acoustic_grand_piano", start: 0, end: 0.125,
  }));
  const result = balanceHeldNotes([notes])[0];
  for (const note of result) {
    assert.equal(note.pianoVelocity, 110);
    assert.equal(pianoToneBand(note), 4);
    assert.ok(note.volume < note.pianoVelocity);
  }
});

function makeBuffer(length = 128) {
  const channels = [new Float32Array(length), new Float32Array(length)];
  return {
    sampleRate: 44100,
    length,
    numberOfChannels: channels.length,
    getChannelData: (channel) => channels[channel],
  };
}

function fakeBackend(sourceTracks, decodeAudioData) {
  const renders = [];
  const instances = [];
  class CreateSynth {
    constructor() {
      instances.push(this);
    }
    async init(options) {
      this.initOptions = options;
      this.sequenceCallback = options.options?.sequenceCallback;
      this.millisecondsPerMeasure = options.millisecondsPerMeasure ?? 2000;
      this.meterSize = 1;
      this.flattened = options.sequence ?? {
        tracks: sourceTracks.map((track) => track.map((note) => ({
          ...note, cmd: "note", duration: note.duration ?? note.end - note.start,
        }))),
        totalDuration: 1,
      };
    }
    async prime() {
      const tracks = this.initOptions.sequence
        ? this.initOptions.sequence.tracks.map((track) => track.map((note) => ({
          ...note, end: note.start + note.duration,
        })))
        : structuredClone(sourceTracks);
      this.sequenceCallback?.(tracks, this.initOptions.options?.callbackContext);
      renders.push({ tracks, options: this.initOptions.options, sequence: this.initOptions.sequence });
      const length = this.initOptions.sequence
        ? Math.ceil((this.flattened.totalDuration * this.millisecondsPerMeasure / 1000 +
          this.initOptions.options.fadeLength / 1000) * 44100)
        : 128;
      this.audioBuffers = [makeBuffer(length)];
      for (const note of tracks.flat()) {
        this.audioBuffers[0].getChannelData(0)[0] += note.volume / 1000;
      }
      return { status: "suspended", duration: 128 / 44100 };
    }
    getAudioBuffer() {
      return this.audioBuffers[0];
    }
    stop() {
      this.stopped = true;
    }
  }
  const activeAudioContext = () => ({
    sampleRate: 44100,
    decodeAudioData,
    createBuffer(channels, length, rate) {
      assert.equal(channels, 2);
      assert.equal(rate, 44100);
      return makeBuffer(length);
    },
  });
  return { abcjs: { synth: { CreateSynth, activeAudioContext } }, renders, instances };
}

test("piano and non-piano stems retain timing, pan, and volume without reapplying expression", async () => {
  const original = [
    [{ instrument: "acoustic_grand_piano", pitch: 60, volume: 110, start: 0.125, end: 0.25 }],
    [{ instrument: "violin", pitch: 72, volume: 40, start: 0, end: 0.5 }],
  ];
  const { abcjs, renders, instances } = fakeBackend(original);
  const synth = new abcjs.synth.CreateSynth();
  let callbacks = 0;
  const options = {
    pan: [-0.5, 0.5],
    swing: 60,
    sequenceCallback(tracks) {
      callbacks++;
      for (const note of tracks.flat()) note.start += 0.01;
    },
  };
  const result = await primePianoSynth(abcjs, synth, { visualObj: {}, options });
  assert.equal(callbacks, 1);
  assert.equal(synth.sequenceCallback, options.sequenceCallback);
  assert.equal(result.duration, 128 / 44100);
  assert.equal(renders.length, 3);
  assert.deepEqual(renders[0].tracks[0], []);
  assert.deepEqual(renders[0].tracks[1], []);
  assert.deepEqual(renders[1].tracks[0], []);
  assert.equal(renders[1].tracks[1][0].instrument, "violin");
  assert.deepEqual(renders[2].tracks[1], []);
  assert.deepEqual(renders[2].tracks[0][0], {
    ...original[0][0], start: 0.135, pianoKeyEnd: 0.25,
    pianoPedaled: false, pianoReleaseMs: 80, pianoArticulation: "normal",
  });
  assert.deepEqual(renders[2].options.pan, options.pan);
  assert.equal(renders[2].options.swing, 0);
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[0] - 0.15) < 1e-6);
  assert.equal(instances[1].stopped, true);
  assert.deepEqual(instances[1].audioBuffers, []);
});

test("piano staccato keeps a tempo-independent gate without darkening the strike", async () => {
  for (const bpm of [60, 100, 140, 180]) {
    const duration = 1 / 16;
    const inheritedGap = Math.min(bpm / 60 * duration * 0.4, duration * 2 / 3);
    const { abcjs, renders } = fakeBackend([[
      {
        instrument: "acoustic_grand_piano", pitch: 60, volume: 110,
        pianoVelocity: 110, start: 0, end: duration - inheritedGap,
        duration, endType: "staccato",
      },
    ]]);
    const synth = new abcjs.synth.CreateSynth();
    let event;
    let callbacks = 0;
    await primePianoSynth(abcjs, synth, {
      millisecondsPerMeasure: 240000 / bpm,
      options: {
        sequenceCallback(tracks) {
          callbacks++;
          event = tracks[0][0];
        },
      },
    });
    assert.equal(callbacks, 1);
    assert.equal(event.start, 0);
    assert.equal(event.pianoKeyEnd, duration * 0.6);
    assert.equal(event.end, duration * 0.6);
    assert.equal(event.volume, 110);
    assert.equal(event.pianoVelocity, 110);
    assert.equal(pianoToneBand(event), 4);
    assert.equal(event.pianoReleaseMs, 140);
    assert.equal(event.pianoDampingSeconds, 0.012);
    assert.equal(renders[1].options.fadeLength, 8);
    assert.equal(renders[1].options.sequenceCallback, undefined);
    assert.ok(renders[1].sequence.totalDuration * 240 / bpm >=
      duration * 0.6 * 240 / bpm + 0.14 - 1 / 44100);
  }
});

test("comparison playback disables the modeled damper without disabling strike tone or the corrected gate", async () => {
  const { meta } = parseDeskHeaders("X:1\nInst:piano\nK:C\n.C|");
  const { pianoDamperRelease } = deskAudioParams(meta);
  assert.equal(pianoDamperRelease, false);
  const { abcjs, renders } = fakeBackend([[
    { instrument: "acoustic_grand_piano", pitch: 60, volume: 110,
      start: 0, end: 1 / 48, duration: 1 / 16, endType: "staccato" },
  ]]);
  const synth = new abcjs.synth.CreateSynth();
  await primePianoSynth(abcjs, synth, { options: { pianoDamperRelease } });
  assert.equal(renders.length, 2);
  assert.equal(renders[1].sequence, undefined);
  assert.equal(renders[1].options.fadeLength, 80);
  assert.equal(renders[1].tracks[0][0].pianoDamperRelease, undefined);
  assert.equal(renders[1].tracks[0][0].end, 1 / 16 * 0.6);
  assert.equal(pianoToneBand(renders[1].tracks[0][0]), 4);
});

test("non-piano performances bypass tone rendering entirely", async () => {
  const { abcjs, renders } = fakeBackend([
    [{ instrument: "violin", pitch: 72, volume: 60, start: 0, end: 1 }],
  ]);
  const synth = new abcjs.synth.CreateSynth();
  await primePianoSynth(abcjs, synth, { options: {} });
  assert.equal(renders.length, 1);
  assert.equal(renders[0].tracks[0][0].instrument, "violin");
});

test("high-quality piano replaces only piano samples and retains expression, pan, and non-piano stems", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    requests++;
    assert.match(url, /3382bf9496bba2486f5ab0de55a264d1dfc38404\/Samples\/C5v14\.flac$/);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  const sample = makeBuffer(44100);
  sample.getChannelData(0).fill(0.2);
  sample.getChannelData(1).fill(0.2);
  const { abcjs, renders } = fakeBackend([
    [{ instrument: "acoustic_grand_piano", pitch: 72, volume: 55, pianoVelocity: 110, start: 0, end: 0.125 }],
    [{ instrument: "violin", pitch: 60, volume: 40, start: 0, end: 0.5 }],
  ], async () => sample);
  let callbacks = 0;
  const progress = [];
  const synth = new abcjs.synth.CreateSynth();
  await primePianoSynth(abcjs, synth, {
    options: { highQualityPiano: true, pan: [-1, 1], sequenceCallback: () => callbacks++,
      onPianoLoadProgress: (event) => progress.push(event) },
  });
  assert.equal(callbacks, 1);
  assert.equal(requests, 1);
  assert.equal(renders.length, 2);
  assert.equal(renders[1].tracks[0].length, 0);
  assert.equal(renders[1].tracks[1][0].instrument, "violin");
  const gain = 0.6 * 55 / 110 * (110 / 127) ** 0.54;
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[0] - (0.04 + 0.4 * gain)) < 1e-6);
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(1)[0]) < 1e-6);
  assert.deepEqual(progress, [{ completed: 0, total: 1 }, { completed: 1, total: 1 }]);
});

test("high-quality piano can still use the optional modeled staccato release", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true, arrayBuffer: async () => new ArrayBuffer(1),
  }));
  const sample = makeBuffer(44100);
  sample.getChannelData(0).fill(0.2);
  sample.getChannelData(1).fill(0.2);
  const { abcjs } = fakeBackend([[
    { instrument: "acoustic_grand_piano", pitch: 60, volume: 110,
      start: 0, end: 1 / 48, duration: 1 / 16, endType: "staccato" },
  ]], async () => sample);
  const synth = new abcjs.synth.CreateSynth();
  await primePianoSynth(abcjs, synth, { options: { highQualityPiano: true } });
  const values = synth.getAudioBuffer().getChannelData(0);
  const key = Math.round(1 / 16 * 0.6 * 2 * 44100);
  assert.ok(values[0] > 0);
  assert.ok(values[key + 100] > 0 && values[key + 100] < values[key]);
  assert.equal(values[key + Math.ceil(140 * 44100 / 1000) - 1] < 1e-7, true);
});

test("damper samples are reused and mixed once alongside ordinary piano and other instruments", async () => {
  const staccato = {
    instrument: "acoustic_grand_piano", pitch: 60, volume: 110,
    start: 0, end: 1 / 48, duration: 1 / 16, endType: "staccato",
  };
  const { abcjs, renders } = fakeBackend([
    [staccato, { ...staccato, start: 0.25, end: 0.25 + 1 / 48 }],
    [{ instrument: "acoustic_grand_piano", pitch: 64, volume: 110, start: 0, end: 0.125 }],
    [{ instrument: "violin", pitch: 72, volume: 40, start: 0, end: 0.5 }],
  ]);
  const synth = new abcjs.synth.CreateSynth();
  await primePianoSynth(abcjs, synth, { options: {} });
  assert.equal(renders.length, 4);
  assert.equal(renders.filter((render) => render.sequence).length, 1);
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[0] - 0.26) < 1e-6);
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[22050] - 0.11) < 1e-6);
});

test("rendered tails extend the output and reported duration instead of being truncated", async () => {
  const { abcjs } = fakeBackend([
    [{ instrument: "acoustic_grand_piano", pitch: 60, volume: 110, start: 0, end: 2 }],
  ]);
  const OriginalSynth = abcjs.synth.CreateSynth;
  abcjs.synth.CreateSynth = class extends OriginalSynth {
    async prime() {
      const result = await super.prime();
      if (this.flattened.totalDuration > 1) {
        const buffer = makeBuffer(256);
        buffer.getChannelData(0).set(this.getAudioBuffer().getChannelData(0));
        buffer.getChannelData(0)[255] = 0.01;
        this.audioBuffers = [buffer];
      }
      return result;
    }
  };
  abcjs.synth.activeAudioContext = () => ({
    createBuffer(channels, length, rate) {
      assert.equal(channels, 2);
      assert.equal(rate, 44100);
      return makeBuffer(length);
    },
  });
  const synth = new abcjs.synth.CreateSynth();
  const result = await primePianoSynth(abcjs, synth, { options: {} });
  assert.equal(synth.getAudioBuffer().length, 256);
  assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[255] - 0.01) < 1e-6);
  assert.equal(result.duration, 256 / 44100);
  assert.equal(synth.duration, result.duration);
});

test("overlapping strike strengths are filtered independently and mixed only once", async () => {
  const previous = globalThis.OfflineAudioContext;
  const filters = [];
  class OfflineContext {
    constructor(channels, length, sampleRate) {
      this.channels = channels;
      this.length = length;
      this.sampleRate = sampleRate;
      this.destination = {};
    }
    createBufferSource() {
      this.source = { connect: (node) => node, start() {} };
      return this.source;
    }
    createBiquadFilter() {
      const filter = { frequency: {}, gain: {}, connect: (node) => node };
      filters.push(filter);
      return filter;
    }
    async startRendering() {
      assert.equal(this.source.buffer.length, this.length);
      assert.equal(this.source.buffer.sampleRate, this.sampleRate);
      assert.equal(this.source.buffer.numberOfChannels, this.channels);
      return this.source.buffer;
    }
  }
  globalThis.OfflineAudioContext = OfflineContext;
  try {
    const { abcjs, renders } = fakeBackend([
      [20, 60, 110].map((volume, index) => ({
        instrument: "acoustic_grand_piano", pitch: 60 + index, volume, start: 0, end: 0.25,
      })),
      [{ instrument: "violin", pitch: 72, volume: 40, start: 0, end: 0.25 }],
    ]);
    const synth = new abcjs.synth.CreateSynth();
    await primePianoSynth(abcjs, synth, { options: {} });
    assert.equal(renders.length, 5);
    assert.deepEqual(renders.slice(1).map((render) => render.tracks.flat().map((note) => note.volume)),
      [[40], [20], [60], [110]]);
    assert.deepEqual(filters.map((filter) => ({
      type: filter.type, frequency: filter.frequency.value, gain: filter.gain.value,
    })), [
      { type: "highshelf", frequency: 2400, gain: -6 },
      { type: "highshelf", frequency: 2400, gain: -3 },
    ]);
    assert.ok(Math.abs(synth.getAudioBuffer().getChannelData(0)[0] - 0.23) < 1e-6);
  } finally {
    if (previous === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = previous;
  }
});

test("failed priming restores the original callback and surfaces the error", async () => {
  const original = () => {};
  const synth = {
    async init() { this.sequenceCallback = original; },
    async prime() { throw new Error("render failed"); },
  };
  await assert.rejects(primePianoSynth({}, synth, { options: {} }), /render failed/);
  assert.equal(synth.sequenceCallback, original);
});

test("invalid tone bands fail explicitly and the strongest band preserves the original sample", async () => {
  await assert.rejects(renderPianoTone(makeBuffer(), 5), /tone band/);
  await assert.rejects(renderPianoTone(makeBuffer(), 1.5), /tone band/);
  const buffer = makeBuffer();
  assert.equal(await renderPianoTone(buffer, 4), buffer);
});
