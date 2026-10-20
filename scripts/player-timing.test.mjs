import assert from "node:assert/strict";
import test from "node:test";
import { createTestingPlayer } from "../src/deskPlayer.js";

test("glissando preparation finishes before audio starts, and cursor timings follow processed audio time", async (t) => {
  const source = 'X:1\nQ:120\nK:C\n"gliss."!slide! C E|';
  const raw = [
    { cmd: "note", instrument: "violin", pitch: 60, volume: 80,
      start: 0, duration: 0.25, startChar: source.lastIndexOf("C "), endChar: source.lastIndexOf("C ") + 1 },
    { cmd: "note", instrument: "violin", pitch: 64, volume: 80,
      start: 0.25, duration: 0.25, startChar: source.lastIndexOf("E|"), endChar: source.lastIndexOf("E|") + 1 },
  ];
  const tune = { setUpAudio: () => ({ tracks: [structuredClone(raw)] }), getBpm: () => 120 };
  const context = { currentTime: 10 };
  const intervals = new Map();
  const buttons = new Map();
  const starts = [], events = [], progress = [];
  let onStart;
  let releaseRun, notifyRun;
  const runStarted = new Promise((resolve) => { notifyRun = resolve; });
  const runReady = new Promise((resolve) => { releaseRun = resolve; });
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  globalThis.document = {
    querySelector: () => ({
      innerHTML: "",
      querySelector: (selector) => ({
        addEventListener: (_type, handler) => buttons.set(selector, handler),
      }),
    }),
  };
  globalThis.window = {
    setInterval: (handler) => { intervals.set(handler, handler); return handler; },
    clearInterval: (timer) => intervals.delete(timer),
    setTimeout,
    clearTimeout: (timer) => { intervals.delete(timer); clearTimeout(timer); },
  };
  t.after(() => {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  });
  class CreateSynth {
    async init(options) {
      this.options = options;
      if (options.visualObj.run) assert.equal(options.options.violinReleaseMs, 55);
      this.sequenceCallback = options.options.sequenceCallback;
      this.millisecondsPerMeasure = 2000;
      this.meterSize = 1;
      this.flattened = { totalDuration: 0.5, tracks: [structuredClone(raw)] };
    }
    async prime() {
      if (this.options.visualObj.run) {
        notifyRun();
        await runReady;
      }
      const notes = raw.map(({ cmd, ...note }) => ({
        ...note, end: note.start + note.duration,
      }));
      this.sequenceCallback?.([notes], this.options.options.callbackContext);
      return { duration: 1 };
    }
    getAudioBuffer() { return { duration: 0.2 }; }
    start() {
      this.startTimeSec = context.currentTime - (this.position ?? 0);
      this.directSource = [];
      starts.push(context.currentTime);
    }
    stop() { return context.currentTime - this.startTimeSec; }
    pause() { this.position = this.stop(); return this.position; }
  }
  const player = createTestingPlayer({
    abcjs: { synth: { CreateSynth, activeAudioContext: () => context },
      parseOnly: () => [{ ...tune, run: true }] },
    audioSelector: "#audio",
    cursorControl: {
      onStart: (value) => { assert.equal(starts.length, 0); onStart = value; },
      onProgress: (seconds) => progress.push(seconds),
      onEvent: (event) => events.push(event),
      onFinished() {},
    },
    onPlaybackError: (error) => { throw error; },
  });
  player.load();
  player.setTune(tune, {
    callbackContext: { sourceText: source },
    sequenceCallback(tracks) {
      for (const note of tracks.flat()) {
        note.start *= 0.5;
        note.end *= 0.5;
      }
    },
  });
  buttons.get("[data-test-play]")();
  await runStarted;
  assert.equal(starts.length, 0, "Main audio must wait for the glissando samples");
  context.currentTime = 100;
  releaseRun();
  for (let i = 0; i < 20 && !intervals.size; i++) await new Promise(setImmediate);
  assert.equal(starts[0], 100);
  assert.equal(onStart.secondsPerWholeNote, 2);
  assert.equal(onStart.events[1].start, 0.125, "Use processed, not raw, note timing");
  assert.equal(onStart.events[0].glissandoTargetStart, 0.125);
  context.currentTime = 100.26;
  for (const tick of intervals.values()) tick();
  assert.ok(Math.abs(progress.at(-1) - 0.26) < 1e-10);
  assert.deepEqual(events.map((event) => event.playbackSeconds), [0, 0.25]);
  for (const tick of intervals.values()) tick();
  assert.equal(events.length, 2, "Do not fire events twice when the audio clock is stationary");
  buttons.get("[data-test-pause]")();
  assert.equal(intervals.size, 0);
  context.currentTime = 110;
  buttons.get("[data-test-play]")();
  context.currentTime = 110.05;
  for (const tick of intervals.values()) tick();
  assert.ok(Math.abs(progress.at(-1) - 0.31) < 1e-10);
  player.invalidate();
});
