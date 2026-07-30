import abcjs from "abcjs";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import {
  parseDeskHeaders,
  deskAudioParams,
  programToSoundfontName,
} from "../src/deskDialect.js";

mkdirSync(".tools", { recursive: true });

const song = readFileSync("./Song.txt", "utf8");
const { cleanAbc, meta } = parseDeskHeaders(song);
const expected = programToSoundfontName(meta.midiProgram);
const params = deskAudioParams(meta);

const tune = abcjs.parseOnly(cleanAbc)[0];
const audio = tune.setUpAudio(params);

const nameOf = (n) =>
  typeof n === "string" ? n : abcjs.synth.instrumentIndexToName[n];

const rawNotes = [];
for (const track of audio.tracks) {
  let currentInst = audio.instrument ?? 0;
  for (const ev of track) {
    if (ev.cmd === "program") currentInst = ev.instrument;
    if (ev.cmd === "note") {
      const num = ev.instrument ?? currentInst;
      rawNotes.push({
        pitch: ev.pitch,
        start: ev.start,
        duration: ev.duration,
        instrumentNum: num,
        instrumentName: nameOf(num),
      });
    }
  }
}

// note-map shape used by CreateSynth before placeNote
let mapped = [
  rawNotes.map((n) => ({
    pitch: n.pitch,
    instrument: n.instrumentName,
    start: n.start,
    end: n.start + n.duration,
    volume: 95,
  })),
];
// split back into tracks roughly matching audio.tracks note groups
mapped = audio.tracks.map((track) => {
  let currentInst = audio.instrument ?? 0;
  const notes = [];
  for (const ev of track) {
    if (ev.cmd === "program") currentInst = ev.instrument;
    if (ev.cmd === "note") {
      const num = ev.instrument ?? currentInst;
      notes.push({
        pitch: ev.pitch,
        instrument: nameOf(num),
        start: ev.start,
        end: ev.start + ev.duration,
        volume: 95,
      });
    }
  }
  return notes;
});

if (params.sequenceCallback) {
  mapped = params.sequenceCallback(mapped, params.callbackContext) || mapped;
}

const shortInst = new Set();
const heldInst = new Set();
const mismatches = [];
for (const track of mapped) {
  for (const n of track) {
    const dur = n.end - n.start;
    (dur >= 0.5 ? heldInst : shortInst).add(n.instrument);
    if (expected && n.instrument !== expected) {
      mismatches.push({
        pitch: n.pitch,
        dur: +dur.toFixed(4),
        got: n.instrument,
        expected,
      });
    }
  }
}

const report = {
  midiProgram: meta.midiProgram,
  expectedSoundfont: expected,
  optionsProgram: params.program,
  cleanMidiLine: cleanAbc
    .split(/\n/)
    .find((l) => /%%MIDI\s+program/i.test(l)),
  instrumentsRawFromAbcjs: [...new Set(rawNotes.map((n) => n.instrumentName))],
  afterDeskCallback: {
    normalNotes: [...shortInst],
    heldNotes: [...heldInst],
  },
  heldSameAsNormal:
    heldInst.size === 1 &&
    shortInst.size === 1 &&
    [...heldInst][0] === [...shortInst][0] &&
    [...heldInst][0] === expected,
  mismatchCount: mismatches.length,
  mismatchSample: mismatches.slice(0, 10),
  noteCounts: {
    total: mapped.reduce((n, t) => n + t.length, 0),
    held: mapped.reduce(
      (n, t) => n + t.filter((x) => x.end - x.start >= 0.5).length,
      0,
    ),
    normal: mapped.reduce(
      (n, t) => n + t.filter((x) => x.end - x.start < 0.5).length,
      0,
    ),
  },
};

writeFileSync(".tools/instrument-audit.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
