import assert from "node:assert/strict";
import test from "node:test";
import abcjs from "abcjs";
import { balanceHeldNotes, deskAudioParams, parseDeskHeaders } from "../src/deskDialect.js";

function note(pitch, volume = 50, instrument = "acoustic_grand_piano", start = 0) {
  return { cmd: "note", pitch, volume, instrument, start, end: start + 0.125 };
}

function chord(size, volume = 50, instrument = "acoustic_grand_piano") {
  return Array.from({ length: size }, (_, index) => note(60 + index * 2, volume, instrument));
}

for (const instrument of ["acoustic_grand_piano", "bright_acoustic_piano"]) {
  test(`${instrument}: chord density receives one smooth adjustment`, () => {
    const solo = balanceHeldNotes([[note(60, 50, instrument)]])[0][0].volume;
    for (const count of [2, 3, 4, 8]) {
      const result = balanceHeldNotes([chord(count, 50, instrument)])[0];
      const expected = Math.min(1, Math.sqrt(2 / count));
      for (const event of result) {
        assert.ok(Math.abs(event.volume / solo - expected) < 0.035);
      }
    }
  });
}

test("chord processing preserves explicit note balance and dynamic contrasts", () => {
  const volumes = [20, 40, 60, 80];
  const result = balanceHeldNotes([volumes.map((volume, index) => note(60 + index * 2, volume))])[0];
  const ratio = result[3].volume / result[0].volume;
  assert.ok(Math.abs(ratio - 4) < 0.25);
  for (let index = 1; index < result.length; index++) {
    assert.ok(result[index].volume > result[index - 1].volume);
  }
});

test("density is shared across voices and does not change note timing or pitch", () => {
  const original = chord(4);
  const together = balanceHeldNotes([structuredClone(original)])[0];
  const split = balanceHeldNotes([
    structuredClone(original.slice(0, 2)),
    structuredClone(original.slice(2)),
  ]).flat();
  assert.deepEqual(split, together);
  split.forEach((event, index) => {
    assert.equal(event.start, original[index].start);
    assert.equal(event.end, original[index].end);
    assert.equal(event.pitch, original[index].pitch);
  });
});

test("piano density ignores simultaneous non-piano notes", () => {
  const solo = balanceHeldNotes([[note(60)]])[0][0].volume;
  const mixed = balanceHeldNotes([[note(60)], chord(4, 50, "violin").map((event) => ({
    ...event, pitch: event.pitch + 12,
  }))]);
  assert.equal(mixed[0][0].volume, solo);
});

test("non-piano chords retain their existing density processing", () => {
  const organ = balanceHeldNotes([chord(4, 50, "church_organ")])[0];
  assert.deepEqual(organ.map((event) => event.volume), [16, 16, 16, 16]);
});

test("the ABC performance callback retains a crescendo across repeated piano chords", () => {
  const { cleanAbc, meta } = parseDeskHeaders(`X:1
T:Piano dynamics test
Inst: piano
M:4/4
L:1/4
K:C
!ppp![CEGA] !p![CEGA] !mf![CEGA] !ff![CEGA] |
`);
  const params = deskAudioParams(meta);
  const audio = abcjs.parseOnly(cleanAbc)[0].setUpAudio(params);
  const tracks = audio.tracks.map((track) => track
    .filter((event) => event.cmd === "note")
    .map((event) => ({
      ...event,
      instrument: abcjs.synth.instrumentIndexToName[event.instrument ?? audio.instrument ?? 0],
      end: event.start + event.duration,
    })));
  const result = params.sequenceCallback(tracks, params.callbackContext).flat();
  const strikes = [0, 0.25, 0.5, 0.75].map((start) =>
    result.find((event) => event.pitch === 60 && event.start === start)?.volume);
  assert.ok(strikes.every(Number.isFinite));
  for (let index = 1; index < strikes.length; index++) {
    assert.ok(strikes[index] > strikes[index - 1]);
  }
  assert.ok(strikes[3] / strikes[0] > 2);
});
