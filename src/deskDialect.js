import abcjs from "abcjs";

/**
 * ABC Desk dialect: loose Inst: / Tone: headers (friendly or encoded).
 * Compiles to meta + clean ABC for abcjs.
 */

const FRIENDLY_RE = /^(Inst|Tone)\s*:\s*(.*)$/i;
const ENCODED_RE =
  /^(?:%%|I:)\s*desk-(instrument|tone)\s+(.+)$/i;
const UNKNOWN_DESK_RE = /^(?:%%|I:)\s*desk-([a-z0-9-]+)\b/i;
const MIDI_PROGRAM_LINE_RE = /^%%\s*MIDI\s+program\b(.*)$/i;

/**
 * Composition decorations beyond stock abcjs.
 * Written as !name! — expanded to legal ABC so the score + synth understand them.
 */
export const DESK_DECORATIONS = {
  gimplus: {
    label: "gim+",
    expandTo: '"^gim+"!sfz!',
  },
  grit: {
    label: "grit",
    expandTo: '"^grit"!marcato!',
  },
  whisper: {
    label: "whisper",
    expandTo: '"^whisper"!pp!',
  },
  snap: {
    label: "snap",
    expandTo: '"^snap"!tenuto!!sfz!',
  },
  smear: {
    label: "smear",
    expandTo: '"^smear"!slide!',
  },
  choke: {
    label: "choke",
    expandTo: '"^choke"!wedge!',
  },
  ascent: {
    label: "ascent",
    expandTo: '"^ascent"!slide!',
  },
  xhead: {
    label: "x-head",
    expandTo: "!style=x!",
  },
  harmonic: {
    label: "harmonic",
    expandTo: "!style=harmonic!",
  },
  triangle: {
    label: "triangle",
    expandTo: "!style=triangle!",
  },
  rhythmhead: {
    label: "rhythm",
    expandTo: "!style=rhythm!",
  },
};

/** Aliases normalized before decoration expand (open/close dynamics). */
const DYNAMIC_ALIASES = [
  [/!descendo\(!/gi, "!diminuendo(!"],
  [/!descendo\)!/gi, "!diminuendo)!"],
  [/!decrescendo\(!/gi, "!diminuendo(!"],
  [/!decrescendo\)!/gi, "!diminuendo)!"],
  [/!descrescendo\(!/gi, "!diminuendo(!"],
  [/!descrescendo\)!/gi, "!diminuendo)!"],
  // Stronger hairpin spellings still map to ABC crescendo/diminuendo
  [/!cresc\(!/gi, "!crescendo(!"],
  [/!cresc\)!/gi, "!crescendo)!"],
  [/!dim\(!/gi, "!diminuendo(!"],
  [/!dim\)!/gi, "!diminuendo)!"],
];

const DESK_DECO_RE = new RegExp(
  `!(${Object.keys(DESK_DECORATIONS).join("|")})!`,
  "gi",
);

/** Chromatic-ish letter cycle for cluster building. */
const NOTE_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NOTE_LETTERS_LOWER = ["c", "d", "e", "f", "g", "a", "b"];

/** @type {Record<string, { program: number, label: string }>} */
export const INSTRUMENTS = {
  piano: { program: 0, label: "Acoustic Grand Piano" },
  "bright piano": { program: 1, label: "Bright Acoustic Piano" },
  electric: { program: 4, label: "Electric Piano" },
  harpsichord: { program: 6, label: "Harpsichord" },
  organ: { program: 19, label: "Church Organ" },
  accordion: { program: 21, label: "Accordion" },
  guitar: { program: 24, label: "Nylon Guitar" },
  "steel guitar": { program: 25, label: "Steel Guitar" },
  "jazz guitar": { program: 26, label: "Jazz Guitar" },
  bass: { program: 32, label: "Acoustic Bass" },
  "electric bass": { program: 33, label: "Electric Bass" },
  violin: { program: 40, label: "Violin" },
  viola: { program: 41, label: "Viola" },
  cello: { program: 42, label: "Cello" },
  contrabass: { program: 43, label: "Contrabass" },
  harp: { program: 46, label: "Orchestral Harp" },
  timpani: { program: 47, label: "Timpani" },
  strings: { program: 48, label: "String Ensemble" },
  trumpet: { program: 56, label: "Trumpet" },
  trombone: { program: 57, label: "Trombone" },
  tuba: { program: 58, label: "Tuba" },
  horn: { program: 60, label: "French Horn" },
  sax: { program: 65, label: "Alto Sax" },
  "alto sax": { program: 65, label: "Alto Sax" },
  "tenor sax": { program: 66, label: "Tenor Sax" },
  oboe: { program: 68, label: "Oboe" },
  bassoon: { program: 70, label: "Bassoon" },
  clarinet: { program: 71, label: "Clarinet" },
  flute: { program: 73, label: "Flute" },
  recorder: { program: 74, label: "Recorder" },
  whistle: { program: 78, label: "Whistle" },
  ocarina: { program: 79, label: "Ocarina" },
  banjo: { program: 105, label: "Banjo" },
  fiddle: { program: 110, label: "Fiddle" },
  bagpipe: { program: 109, label: "Bagpipe" },
  // Common GM FX / pad names (%%MIDI program territory)
  crystal: { program: 98, label: "FX Crystal" },
  atmosphere: { program: 99, label: "FX Atmosphere" },
  brightness: { program: 100, label: "FX Brightness" },
  goblins: { program: 101, label: "FX Goblins" },
  echoes: { program: 102, label: "FX Echoes" },
  "sci-fi": { program: 103, label: "FX Sci-Fi" },
  pad: { program: 89, label: "Pad 2 (Warm)" },
  "new age": { program: 88, label: "Pad 1 (New Age)" },
};

/** Reverse map program → best label */
const PROGRAM_LABELS = (() => {
  /** @type {Record<number, string>} */
  const map = {};
  for (const { program, label } of Object.values(INSTRUMENTS)) {
    if (map[program] == null) map[program] = label;
  }
  // Prefer atmosphere label for 99 (Song.txt “crystal synth” zone)
  map[99] = "FX Atmosphere";
  map[98] = "FX Crystal";
  return map;
})();

/** @type {Record<string, { label: string, options: Record<string, number> }>} */
export const TONES = {
  neutral: {
    label: "Neutral",
    options: { soundFontVolumeMultiplier: 1, swing: 0 },
  },
  warm: {
    label: "Warm",
    options: { soundFontVolumeMultiplier: 0.88, swing: 0 },
  },
  bright: {
    label: "Bright",
    options: { soundFontVolumeMultiplier: 1.12, swing: 0 },
  },
  soft: {
    label: "Soft",
    options: { soundFontVolumeMultiplier: 0.7, swing: 0 },
  },
  swing: {
    label: "Swing",
    options: { soundFontVolumeMultiplier: 1, swing: 0.55 },
  },
};

/**
 * @param {number} program
 * @returns {{ program: number, label: string, name: string }}
 */
export function instrumentFromProgram(program) {
  const label = PROGRAM_LABELS[program] ?? `GM ${program}`;
  return { program, label, name: String(program) };
}

/**
 * @param {string} raw
 * @returns {{ program: number, label: string, name: string } | null}
 */
export function resolveInstrument(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = INSTRUMENTS[key];
  if (hit) return { ...hit, name: key };

  const asNum = Number(key);
  if (Number.isInteger(asNum) && asNum >= 0 && asNum <= 127) {
    return instrumentFromProgram(asNum);
  }

  return null;
}

/**
 * @param {string} raw
 * @returns {{ label: string, name: string, options: Record<string, number> } | null}
 */
export function resolveTone(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = TONES[key];
  if (!hit) return null;
  return { ...hit, name: key };
}

/**
 * Expand Desk composition syntax into abcjs-legal ABC.
 * @param {string} abc
 * @returns {{ abc: string, used: string[] }}
 */
export function expandDeskDecorations(abc) {
  /** @type {string[]} */
  const used = [];
  let out = abc;

  for (const [re, replacement] of DYNAMIC_ALIASES) {
    const next = out.replace(re, replacement);
    if (next !== out) {
      const tag = /cresc/i.test(replacement) ? "crescendo" : "diminuendo";
      if (!used.includes(tag)) used.push(tag);
      out = next;
    }
  }

  out = out.replace(DESK_DECO_RE, (_, name) => {
    const key = name.toLowerCase();
    const def = DESK_DECORATIONS[key];
    if (!def) return `!${name}!`;
    if (!used.includes(key)) used.push(key);
    return def.expandTo;
  });

  const clustered = expandClusters(out);
  out = clustered.abc;
  for (const u of clustered.used) {
    if (!used.includes(u)) used.push(u);
  }

  return { abc: out, used };
}

/**
 * !cluster!c8 or !cluster5!c → chord of neighboring pitches around the note.
 * Width defaults to 5 (center ±2 chromatic-ish letter neighbors).
 */
function expandClusters(abc) {
  const used = [];
  const out = abc.replace(
    /!cluster(\d*)!([_^=]*)([A-Ga-g])([,']*)(\d*\/?\d*[<>]?)/g,
    (_, widthRaw, acc, letter, octave, dur) => {
      used.push("cluster");
      const width = Math.min(9, Math.max(3, Number(widthRaw) || 5));
      const chord = buildClusterChord(acc, letter, octave, width);
      return `"^cluster"${chord}${dur || ""}`;
    },
  );
  return { abc: out, used };
}

/**
 * Build an ABC chord [...] of neighboring scale degrees around a center note.
 * @param {string} acc
 * @param {string} letter
 * @param {string} octave
 * @param {number} width odd-ish count of notes
 */
function buildClusterChord(acc, letter, octave, width) {
  const upper = letter === letter.toUpperCase();
  const letters = upper ? NOTE_LETTERS : NOTE_LETTERS_LOWER;
  const idx = letters.indexOf(letter);
  if (idx < 0) return `[${acc}${letter}${octave}]`;

  const half = Math.floor((width - 1) / 2);
  const parts = [];
  for (let d = -half; d <= half; d++) {
    let i = idx + d;
    let oct = octave;
    // Walk commas / apostrophes across octave boundaries
    while (i < 0) {
      i += 7;
      oct = dropOctave(oct, upper);
    }
    while (i > 6) {
      i -= 7;
      oct = raiseOctave(oct, upper);
    }
    const a = d === 0 ? acc : "";
    parts.push(`${a}${letters[i]}${oct}`);
  }
  return `[${parts.join("")}]`;
}

function raiseOctave(octave, upper) {
  if (octave.includes(",")) return octave.replace(/,$/, "") || "";
  if (upper) return octave; // uppercase stays; use ' for lower register rise via letter case change — keep simple
  return `${octave}'`;
}

function dropOctave(octave, upper) {
  if (octave.includes("'")) return octave.replace(/'$/, "") || "";
  if (upper) return `${octave},`;
  return octave;
}

/**
 * Drop abcjs warnings for Desk decorations we already handle.
 * @param {string[]} warnings
 */
export function filterDecorationWarnings(warnings) {
  if (!warnings?.length) return [];
  const known = new Set([
    ...Object.keys(DESK_DECORATIONS),
    "cluster",
    "descendo",
    "decrescendo",
    "descrescendo",
    "cresc",
    "dim",
    "grit",
    "whisper",
    "snap",
    "smear",
    "choke",
  ]);
  return warnings.filter((w) => {
    const m = String(w).match(/Unknown decoration:\s*([^\s<:(!]+)/i);
    if (!m) return true;
    return !known.has(m[1].toLowerCase());
  });
}

/**
 * Parse Desk dialect headers; return clean ABC for abcjs + resolved meta.
 * Inst: / %%desk-instrument / %%MIDI program are equivalent instrument specs.
 * @param {string} source
 */
export function parseDeskHeaders(source) {
  const lines = source.split(/\r?\n/);
  const kept = [];
  const warnings = [];
  let instrumentRaw = null;
  let toneRaw = null;
  /** @type {number | null} */
  let midiProgramFromDirective = null;
  /** @type {number[]} */
  const midiProgramsFromDirectives = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const friendly = trimmed.match(FRIENDLY_RE);
    if (friendly) {
      const kind = friendly[1].toLowerCase();
      const value = friendly[2].trim();
      if (kind === "inst") instrumentRaw = value;
      else toneRaw = value;
      continue;
    }

    const encoded = trimmed.match(ENCODED_RE);
    if (encoded) {
      const kind = encoded[1].toLowerCase();
      const value = encoded[2].trim();
      if (kind === "instrument") instrumentRaw = value;
      else toneRaw = value;
      continue;
    }

    const unknownDesk = trimmed.match(UNKNOWN_DESK_RE);
    if (unknownDesk) {
      warnings.push(`Unknown Desk tag desk-${unknownDesk[1]} (ignored)`);
      continue;
    }

    // Standard abc / abcmidi instrument: %%MIDI program N  (optional inline % comment)
    const midiProg = trimmed.match(MIDI_PROGRAM_LINE_RE);
    if (midiProg) {
      const rest = midiProg[1]
        .replace(/%.*$/, "") // strip ABC inline comment
        .trim();
      // Forms: "99" or "0 99" (channel program)
      const nums = rest.match(/\d+/g);
      if (nums?.length) {
        const program = Number(nums.length >= 2 ? nums[1] : nums[0]);
        if (Number.isInteger(program) && program >= 0 && program <= 127) {
          midiProgramFromDirective = program;
          midiProgramsFromDirectives.push(program);
          // Canonical clean line — abcjs-friendly, no trailing comment noise
          kept.push(
            nums.length >= 2
              ? `%%MIDI program ${nums[0]} ${program}`
              : `%%MIDI program ${program}`,
          );
          continue;
        }
      }
      warnings.push(`Could not parse %%MIDI program line (kept as-is)`);
      kept.push(line);
      continue;
    }

    kept.push(line);
  }

  let cleanAbc = kept.join("\n");
  const fromInst = resolveInstrument(instrumentRaw);
  const tone = resolveTone(toneRaw);
  const hasMultipleMidiPrograms =
    new Set(midiProgramsFromDirectives).size > 1;

  if (instrumentRaw && !fromInst) {
    warnings.push(`Unknown Inst: “${instrumentRaw}” (try flute, violin, piano, or a GM number)`);
  }
  if (toneRaw && !tone) {
    warnings.push(`Unknown Tone: “${toneRaw}” (try warm, bright, soft, swing, neutral)`);
  }

  // Prefer explicit %%MIDI program when present; Inst: fills it in when missing.
  // Both mean “instrument” — %%MIDI is the standard spelling for abcjs/abcmidi.
  let midiProgram = hasMultipleMidiPrograms ? null : midiProgramFromDirective;
  if (hasMultipleMidiPrograms && fromInst) {
    warnings.push(
      `Inst: (${fromInst.program}) ignored because multiple %%MIDI program directives are present`,
    );
  } else if (midiProgram == null && fromInst) {
    midiProgram = fromInst.program;
    cleanAbc = injectMidiProgram(cleanAbc, fromInst.program);
  } else if (midiProgram != null) {
    if (fromInst && fromInst.program !== midiProgram) {
      warnings.push(
        `Inst: (${fromInst.program}) differs from %%MIDI program ${midiProgram} — using %%MIDI`,
      );
    }
    // Hoist to header after K: so abcjs treats it like a normal instrument setting
    cleanAbc = ensureMidiProgramInHeader(cleanAbc, midiProgram);
  }

  const instrument =
    midiProgram != null
      ? instrumentFromProgram(midiProgram)
      : fromInst;

  const { abc: withDecos, used: decorationsUsed } =
    expandDeskDecorations(cleanAbc);
  cleanAbc = withDecos;

  return {
    cleanAbc,
    meta: {
      instrument,
      tone,
      instrumentRaw,
      toneRaw,
      midiProgram: midiProgram ?? undefined,
      instrumentSource:
        hasMultipleMidiPrograms
          ? null
          : midiProgramFromDirective != null
          ? "midi"
          : fromInst
            ? "inst"
            : null,
      decorationsUsed,
    },
    warnings,
  };
}

/**
 * @param {string} abc
 * @returns {number | undefined}
 */
export function extractMidiProgram(abc) {
  const m = abc.match(/%%MIDI\s+program\s+(\d+)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Insert %%MIDI program in the tune HEADER (before K:).
 * After K:, abcjs may treat it as a body element on voice 1 only —
 * overlay voices (&) then fall back to piano. Header placement sets
 * formatting.midi.program globally for every voice.
 * @param {string} abc
 * @param {number} program
 */
function injectMidiProgram(abc, program) {
  const lines = abc.split(/\r?\n/);
  const midiLine = `%%MIDI program ${program}`;
  const without = lines.filter((l) => !MIDI_PROGRAM_LINE_RE.test(l.trim()));
  let kIndex = -1;
  for (let i = 0; i < without.length; i++) {
    if (/^K:/i.test(without[i].trim())) {
      kIndex = i;
      break;
    }
  }
  if (kIndex >= 0) {
    without.splice(kIndex, 0, midiLine);
    return without.join("\n");
  }
  // No K: yet — put near the top after X:/T: if present
  let insertAt = 0;
  for (let i = 0; i < without.length; i++) {
    const t = without[i].trim();
    if (/^[XT]:/i.test(t)) insertAt = i + 1;
    else if (/^[A-Za-z]:/.test(t) || t.startsWith("%%")) insertAt = i + 1;
    else break;
  }
  without.splice(insertAt, 0, midiLine);
  return without.join("\n");
}

/**
 * Ensure %%MIDI program is a header global shared by all voices/overlays.
 * @param {string} abc
 * @param {number} program
 */
function ensureMidiProgramInHeader(abc, program) {
  return injectMidiProgram(abc, program);
}

/**
 * Strip Desk dialect + emit strict-ish ABC (keeps injected/existing MIDI program).
 * @param {string} source
 */
export function toStrictAbc(source) {
  const { cleanAbc } = parseDeskHeaders(source);
  return cleanAbc;
}

/**
 * Soften long held notes, unify instruments, and reshape hairpin dynamics
 * so crescendo/diminuendo feel like real ramps (not shallow steps).
 * @param {Array<Array<{start:number,end:number,volume:number,instrument?:string,pitch?:number}>>} tracks
 * @param {{ forceInstrument?: string }} [ctx]
 */
export function balanceHeldNotes(tracks, ctx = {}) {
  if (!tracks?.length) return tracks;

  const REF = 0.2;
  const MIN_FACTOR = 0.28;
  const forceInst = ctx?.forceInstrument;

  if (forceInst) {
    for (const track of tracks) {
      for (const note of track) {
        if (note.pitch != null) note.instrument = forceInst;
      }
    }
  }

  enhanceDynamicRamps(tracks);

  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null || note.end == null) continue;
      const dur = Math.max(0.001, note.end - note.start);
      if (dur <= REF) continue;
      const factor = Math.max(MIN_FACTOR, Math.pow(REF / dur, 0.55));
      note.volume = Math.max(12, Math.round(note.volume * factor));
    }
  }

  const buckets = new Map();
  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null) continue;
      const key = Math.round(note.start * 64);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(note);
    }
  }
  for (const group of buckets.values()) {
    if (group.length < 3) continue;
    const stackFactor = Math.max(0.4, 1 / Math.sqrt(group.length * 0.55));
    for (const note of group) {
      note.volume = Math.max(12, Math.round(note.volume * stackFactor));
    }
  }

  return tracks;
}

/**
 * Find stepwise crescendo/diminuendo runs and reshape to a stronger curve.
 * abcjs only bumps ~50 velocity over the span; we stretch and ease it.
 */
function enhanceDynamicRamps(tracks) {
  for (const track of tracks) {
    if (!track?.length) continue;
    const notes = track
      .filter((n) => n.volume != null && n.start != null)
      .sort((a, b) => a.start - b.start || (a.end ?? 0) - (b.end ?? 0));
    if (notes.length < 3) continue;

    let i = 0;
    while (i < notes.length - 2) {
      const dir = Math.sign(notes[i + 1].volume - notes[i].volume);
      if (dir === 0) {
        i++;
        continue;
      }
      let j = i + 1;
      while (
        j < notes.length - 1 &&
        Math.sign(notes[j + 1].volume - notes[j].volume) === dir
      ) {
        j++;
      }
      const span = j - i;
      if (span >= 2) {
        reshapeRamp(notes.slice(i, j + 1), dir);
      }
      i = Math.max(j, i + 1);
    }
  }
}

/**
 * @param {Array<{volume:number}>} run
 * @param {number} dir +1 crescendo, -1 diminuendo
 */
function reshapeRamp(run, dir) {
  const first = run[0].volume;
  const last = run[run.length - 1].volume;
  let lo = Math.min(first, last);
  let hi = Math.max(first, last);
  // Widen the expressive range (more crescendo-like / diminuendo-like)
  if (dir > 0) {
    lo = Math.max(18, lo - 8);
    hi = Math.min(127, hi + 18);
  } else {
    lo = Math.max(14, lo - 18);
    hi = Math.min(120, hi + 8);
  }
  const n = run.length - 1;
  for (let k = 0; k < run.length; k++) {
    const t = k / n;
    // Ease-in-out: slow start, strong middle swell / sink
    const eased = t * t * (3 - 2 * t);
    const shaped = dir > 0 ? eased : 1 - eased;
    // Mix curve toward destination more aggressively than linear
    const v = lo + (hi - lo) * Math.pow(shaped, dir > 0 ? 0.85 : 1.1);
    run[k].volume = Math.max(12, Math.min(127, Math.round(v)));
  }
}

/**
 * @param {number} program
 * @returns {string | undefined}
 */
export function programToSoundfontName(program) {
  if (program == null || program < 0 || program > 127) return undefined;
  const table = abcjs.synth?.instrumentIndexToName;
  if (Array.isArray(table) && table[program]) return table[program];
  return undefined;
}

/**
 * Synth options derived from Desk meta.
 * Instrument comes from %%MIDI program in the ABC (Inst: compiles to that).
 * Do not pass options.program — it fights / shadows the standard directive.
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone>, midiProgram?: number }} meta
 */
export function deskAudioParams(meta) {
  const program = meta.midiProgram ?? meta.instrument?.program;
  const forceInstrument = programToSoundfontName(program);

  const options = {
    chordsOff: false,
    fadeLength: 320,
    callbackContext: { forceInstrument },
    sequenceCallback: (tracks, ctx) =>
      balanceHeldNotes(tracks, {
        forceInstrument: ctx?.forceInstrument ?? forceInstrument,
      }),
  };

  // Shared default for EVERY voice/overlay startVoice. Without this, & overlays
  // keep piano when %%MIDI was only applied as a body event on voice 1.
  if (program != null) {
    options.program = program;
  }

  if (meta.tone) {
    Object.assign(options, meta.tone.options);
  }

  // GM FX / pad / crystal range — samples are very hot when sustained
  if (program != null && program >= 88 && program <= 103) {
    const base = options.soundFontVolumeMultiplier ?? 1;
    options.soundFontVolumeMultiplier = Math.min(base, 0.55);
    options.fadeLength = Math.max(options.fadeLength ?? 200, 450);
  }

  if (options.swing === 0) delete options.swing;
  return options;
}

/**
 * Short status fragment for Inst/Tone / %%MIDI program / Desk decorations.
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone>, instrumentSource?: string | null, decorationsUsed?: string[] }} meta
 */
export function deskStatusFragment(meta) {
  const parts = [];
  if (meta.instrument) {
    const via =
      meta.instrumentSource === "midi"
        ? "%%MIDI"
        : meta.instrumentSource === "inst"
          ? "Inst"
          : "GM";
    parts.push(`${meta.instrument.label} · ${via} ${meta.instrument.program}`);
  }
  if (meta.tone) {
    parts.push(`Tone ${meta.tone.label}`);
  }
  if (meta.decorationsUsed?.length) {
    const labels = meta.decorationsUsed.map((k) => {
      if (DESK_DECORATIONS[k]?.label) return DESK_DECORATIONS[k].label;
      if (k === "cluster") return "cluster";
      if (k === "crescendo") return "cresc.";
      if (k === "diminuendo") return "dim.";
      return k;
    });
    parts.push(`deco ${labels.join(", ")}`);
  }
  return parts.join(" · ");
}
