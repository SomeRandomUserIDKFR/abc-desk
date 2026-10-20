import assert from "node:assert/strict";
import test from "node:test";
import abcjs from "abcjs";
import { deskAudioParams, parseDeskHeaders } from "../src/deskDialect.js";
import { applyPianoReleases, collectPianoPedalEvents } from "../src/pianoTone.js";

const note = (pitch = 60, start = 0, end = 0.125, articulation = "normal") => ({
  cmd: "note", instrument: "acoustic_grand_piano", volume: 80,
  pitch, start, end, pianoArticulation: articulation,
});
const pedal = [
  { type: "down", start: 0 },
  { type: "up", start: 0.75 },
  { type: "end", start: 1 },
];

test("normal, staccato, tenuto, and long holds use different damping releases", () => {
  const notes = [
    note(60, 0, 0.125),
    note(62, 0.25, 0.325, "staccato"),
    note(64, 0.5, 0.75, "tenuto"),
    note(65, 0.75, 1.25),
  ];
  const original = structuredClone(notes);
  applyPianoReleases([notes], [], 2, 0);
  assert.deepEqual(notes.map((n) => n.pianoReleaseMs), [80, 140, 150, 150]);
  notes.forEach((n, index) => {
    assert.equal(n.start, original[index].start);
    assert.equal(n.pianoKeyEnd, original[index].end);
    assert.equal(n.end, original[index].end);
    assert.equal(n.pitch, original[index].pitch);
    assert.equal(n.volume, original[index].volume);
  });
});

test("pedal sustains both piano voices but does not sustain other instruments", () => {
  const other = { ...note(72), instrument: "violin" };
  const tracks = [[note(60), note(62, 0.25, 0.5)], [note(48)], [other]];
  const originalOther = { ...other };
  applyPianoReleases(tracks, pedal, 2);
  for (const n of tracks.slice(0, 2).flat()) {
    assert.equal(n.end, 0.75);
    assert.equal(n.pianoPedaled, true);
    assert.equal(n.pianoReleaseMs, 110);
  }
  assert.deepEqual(other, originalOther);
});

test("humanized staccato varies the damper speed and ring-off repeatably", () => {
  function perform() {
    const notes = Array.from({ length: 32 }, (_, index) =>
      note(60 + index % 12, index / 8, index / 8 + 0.0375, "staccato"));
    applyPianoReleases([notes], [], 2, 0.5);
    return notes;
  }
  const result = perform();
  assert.deepEqual(result, perform());
  assert.ok(result.every((n) => n.pianoDamperRelease));
  assert.ok(result.every((n) => n.pianoReleaseMs >= 119 && n.pianoReleaseMs <= 161));
  assert.ok(result.every((n) => n.pianoDampingSeconds >= 0.0102 && n.pianoDampingSeconds <= 0.0138));
  assert.ok(new Set(result.map((n) => n.pianoReleaseMs)).size > 1);
  assert.ok(new Set(result.map((n) => n.pianoDampingSeconds)).size > 1);
  result.forEach((n) => {
    assert.equal(n.end, n.pianoKeyEnd);
  });
});

test("pedal does not resurrect already-released notes or shorten keys still held", () => {
  const notes = [note(60, 0, 0.125), note(62, 0.25, 0.9), note(64, 0.75, 1)];
  applyPianoReleases([notes], [
    { type: "down", start: 0.25 }, ...pedal.slice(1),
  ], 2);
  assert.deepEqual(notes.map((n) => n.end), [0.125, 0.9, 1]);
  assert.ok(notes.every((n) => !n.pianoPedaled));
});

test("same-pitch restrikes damp the old sample instead of piling up sustained copies", () => {
  const notes = [note(60), note(60, 0.25, 0.375), note(60, 0.5, 0.625)];
  applyPianoReleases([notes], pedal, 2);
  assert.deepEqual(notes.map((n) => n.end), [0.25, 0.5, 0.75]);
});

test("an unclosed pedal lifts at score end and repedaling clears old notes", () => {
  const notes = [note(60), note(62, 0.5, 0.625)];
  applyPianoReleases([notes], [
    { type: "down", start: 0 },
    { type: "up", start: 0.5 },
    { type: "down", start: 0.5 },
    { type: "end", start: 1 },
  ], 2);
  assert.deepEqual(notes.map((n) => n.end), [0.5, 1]);
});

test("human release and pedal variation is repeatable, bounded, and scales with intensity", () => {
  function perform(human) {
    const notes = Array.from({ length: 32 }, (_, i) =>
      note(60 + i, i / 8, i / 8 + 0.08));
    applyPianoReleases([notes], [
      { type: "down", start: 0 },
      { type: "up", start: 4.25 },
      { type: "end", start: 4.5 },
    ], 2, human);
    return notes;
  }
  const plain = perform(0);
  const subtle = perform(0.1);
  const strong = perform(0.5);
  assert.deepEqual(strong, perform(0.5));
  assert.deepEqual(plain, perform(0));
  let subtleDrift = 0;
  let strongDrift = 0;
  strong.forEach((n, index) => {
    const originalEnd = index / 8 + 0.08;
    assert.equal(n.start, index / 8);
    assert.ok(Math.abs(n.pianoKeyEnd - originalEnd) * 2 <= 0.018);
    assert.ok(Math.abs(n.end - 4.25) * 2 <= 0.025);
    subtleDrift += Math.abs(subtle[index].pianoKeyEnd - originalEnd);
    strongDrift += Math.abs(n.pianoKeyEnd - originalEnd);
  });
  assert.ok(strongDrift > subtleDrift * 4);
  assert.equal(new Set(strong.map((n) => n.end)).size, 1);
  assert.ok(new Set(strong.map((n) => n.pianoReleaseMs)).size > 1);
});

function parsed(body, header = "") {
  const { cleanAbc, meta, warnings } = parseDeskHeaders(`X:1
Inst: piano
M:4/4
L:1/4
Q:120
${header ? `${header}\n` : ""}K:C
${body}`);
  const tune = abcjs.parseOnly(cleanAbc)[0];
  const options = deskAudioParams(meta);
  const sequence = tune.setUpAudio(options);
  return { tune, options, sequence, warnings };
}

test("pedal markers render as annotations and retain rest and repeat timing", () => {
  const { tune, sequence, warnings } = parsed("|: !ped!C D !ped-up!z E :|");
  assert.deepEqual(warnings, []);
  assert.equal(tune.warnings, undefined);
  const events = collectPianoPedalEvents(tune, sequence.totalDuration);
  assert.deepEqual(events.map(({ type, start }) => ({ type, start })), [
    { type: "down", start: 0 },
    { type: "up", start: 0.5 },
    { type: "down", start: 1 },
    { type: "up", start: 1.5 },
    { type: "end", start: 2 },
  ]);
});

test("pedal times follow the same tempo gestures as the notes", () => {
  const { tune, options, sequence } = parsed(
    "!ped!!ritardando(!C D E F !ritardando)! !ped-up!z4|");
  const controls = collectPianoPedalEvents(tune, sequence.totalDuration);
  const tracks = sequence.tracks.map((track) => track.filter((n) => n.cmd === "note")
    .map((n) => ({
      ...n, instrument: "acoustic_grand_piano", end: n.start + n.duration,
    })));
  for (const note of tracks.flat()) delete note.cmd;
  options.sequenceCallback(tracks, { ...options.callbackContext, pianoPedalEvents: controls });
  assert.ok(controls.find((event) => event.type === "up").start > 1);
  assert.ok(controls.find((event) => event.type === "end").start > 2);
  assert.equal(controls.find((event) => event.type === "up").start,
    tracks.flat().find((event) => event.pitch === 65).end);
});

test("pedal markings at unsupported barline positions fail with placement guidance", () => {
  const { tune, sequence } = parsed("!ped!C D E F !ped-up! |]");
  assert.throws(() => collectPianoPedalEvents(tune, sequence.totalDuration),
    /before a note or rest/);
});

test("Human and Imperfect headers resolve to the same release intensity", () => {
  const human = parsed("C D E F|", "Human: 0.4").options.callbackContext.humanize;
  const imperfect = parsed("C D E F|", "Imperfect: 0.4").options.callbackContext.humanize;
  assert.deepEqual(human, imperfect);
});

test("invalid tempo or humanization produces an explicit error", () => {
  assert.throws(() => applyPianoReleases([[note()]], [], NaN), /valid performance tempo/);
  assert.throws(() => applyPianoReleases([[note()]], [], 2, NaN), /humanization must be finite/);
});
