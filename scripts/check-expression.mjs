import abcjs from "abcjs";
import { writeFileSync, mkdirSync } from "fs";
import {
  parseDeskHeaders,
  filterDecorationWarnings,
  deskAudioParams,
} from "../src/deskDialect.js";

mkdirSync(".tools", { recursive: true });

const src = `X:1
T:t
M:4/4
L:1/4
K:C
!ascent!C | !cluster!c2 !cluster5!e2 | !xhead!G | !p! !crescendo(! C D E F !crescendo)! !ff! |
!descendo(! F E D C !descendo)! !pp! | !gimplus!c |
`;

const { cleanAbc, meta, warnings } = parseDeskHeaders(src);
const tune = abcjs.parseOnly(cleanAbc)[0];
const params = deskAudioParams(meta);
const audio = tune.setUpAudio(params);

let mapped = audio.tracks.map((tr) => {
  let inst = audio.instrument ?? 0;
  const notes = [];
  for (const ev of tr) {
    if (ev.cmd === "program") inst = ev.instrument;
    if (ev.cmd === "note") {
      notes.push({
        start: ev.start,
        end: ev.start + ev.duration,
        volume: ev.volume,
        pitch: ev.pitch,
        instrument:
          abcjs.synth.instrumentIndexToName[ev.instrument ?? inst],
      });
    }
  }
  return notes;
});

const before = mapped.flat().map((n) => n.volume);
mapped = params.sequenceCallback(mapped, params.callbackContext);
const after = mapped.flat().map((n) => n.volume);

const report = {
  used: meta.decorationsUsed,
  cleanBody: cleanAbc.split(/\n/).slice(5),
  warnings: filterDecorationWarnings([
    ...(warnings || []),
    ...(tune.warnings || []),
  ]),
  hasClusterChord: /\[/.test(cleanAbc),
  hasStyleX: cleanAbc.includes("style=x"),
  hasDiminuendo: cleanAbc.includes("diminuendo"),
  noDescendoLeft: !/!descendo/i.test(cleanAbc),
  volBefore: before,
  volAfter: after,
  spreadBefore: Math.max(...before) - Math.min(...before),
  spreadAfter: Math.max(...after) - Math.min(...after),
};

writeFileSync(".tools/expr-check.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
