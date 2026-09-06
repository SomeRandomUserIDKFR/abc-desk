import abcjs from "abcjs";

/**
 * ABC Desk dialect: loose Inst: / Tone: headers (friendly or encoded).
 * Compiles to meta + clean ABC for abcjs.
 */

const FRIENDLY_RE =
  /^(Inst|Tone|Human|Imperfect|Room|Distance|Players)\s*:\s*(.*)$/i;
const ENCODED_RE =
  /^(?:%%|I:)\s*desk-(instrument|tone|human|imperfect|room|distance|players)\s+(.+)$/i;
const UNKNOWN_DESK_RE = /^(?:%%|I:)\s*desk-([a-z0-9-]+)\b/i;
const MIDI_PROGRAM_LINE_RE = /^%%\s*MIDI\s+program\b(.*)$/i;
const DRUM_FRIENDLY_RE = /^(Drum1|Drum2)\s*:\s*(.*)$/i;
const DRUM_ENCODED_RE = /^(?:%%|I:)\s*desk-drum(1|2)\s+(.+)$/i;
const DRUM_MARKER_RE = /^\s*(?:!([oOpP])!|([oOpP]))(?=$|[\s|:\]\)\}\/,;])/;

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
  staccato: {
    label: "staccato",
    expandTo: "!staccato!",
  },
  tenuto: {
    label: "tenuto",
    expandTo: "!tenuto!",
  },
  marcato: {
    label: "marcato",
    expandTo: "!marcato!",
  },
  tremolo: {
    label: "tremolo",
    expandTo: "!tremolo!",
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
  viol: { program: 41, label: "Viola" },
  cello: { program: 42, label: "Cello" },
  chello: { program: 42, label: "Cello" },
  violoncello: { program: 42, label: "Cello" },
  contrabass: { program: 43, label: "Contrabass" },
  "double bass": { program: 43, label: "Double Bass" },
  "double-bass": { program: 43, label: "Double Bass" },
  harp: { program: 46, label: "Orchestral Harp" },
  timpani: { program: 47, label: "Timpani" },
  // Keep the adaptive alias on the exact violin metadata path. Register-aware
  // behavior is applied later, without changing the loaded instrument identity.
  string: { program: 40, label: "Violin" },
  strings: { program: 48, label: "String Ensemble" },
  trumpet: { program: 56, label: "Trumpet" },
  trump: { program: 56, label: "Trumpet" },
  cornet: { program: 56, label: "Trumpet" },
  bugle: { program: 56, label: "Trumpet" },
  flugelhorn: { program: 56, label: "Trumpet" },
  trombone: { program: 57, label: "Trombone" },
  baritone: { program: 57, label: "Trombone" },
  euphonium: { program: 57, label: "Trombone" },
  tuba: { program: 58, label: "Tuba" },
  horn: { program: 60, label: "French Horn" },
  "french horn": { program: 60, label: "French Horn" },
  "tenor horn": { program: 60, label: "French Horn" },
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

const DRUM_SOUNDS = {
  "acoustic-snare": 38,
  snare: 38,
  "bass-drum-1": 36,
  bassdrum: 36,
  kick: 36,
  "closed-hi-hat": 42,
  "open-hi-hat": 46,
  "pedal-hi-hat": 44,
  "hand-clap": 39,
  "side-stick": 37,
  "electric-snare": 40,
  "low-floor-tom": 41,
  "high-floor-tom": 43,
  "low-tom": 45,
  "low-mid-tom": 47,
  "hi-mid-tom": 48,
  "high-tom": 50,
  "crash-cymbal-1": 49,
  "ride-cymbal-1": 51,
  tambourine: 54,
  cowbell: 56,
  maracas: 70,
  claves: 75,
  "wood-block": 76,
  "hi-wood-block": 76,
  "low-wood-block": 77,
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

const WOODWIND_PROGRAMS = new Set([68, 70, 71, 73, 74, 78, 79]);
const WOODWIND_NAMES = new Set([
  "oboe",
  "bassoon",
  "clarinet",
  "flute",
  "recorder",
  "whistle",
  "ocarina",
]);

const STRING_NAMES = new Set([
  "violin",
  "viola",
  "cello",
  "contrabass",
  "fiddle",
  "string-ensemble-1",
  "string-ensemble-2",
  "synth-strings-1",
  "synth-strings-2",
  "pizzicato-strings",
  "tremolo-strings",
  "string",
  "strings",
]);

const BRASS_NAMES = new Set([
  "trumpet",
  "muted-trumpet",
  "trombone",
  "tuba",
  "french-horn",
  "brass-section",
  "synth-brass-1",
  "synth-brass-2",
  "cornet",
  "bugle",
  "flugelhorn",
  "baritone",
  "euphonium",
  "horn",
]);

const BASS_NAMES = new Set([
  "acoustic-bass",
  "electric-bass-finger",
  "electric-bass-pick",
  "fretless-bass",
  "slap-bass-1",
  "slap-bass-2",
  "synth-bass-1",
  "synth-bass-2",
  "contrabass",
  "tuba",
]);

const FX_NAMES = new Set([
  "fx-rain",
  "fx-soundtrack",
  "fx-crystal",
  "fx-atmosphere",
  "fx-brightness",
  "fx-goblins",
  "fx-echoes",
  "fx-scifi",
  "pad-1-new-age",
  "pad-2-warm",
  "pad-3-polysynth",
  "pad-4-choir",
  "pad-5-bowed",
  "pad-6-metallic",
  "pad-7-halo",
  "pad-8-sweep",
]);

const KEYBOARD_NAMES = new Set([
  "piano",
  "acoustic-grand-piano",
  "bright-piano",
  "bright-acoustic-piano",
  "electric-piano",
  "harpsichord",
  "organ",
  "accordion",
  "keyboard",
]);

const KEYBOARD_PITCH_RANGE = {
  min: 21, // A0
  max: 108, // C8
};

/** @type {Record<string, { label: string, options: Record<string, number> }>} */
export const TONES = {
  neutral: {
    label: "Neutral",
    options: { soundFontVolumeMultiplier: 1, swing: 0, fadeLength: 320 },
    toneMix: { attack: 1, sustain: 1, shortBoost: 1, holdBias: 1 },
  },
  warm: {
    label: "Warm",
    options: { soundFontVolumeMultiplier: 0.78, swing: 0, fadeLength: 420 },
    toneMix: { attack: 0.88, sustain: 0.84, shortBoost: 0.8, holdBias: 0.8 },
  },
  bright: {
    label: "Bright",
    options: { soundFontVolumeMultiplier: 1.35, swing: 0, fadeLength: 220 },
    toneMix: { attack: 1.28, sustain: 1.12, shortBoost: 1.2, holdBias: 1.08 },
  },
  soft: {
    label: "Soft",
    options: { soundFontVolumeMultiplier: 0.58, swing: 0, fadeLength: 520 },
    toneMix: { attack: 0.72, sustain: 0.7, shortBoost: 0.68, holdBias: 0.66 },
  },
  rustic: {
    label: "Rustic",
    options: { soundFontVolumeMultiplier: 0.85, swing: 0.12, fadeLength: 360 },
    toneMix: { attack: 1.05, sustain: 0.9, shortBoost: 1.08, holdBias: 0.88 },
  },
  upbeat: {
    label: "Upbeat",
    options: { soundFontVolumeMultiplier: 1.18, swing: 0.25, fadeLength: 260 },
    toneMix: { attack: 1.24, sustain: 1.06, shortBoost: 1.3, holdBias: 1.08 },
  },
  sorrow: {
    label: "Sorrow",
    options: { soundFontVolumeMultiplier: 0.62, swing: 0, fadeLength: 620 },
    toneMix: { attack: 0.75, sustain: 0.6, shortBoost: 0.7, holdBias: 0.58 },
  },
  emotional: {
    label: "Emotional",
    options: { soundFontVolumeMultiplier: 0.92, swing: 0.08, fadeLength: 560 },
    toneMix: { attack: 0.92, sustain: 0.78, shortBoost: 0.86, holdBias: 0.74 },
  },
  aggressive: {
    label: "Aggressive",
    options: { soundFontVolumeMultiplier: 1.35, swing: 0, fadeLength: 180 },
    toneMix: { attack: 1.9, sustain: 1.1, shortBoost: 1.65, holdBias: 1.2, articulation: 1.05 },
  },
  swing: {
    label: "Swing",
    options: { soundFontVolumeMultiplier: 1.08, swing: 0.55, fadeLength: 240 },
    toneMix: { attack: 1.18, sustain: 1.02, shortBoost: 1.25, holdBias: 1.04 },
  },
};

export const ROOMS = {
  dry: { label: "Dry", decay: 0.15, mix: 0, predelay: 0, damping: 0.2, earlyLevel: 0, width: 0 },
  studio: { label: "Studio", decay: 0.35, mix: 0.08, predelay: 0.008, damping: 0.28, earlyLevel: 0.08, width: 0.35 },
  chamber: { label: "Chamber", decay: 0.8, mix: 0.14, predelay: 0.014, damping: 0.34, earlyLevel: 0.13, width: 0.55 },
  concert: { label: "Concert Hall", decay: 2.05, mix: 0.24, predelay: 0.022, damping: 0.42, earlyLevel: 0.22, width: 0.82 },
  cathedral: { label: "Cathedral", decay: 3.2, mix: 0.28, predelay: 0.032, damping: 0.52, earlyLevel: 0.2, width: 0.9 },
};

const TONE_ALIASES = {
  agressive: "aggressive",
};

const DEFAULT_DRUM_1 = resolveDrumSound("acoustic-snare");
const DEFAULT_DRUM_2 = resolveDrumSound("bass-drum-1");

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
  const normalized = TONE_ALIASES[key] ?? key;
  const hit = TONES[normalized];
  if (!hit) return null;
  return { ...hit, name: normalized };
}

export function resolveRoom(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-");
  const hit = ROOMS[key];
  return hit ? { ...hit, name: key } : null;
}

export function resolveDistance(raw) {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

export function resolvePlayers(raw) {
  const value = Number(raw);
  return Number.isInteger(value) ? Math.max(1, Math.min(32, value)) : null;
}

/**
 * @param {string} raw
 * @returns {{ label: string, name: string, amount: number } | null}
 */
export function resolveHumanization(raw) {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key || key === "off" || key === "false" || key === "none") {
    return { label: "Human 0", name: "human", amount: 0 };
  }
  if (key === "on" || key === "true" || key === "human" || key === "imperfect") {
    return { label: "Human 0.45", name: "human", amount: 0.45 };
  }
  const numeric = key.match(/(?:human|imperfect)?\s*([01](?:\.\d+)?|\.\d+)/i);
  if (!numeric) return null;
  const amount = Math.max(0, Math.min(1, Number(numeric[1])));
  if (!Number.isFinite(amount)) return null;
  return { label: `Human ${amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`, name: "human", amount };
}

/**
 * @param {string} raw
 * @returns {{ pitch: number, label: string, name: string } | null}
 */
export function resolveDrumSound(raw) {
  if (!raw) return null;
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  const midi = Number(key);
  if (Number.isInteger(midi) && midi >= 35 && midi <= 81) {
    return { pitch: midi, label: `Drum ${midi}`, name: key };
  }
  const hit = DRUM_SOUNDS[key];
  if (!hit) return null;
  return { pitch: hit, label: key.replace(/-/g, " "), name: key };
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

  function violinBowCycle(note, duration, seed, amount) {
    const pitch = Number(note.pitch);
    const register = Number.isFinite(pitch) ? Math.max(-1, Math.min(1, (pitch - 67) / 24)) : 0;
    const bowLength = 0.55 + stableUnitNoise(`${seed}:bow-length`) * 0.35;
    const bowPhase = stableUnitNoise(`${seed}:bow-phase`) * Math.PI * 2;
    const cycle = Math.sin((duration / bowLength) * Math.PI * 1.6 + bowPhase);
    const settling = duration > 0.3 ? Math.min(1, (duration - 0.3) / 1.4) : 0;
    const pressure = cycle * 0.035 * settling;
    const registerResponse = register * 0.012 * Math.min(1, duration * 2);
    return 1 + (pressure + registerResponse) * amount;
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
    "o",
    "p",
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
  let humanRaw = null;
  let roomRaw = null;
  let distanceRaw = null;
  let playersRaw = null;
  let drum1Raw = null;
  let drum2Raw = null;
  /** @type {number | null} */
  let midiProgramFromDirective = null;
  /** @type {number | null} */
  let firstMidiProgramFromDirective = null;
  /** @type {number[]} */
  const midiProgramsFromDirectives = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const friendly = trimmed.match(FRIENDLY_RE);
    if (friendly) {
      const kind = friendly[1].toLowerCase();
      const value = friendly[2].trim();
      if (kind === "inst") instrumentRaw = value;
      else if (kind === "tone") toneRaw = value;
      else if (kind === "human" || kind === "imperfect") humanRaw = value;
      else if (kind === "room") roomRaw = value;
      else if (kind === "distance") distanceRaw = value;
      else playersRaw = value;
      continue;
    }

    const encoded = trimmed.match(ENCODED_RE);
    if (encoded) {
      const kind = encoded[1].toLowerCase();
      const value = encoded[2].trim();
      if (kind === "instrument") instrumentRaw = value;
      else if (kind === "tone") toneRaw = value;
      else if (kind === "human" || kind === "imperfect") humanRaw = value;
      else if (kind === "room") roomRaw = value;
      else if (kind === "distance") distanceRaw = value;
      else playersRaw = value;
      continue;
    }

    const drumFriendly = trimmed.match(DRUM_FRIENDLY_RE);
    if (drumFriendly) {
      const kind = drumFriendly[1].toLowerCase();
      const value = drumFriendly[2].trim();
      if (kind === "drum1") drum1Raw = value;
      else drum2Raw = value;
      continue;
    }

    const drumEncoded = trimmed.match(DRUM_ENCODED_RE);
    if (drumEncoded) {
      const kind = drumEncoded[1];
      const value = drumEncoded[2].trim();
      if (kind === "1") drum1Raw = value;
      else drum2Raw = value;
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
          if (firstMidiProgramFromDirective == null) {
            firstMidiProgramFromDirective = program;
          }
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
  const inlineToneChanges = [];
  cleanAbc = cleanAbc.replace(/\[Tone\s*:\s*([^\]]+)\]/gi, (match, rawTone, offset) => {
    const tone = resolveTone(rawTone);
    if (tone) {
      inlineToneChanges.push({ at: offset, tone });
    } else {
      warnings.push(
        `Unknown inline Tone: "${rawTone.trim()}" (try warm, bright, soft, sorrow, emotional, or neutral)`,
      );
    }
    return " ".repeat(match.length);
  });
  const fromInst = resolveInstrument(instrumentRaw);
  const tone = resolveTone(toneRaw);
  const humanize = resolveHumanization(humanRaw);
  const room = resolveRoom(roomRaw);
  const distance = resolveDistance(distanceRaw);
  const players = resolvePlayers(playersRaw);
  const drum1 = drum1Raw ? (resolveDrumSound(drum1Raw) ?? DEFAULT_DRUM_1) : undefined;
  const drum2 = drum2Raw ? (resolveDrumSound(drum2Raw) ?? DEFAULT_DRUM_2) : undefined;
  const hasMultipleMidiPrograms =
    new Set(midiProgramsFromDirectives).size > 1;

  if (instrumentRaw && !fromInst) {
    warnings.push(`Unknown Inst: “${instrumentRaw}” (try flute, violin, piano, or a GM number)`);
  }
  if (toneRaw && !tone) {
    warnings.push(`Unknown Tone: “${toneRaw}” (try warm, bright, soft, rustic, upbeat, sorrow, emotional, aggressive, swing, neutral)`);
  }
  if (humanRaw && !humanize) {
    warnings.push(`Unknown Human/Imperfect amount: “${humanRaw}” (try 0.35, 0.6, on, or off)`);
  }
  if (roomRaw && !room) {
    warnings.push(`Unknown Room: “${roomRaw}” (try dry, studio, chamber, concert, or cathedral)`);
  }
  if (distanceRaw && distance == null) {
    warnings.push(`Unknown Distance: “${distanceRaw}” (use a value from 0 to 1)`);
  }
  if (playersRaw && players == null) {
    warnings.push(`Unknown Players: “${playersRaw}” (use a whole number from 1 to 32)`);
  }
  if (drum1Raw && !resolveDrumSound(drum1Raw)) {
    warnings.push(`Unknown Drum1: “${drum1Raw}” (try acoustic-snare, bass-drum-1, closed-hi-hat, or a MIDI drum number 35-81)`);
  }
  if (drum2Raw && !resolveDrumSound(drum2Raw)) {
    warnings.push(`Unknown Drum2: “${drum2Raw}” (try acoustic-snare, bass-drum-1, closed-hi-hat, or a MIDI drum number 35-81)`);
  }

  // Prefer explicit %%MIDI program when present; Inst: fills it in when missing.
  // Both mean “instrument” — %%MIDI is the standard spelling for abcjs/abcmidi.
  let midiProgram = firstMidiProgramFromDirective;
  if (hasMultipleMidiPrograms && fromInst) {
    warnings.push(
      `Inst: “${instrumentRaw}” (program ${fromInst.program}) ignored because multiple %%MIDI program directives are present; keep one %%MIDI program if you want a single shared instrument`,
    );
  } else if (midiProgram == null && fromInst) {
    midiProgram = fromInst.program;
    cleanAbc = injectMidiProgram(cleanAbc, fromInst.program);
  } else if (midiProgram != null && !hasMultipleMidiPrograms) {
    if (fromInst && fromInst.program !== midiProgram) {
      warnings.push(
        `Inst: (${fromInst.program}) differs from %%MIDI program ${midiProgram} — using %%MIDI`,
      );
    }
    // Hoist to header after K: so abcjs treats it like a normal instrument setting
    cleanAbc = ensureMidiProgramInHeader(cleanAbc, midiProgram);
  }

  const instrument =
    hasMultipleMidiPrograms
      ? null
      : fromInst?.adaptive
      ? fromInst
      : fromInst?.soundfont
      ? fromInst
      : midiProgram != null
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
      humanize,
      instrumentRaw,
      toneRaw,
      humanRaw,
      room,
      inlineToneChanges,
      roomRaw,
      distance,
      distanceRaw,
      players,
      playersRaw,
      midiProgram: midiProgram ?? undefined,
      hasMultipleMidiPrograms,
      instrumentSource:
        hasMultipleMidiPrograms
          ? null
          : midiProgramFromDirective != null
          ? "midi"
          : fromInst
            ? "inst"
            : null,
      drum1,
      drum2,
      drum1Raw,
      drum2Raw,
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

  const toneMix = ctx?.tone?.toneMix ?? {};
  const inlineToneChanges = [...(ctx?.inlineToneChanges ?? [])].sort((a, b) => a.at - b.at);
  const humanize = ctx?.humanize;
  const humanAmount = Math.max(0, Math.min(1, Number(humanize?.amount ?? 0) * 2));

  // Note durations from abcjs are in whole notes; 2 quarter-note beats in 4/4
  // is 1/2 of a whole note.
  const HOLD_THRESHOLD = 0.5;
  const HOLD_SPAN = 1.5;
  const MIN_FACTOR = 0.9;
  const forceInst = ctx?.forceInstrument;

  const adaptiveStrings = Boolean(ctx?.adaptiveStrings);
  if (forceInst && !adaptiveStrings) {
    for (const track of tracks) {
      for (const note of track) {
        if (note.pitch != null) note.instrument = forceInst;
      }
    }
  }

  for (const track of tracks) {
    for (const note of track) {
      clampPitchForSoundfont(note);
    }
  }

  enhanceDynamicRamps(tracks, humanAmount);

  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null || note.end == null) continue;
      const dur = Math.max(0.001, note.end - note.start);
      const family = instrumentFamily(note.instrument);
      const profile = familyMixProfile(family);
      const inlineTone = inlineToneChanges
        .filter((change) => note.startChar == null || change.at <= note.startChar)
        .at(-1)?.tone;
      const noteToneMix = inlineTone?.toneMix ?? toneMix;
      let factor = profile.base;
      if (dur > HOLD_THRESHOLD) {
        const t = Math.min(1, (dur - HOLD_THRESHOLD) / HOLD_SPAN);
        const holdToneFactor = dur > HOLD_THRESHOLD ? (noteToneMix.holdBias ?? 1) : 1;
        factor *=
          Math.max(
            MIN_FACTOR,
            profile.holdBase - profile.holdDepth * Math.pow(t, family === "strings" ? 0.9 : 0.8),
          ) * holdToneFactor * (noteToneMix.sustain ?? 1);
      } else {
        factor *= (profile.shortBoost ?? 1) * (noteToneMix.shortBoost ?? 1) * (noteToneMix.attack ?? 1);
      }
      if (family === "strings" && noteToneMix.attack && noteToneMix.attack > 1.5) {
        factor *= 1.24;
      }
      if (family === "strings" && noteToneMix.articulation) {
        factor *= Math.min(1.7, 1 + noteToneMix.articulation * 0.18);
      }
      if (profile.highCut && note.pitch >= profile.highCut) {
        factor *= family === "woodwind" && note.pitch >= profile.highCut + 4 ? 0.9 : 0.95;
      }
      if (family === "brass" && note.pitch != null && note.pitch <= 50) {
        factor *= 1.03;
      }
      const volumeCap = (noteToneMix.attack ?? 1) > 1.5 ? 108 : 118;
      note.volume = Math.max(12, Math.min(volumeCap, Math.round(note.volume * factor)));
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
    const family = group.some((note) => isWoodwindInstrument(note.instrument))
      ? "woodwind"
      : group.some((note) => instrumentFamily(note.instrument) === "brass")
      ? "brass"
      : group.some((note) => instrumentFamily(note.instrument) === "strings")
      ? "strings"
      : group.some((note) => instrumentFamily(note.instrument) === "bass")
      ? "bass"
      : "other";
    const profile = familyMixProfile(family);
    const stackFactor = Math.max(
      profile.stackFactor,
      1 / Math.sqrt(group.length * 0.55),
    );
    const chordPenalty = group.length >= 4 ? Math.max(0.52, 1.1 / Math.sqrt(group.length)) : 1;
    for (const note of group) {
      note.volume = Math.max(12, Math.round(note.volume * stackFactor * chordPenalty));
    }
  }

  varyBowedStringDoubleStops(tracks, humanAmount);

  const pitchBuckets = new Map();
  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null || note.pitch == null) continue;
      const key = `${Math.round(note.start * 64)}:${note.pitch}`;
      if (!pitchBuckets.has(key)) pitchBuckets.set(key, []);
      pitchBuckets.get(key).push(note);
    }
  }
  for (const group of pitchBuckets.values()) {
    if (group.length < 2) continue;
    const family = group.some((note) => isWoodwindInstrument(note.instrument))
      ? "woodwind"
      : group.some((note) => instrumentFamily(note.instrument) === "brass")
      ? "brass"
      : group.some((note) => instrumentFamily(note.instrument) === "strings")
      ? "strings"
      : group.some((note) => instrumentFamily(note.instrument) === "bass")
      ? "bass"
      : "other";
    const profile = familyMixProfile(family);
    const pitchFactor = Math.max(
      profile.unisonFactor,
      (family === "woodwind" ? 0.84 : family === "brass" ? 0.88 : 0.9) -
        (family === "bass" ? 0.015 : family === "strings" ? 0.025 : 0.04) *
          Math.min(3, group.length - 2),
    );
    for (const note of group) {
      note.volume = Math.max(12, Math.round(note.volume * pitchFactor));
    }
  }

  const sameStartBuckets = new Map();
  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null) continue;
      const key = Math.round(note.start * 64);
      if (!sameStartBuckets.has(key)) sameStartBuckets.set(key, []);
      sameStartBuckets.get(key).push(note);
    }
  }
  for (const track of tracks) {
    for (const note of track) {
      if (note.volume == null || note.start == null || note.end == null) continue;
      const dur = Math.max(0.001, note.end - note.start);
      if (dur > HOLD_THRESHOLD) continue;
      const family = instrumentFamily(note.instrument);
      const simultaneousCount = sameStartBuckets.get(Math.round(note.start * 64))?.length ?? 1;
      const denseChordFactor = simultaneousCount >= 4 ? 0.48 : simultaneousCount >= 3 ? 0.72 : 1;
      const shortBase = family === "woodwind"
        ? 1.18
        : family === "strings"
        ? 1.2
        : family === "brass"
        ? 1.24
        : family === "bass"
        ? 1.08
        : 1.18;
      const articulationBoost = family === "strings"
        ? (toneMix.articulation ?? 1) * 0.6
        : 0;
      const attackBoost = family === "strings" ? (toneMix.attack ?? 1) * 0.25 : 0;
      const shortFactor =
        (shortBase + articulationBoost * 0.4 + attackBoost) * denseChordFactor;
      let volume = Math.max(14, Math.round(note.volume * shortFactor));
      if (family === "strings" && dur <= 0.25) {
        const aggressiveTransient = simultaneousCount >= 4 ? 0.25 : 1;
        volume = Math.max(
          16,
          Math.min(
            108,
            Math.round(
              volume * (1 + (toneMix.attack ?? 1) * 0.08 + (toneMix.articulation ?? 1) * 0.06) * aggressiveTransient + 5,
            ),
          ),
        );
      }
      note.volume = Math.min(108, volume);
    }
  }

  applyHumanization(tracks, humanize);
  if (ctx?.experimentalPerformance) {
    shapeExperimentalPerformance(
      tracks,
      humanAmount,
      ctx?.players,
      ctx?.expressionExpansion,
    );
    applyBowedStringArticulation(tracks, humanAmount);
    expandEnsembleTracks(tracks, ctx?.players, humanAmount);
  }
  for (const track of tracks) {
    track.sort((a, b) => {
      const aStart = Number(a.start);
      const bStart = Number(b.start);
      if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return 0;
      return aStart - bStart;
    });
  }

  function shapeExperimentalPerformance(
    tracks,
    humanAmount,
    players = 1,
    expressionExpansion = false,
  ) {
    const playerCount = Math.max(1, Math.min(32, Number(players) || 1));
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const track = tracks[trackIndex];
      const notes = track.filter(
        (event) =>
          event.cmd === "note" &&
          event.pitch != null &&
          Number.isFinite(Number(event.start)) &&
          Number.isFinite(Number(event.end)),
      );
      if (!notes.length) continue;

      const phraseProfile = createPlayerPhraseProfile(playerCount, trackIndex);
      const trackTimingNoise = stableSignedNoise(
        `track-timing:${playerCount}:${trackIndex}`,
      );
      const trackTimingOffset =
        trackTimingNoise * (0.0025 + stableUnitNoise(`track-timing-width:${trackIndex}`) * 0.005) *
        Math.sqrt(humanAmount);
      let phraseStart = 0;
      for (let index = 0; index < notes.length; index++) {
        const note = notes[index];
        const next = notes[index + 1];
        const duration = Math.max(0.001, note.end - note.start);
        const gap = next ? Math.max(0, next.start - note.end) : 0;
        const previous = notes[index - 1];
        const leap = previous ? Math.abs(Number(note.pitch) - Number(previous.pitch)) : 0;
        if (index > 0 && (gap > phraseProfile.gapThreshold || leap >= phraseProfile.leapThreshold || duration > 2.5)) {
          phraseStart = index;
        }
        const phraseLength = Math.max(1, Math.min(12, index - phraseStart + 1));
        const phrasePosition =
          phraseLength <= 1
            ? phraseProfile.arcOffset
            : Math.min(1, (index - phraseStart) / phraseProfile.arcSpan);
        const arc = Math.max(
          0,
          Math.min(1, Math.sin((phrasePosition + phraseProfile.arcOffset) * Math.PI)),
        );
        const expressionArc = expressionExpansion
          ? 1 + (arc - 0.25) * phraseProfile.expressionDepth * humanAmount
          : 1;
        const playerNoise = stableSignedNoise(
          `player:${playerCount}:${trackIndex}:${index}:${note.start}:${note.pitch}`,
        );
        const breath = Math.sin(note.start * phraseProfile.breathRate + phraseProfile.breathPhase);
        const playerTiming =
          playerCount > 1
            ? (playerNoise * 0.003 + breath * phraseProfile.timingBreath) * humanAmount
            : 0;
        const lowStringResponse =
          isSlowResponseBowedString(note.instrument)
            ? (0.0025 + stableUnitNoise(`low-string-latency:${trackIndex}:${index}`) * 0.005) *
              humanAmount
            : 0;
        const timingOffset = trackTimingOffset + playerTiming + lowStringResponse;
        note.start = Math.max(0, note.start + timingOffset);
        note.end = Math.max(note.start + 0.01, note.end + timingOffset);

        if (note.volume != null) {
          const phraseFactor =
            (0.91 + arc * phraseProfile.arcDepth * humanAmount) * expressionArc;
          const expressionNoise = stableSignedNoise(
            `expression-lane:${phraseProfile.seed}:${index}:${note.start}:${note.pitch}`,
          );
          const playerFactor =
            1 + playerNoise * Math.min(0.06, (playerCount - 1) * 0.006) * humanAmount;
          const expressionFactor =
            phraseFactor * (1 + expressionNoise * 0.018 * humanAmount);
          note.volume = Math.max(
            10,
            Math.min(118, Math.round(note.volume * expressionFactor * playerFactor)),
          );
          note.expressionCurve = Math.round(expressionFactor * 1000) / 1000;
          if (isBowedStringInstrument(note.instrument)) {
            const register = Math.max(0, Math.min(1, (Number(note.pitch) - 48) / 48));
            const bridgePosition = stableSignedNoise(
              `bow-bridge:${phraseProfile.seed}:${index}:${note.pitch}`,
            );
            const bowSpeed = stableSignedNoise(
              `bow-speed:${phraseProfile.seed}:${index}:${note.pitch}`,
            );
            const engagement =
              (bridgePosition * 0.035 + bowSpeed * 0.025) *
              (0.55 + register * 0.45) *
              humanAmount;
            const attack = Math.max(
              0.004,
              Math.min(0.06, 0.012 + (1 - register) * 0.012 + bowSpeed * 0.004),
            );
            const release = Math.max(
              0.018,
              Math.min(0.12, 0.045 + register * 0.025 + bridgePosition * 0.01),
            );
            note.volume = Math.max(
              10,
              Math.min(118, Math.round(note.volume * (1 + engagement))),
            );
            note.bowEngagement = Math.round((0.5 + engagement) * 100) / 100;
            note.bowEnvelope = {
              attack: Math.round(attack * 1000) / 1000,
              sustain: Math.round((1 + engagement * 0.8) * 1000) / 1000,
              release: Math.round(release * 1000) / 1000,
            };
          }
        }

        if (gap > 0.025 && duration < 2) {
          const release = expressionExpansion ? 0.55 : 0.35;
          note.end = Math.max(
            note.start + 0.01,
            note.end - Math.min(0.06, gap * release * humanAmount),
          );
        }

        if (expressionExpansion && note.volume != null && duration >= 0.3) {
          const sustain =
            1 +
            Math.sin(index * phraseProfile.sustainRate + phraseProfile.breathPhase) *
              phraseProfile.sustainDepth *
              humanAmount;
          note.volume = Math.max(10, Math.min(118, Math.round(note.volume * sustain)));
        }

        if (note.volume != null) {
          const bowDirection = (index + phraseProfile.bowOffset) % 2 === 0 ? 1 : -1;
          const bowChange =
            (phraseProfile.bowBias * bowDirection + playerNoise * 0.022) * humanAmount;
          note.volume = Math.max(10, Math.min(118, Math.round(note.volume * (1 + bowChange))));
        }

        if (duration >= 0.45) {
          const vibratoPhase = stableUnitNoise(
            `vibrato:${trackIndex}:${phraseProfile.seed}:${index}:${note.start}:${note.pitch}`,
          );
          const vibratoRateVariation = stableSignedNoise(
            `vibrato-rate:${trackIndex}:${phraseProfile.seed}:${index}:${note.start}:${note.pitch}`,
          );
          const vibratoDepthVariation = stableSignedNoise(
            `vibrato-depth:${trackIndex}:${phraseProfile.seed}:${index}:${note.start}:${note.pitch}`,
          );
          const bowedString = isBowedStringInstrument(note.instrument);
          const vibratoDepth =
            Math.min(bowedString ? 18 : 14, 3 + duration * 2.5) *
            phraseProfile.vibratoDepth *
            (1 + (bowedString ? vibratoDepthVariation * 0.16 : vibratoDepthVariation * 0.08)) *
            humanAmount;
          // Keep attacks closer to pitch center; sustained notes receive the
          // larger drift that stands in for a delayed vibrato onset.
          const sustainFactor = Math.min(1, 1 - Math.exp(-Math.max(0, duration - 0.18) * 2.4));
          const vibratoBuild = Math.pow(sustainFactor, 1.35);
          note.cents =
            (Number(note.cents) || 0) +
            Math.round((vibratoPhase - 0.5) * vibratoDepth * vibratoBuild * 10) / 10;
          if (bowedString) {
            // Vary the apparent vibrato rate and bow contact so sustained notes
            // do not repeat the same perfectly even sampled-sustain motion.
            note.cents +=
              Math.sin(
                index * (0.72 + vibratoRateVariation * 0.12) +
                  duration * (1.8 + vibratoRateVariation * 0.45) +
                  phraseProfile.breathPhase,
              ) *
              vibratoDepth *
              0.24 *
              vibratoBuild;
            note.bowContact = Math.round(
              (0.5 + vibratoDepthVariation * 0.12 + vibratoRateVariation * 0.08) * 100,
            ) / 100;
            note.vibratoRate = Math.round(
              (0.72 + vibratoRateVariation * 0.12) * 100,
            ) / 100;
            note.vibratoDepth = Math.round(vibratoDepth * vibratoBuild * 10) / 10;
          }
          if (isBowedStringInstrument(note.instrument) && Number(note.pitch) >= 79) {
            const registerFactor = Math.min(1, (Number(note.pitch) - 79) / 24);
            const drift = stableSignedNoise(
              `upper-register-drift:${trackIndex}:${phraseProfile.seed}:${index}:${note.pitch}`,
            );
            // Use a softened response curve so small Human values still
            // create audible life in high held notes without over-bending.
            const driftAmount = Math.sqrt(humanAmount);
            note.cents +=
              drift *
              (0.3 + registerFactor * 0.7) *
              vibratoBuild *
              driftAmount;
          }
          if (playerCount > 1) {
            note.cents += Math.round(playerNoise * Math.min(2.5, playerCount * 0.12) * 10) / 10;
          }
        }

      }
      applyPhraseTempo(notes, phraseProfile, humanAmount);
    }
  }
  function applyPhraseTempo(notes, phraseProfile, humanAmount) {
    const depth = phraseProfile.tempoDepth * Math.min(1, humanAmount);
    if (depth <= 0.001) return;

    let phraseStart = 0;
    for (let index = 1; index <= notes.length; index++) {
      const previous = notes[index - 1];
      const current = notes[index];
      const gap = current ? Math.max(0, current.start - previous.end) : Infinity;
      const leap = current ? Math.abs(Number(current.pitch) - Number(previous.pitch)) : 0;
      if (current && gap <= phraseProfile.gapThreshold && leap < phraseProfile.leapThreshold) {
        continue;
      }

      const phrase = notes.slice(phraseStart, index);
      const start = phrase[0]?.start;
      const end = Math.max(...phrase.map((note) => note.end));
      const span = Math.max(0.001, end - start);
      for (const note of phrase) {
        const originalStart = note.start;
        const originalEnd = note.end;
        const startT = Math.max(0, Math.min(1, (originalStart - start) / span));
        const endT = Math.max(startT, Math.min(1, (originalEnd - start) / span));
        const warp = (t) => (t + depth * t * t) / (1 + depth);
        note.start = start + warp(startT) * span;
        note.end = Math.max(note.start + 0.01, start + warp(endT) * span);
      }
      phraseStart = index;
    }
  }
  function createPlayerPhraseProfile(playerCount, trackIndex) {
    const seed = `phrase-player:${playerCount}:${trackIndex}`;
    return {
      seed,
      gapThreshold: 0.06 + stableUnitNoise(`${seed}:gap`) * 0.05,
      leapThreshold: 6 + Math.floor(stableUnitNoise(`${seed}:leap`) * 3),
      arcOffset: (stableUnitNoise(`${seed}:offset`) - 0.5) * 0.16,
      arcSpan: 5.5 + stableUnitNoise(`${seed}:span`) * 3.5,
      arcDepth: 0.1 + stableUnitNoise(`${seed}:arc`) * 0.07,
      expressionDepth: 0.22 + stableUnitNoise(`${seed}:expression`) * 0.14,
      breathRate: 0.48 + stableUnitNoise(`${seed}:breath-rate`) * 0.22,
      breathPhase: stableUnitNoise(`${seed}:breath-phase`) * Math.PI * 2,
      timingBreath: stableSignedNoise(`${seed}:timing`) * 0.0012,
      tempoDepth: 0.025 + stableUnitNoise(`${seed}:tempo`) * 0.025,
      sustainRate: 0.55 + stableUnitNoise(`${seed}:sustain`) * 0.34,
      sustainDepth: 0.025 + stableUnitNoise(`${seed}:sustain-depth`) * 0.035,
      bowOffset: Math.floor(stableUnitNoise(`${seed}:bow`) * 2),
      bowBias: 0.014 + stableUnitNoise(`${seed}:bow-bias`) * 0.012,
      vibratoDepth: 0.85 + stableUnitNoise(`${seed}:vibrato`) * 0.3,
    };
  }
  addPercussionMarkers(tracks, ctx);

  return tracks;
}

function applyBowedStringArticulation(tracks, humanAmount) {
  for (const track of tracks) {
    const notes = track
      .filter(
        (event) =>
          event.cmd === "note" &&
          isBowedStringInstrument(event.instrument) &&
          Number.isFinite(Number(event.start)) &&
          Number.isFinite(Number(event.end)),
      )
      .sort((a, b) => a.start - b.start || a.pitch - b.pitch);

    for (let index = 0; index < notes.length - 1; index++) {
      const note = notes[index];
      const next = notes[index + 1];
      const duration = Math.max(0.001, note.end - note.start);
      const step = Math.max(0, next.start - note.start);
      const slurred =
        note.endType === "tenuto" ||
        Number(note.gap) < 0;
      const interval = Math.abs(Number(next.pitch) - Number(note.pitch));
      if (step <= 0 || duration < 0.08) continue;

      if (slurred) {
        const wideLeap = interval >= 5;
        const register = Math.max(0, Math.min(1, (Number(note.pitch) - 48) / 48));
        const variation = stableSignedNoise(
          `string-legato:${note.start}:${note.pitch}:${next.pitch}:${note.instrument || ""}`,
        );
        const glideWeight = wideLeap
          ? Math.min(1, (interval - 4) / 12)
          : interval >= 2
            ? 0.35
            : 0.15;
        const overlap = Math.min(
          wideLeap ? 0.032 : 0.014,
          step * (wideLeap ? 0.14 : 0.1),
        ) * (0.78 + glideWeight * 0.16 + register * 0.08 + humanAmount * variation * 0.08);
        note.end = Math.max(
          note.start + 0.01,
          Math.min(next.start + overlap, note.end + overlap),
        );
        note.articulation = wideLeap ? "portamento" : "legato";
        note.legatoBlend = Math.round(
          (0.72 + glideWeight * 0.2 + humanAmount * variation * 0.08) * 100,
        ) / 100;
        if (note.bowEnvelope) {
          note.bowEnvelope.attack = Math.round(note.bowEnvelope.attack * 0.45 * 1000) / 1000;
          note.bowEnvelope.release = Math.round(note.bowEnvelope.release * 1.12 * 1000) / 1000;
        }
        if (wideLeap) {
          const direction = Math.sign(next.pitch - note.pitch);
          const glideCents =
            direction *
            (0.7 + glideWeight * 1.3 + register * 0.35 + variation * 0.25) *
            humanAmount;
          note.cents = (Number(note.cents) || 0) + glideCents;
          note.portamento = {
            interval,
            weight: Math.round((0.45 + glideWeight * 0.45 + variation * 0.1) * 100) / 100,
            direction,
          };
        }
        if (note.volume != null) {
          note.volume = Math.max(
            12,
            Math.round(note.volume * (0.96 - humanAmount * (0.035 - variation * 0.012))),
          );
        }
        if (next.volume != null) {
          next.volume = Math.max(
            12,
            Math.round(next.volume * (0.965 - humanAmount * 0.02)),
          );
        }
      } else {
        const detached = Math.max(0, next.start - note.end);
        const accent = Number(note.volume) >= 96;
        const variation = stableSignedNoise(
          `string-detache:${note.start}:${note.pitch}:${next.pitch}:${note.instrument || ""}`,
        );
        note.articulation = accent ? "accent-detache" : "detache";
        note.end = Math.max(
          note.start + 0.01,
          note.end - Math.min(0.018, detached * (0.16 + variation * 0.04) + 0.004),
        );
        if (note.volume != null) {
          note.volume = Math.max(
            12,
            Math.min(
              118,
              Math.round(
                note.volume *
                  (accent
                    ? 1.025 + humanAmount * variation * 0.012
                    : 0.985 + humanAmount * variation * 0.01),
              ),
            ),
          );
        }
      }
    }
  }
}

function varyBowedStringDoubleStops(tracks, humanAmount) {
  if (humanAmount <= 0) return;
  const buckets = new Map();
  for (const track of tracks) {
    for (const note of track) {
      if (
        note.cmd !== "note" ||
        note.pitch == null ||
        note.start == null ||
        !isBowedStringInstrument(note.instrument)
      ) {
        continue;
      }
      const key = Math.round(note.start * 64);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(note);
    }
  }

  for (const notes of buckets.values()) {
    const distinctPitches = new Set(notes.map((note) => Number(note.pitch)));
    if (distinctPitches.size < 2) continue;
    for (const note of notes) {
      const separation = stableSignedNoise(
        `double-stop:${note.start}:${note.pitch}:${note.instrument || ""}`,
      );
      note.cents = Math.round(
        ((Number(note.cents) || 0) + separation * 2.4 * humanAmount) * 10,
      ) / 10;
      if (note.volume != null) {
        note.volume = Math.max(
          10,
          Math.min(118, Math.round(note.volume * (1 + separation * 0.018 * humanAmount))),
        );
      }
    }
  }
}

function expandEnsembleTracks(tracks, players, humanAmount) {
  const playerCount = Math.max(1, Math.min(32, Number(players) || 1));
  if (playerCount <= 1) return;

  const originals = tracks.map((track) =>
    track.filter(
      (event) =>
        event.cmd === "note" &&
        event.pitch != null &&
        Number.isFinite(Number(event.start)) &&
        Number.isFinite(Number(event.end)),
    ),
  );
  for (let player = 1; player < playerCount; player++) {
    for (let trackIndex = 0; trackIndex < originals.length; trackIndex++) {
      const sourceNotes = originals[trackIndex];
      if (!sourceNotes.length) continue;
      const playerSeed = `ensemble:${playerCount}:${player}:${trackIndex}`;
      const sectionTiming =
        stableSignedNoise(`${playerSeed}:section-timing`) * 0.0035 * humanAmount;
      const sectionPitch =
        stableSignedNoise(`${playerSeed}:section-pitch`) * 0.8 * humanAmount;
      const layer = sourceNotes.map((source, noteIndex) => {
        const note = { ...source, ensembleReplica: true };
        const seed = `${playerSeed}:${noteIndex}:${source.start}:${source.pitch}`;
        const timing =
          sectionTiming + stableSignedNoise(`${seed}:timing`) * 0.0035 * humanAmount;
        const gain = 1 + stableSignedNoise(`${seed}:gain`) * 0.07 * humanAmount;
        const durationFactor =
          1 + stableSignedNoise(`${seed}:duration`) * 0.012 * humanAmount;
        note.start = Math.max(0, Number(source.start) + timing);
        note.end = Math.max(
          note.start + 0.01,
          note.start + (Number(source.end) - Number(source.start)) * durationFactor,
        );
        if (note.volume != null) {
          note.volume = Math.max(8, Math.min(118, Math.round(note.volume * gain)));
        }
        if (note.cents != null) {
          note.cents =
            Number(note.cents) +
            sectionPitch +
            stableSignedNoise(`${seed}:pitch`) * 3.2 * humanAmount;
        }
        return note;
      });
      tracks.push(layer);
    }
  }
}

function applyHumanization(tracks, humanize) {
  // Keep the public 0–1 control range while making moderate values audible.
  const baseAmount = Math.max(0, Math.min(1, Number(humanize?.amount ?? 0) * 2));
  if (!baseAmount) return;

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    for (let noteIndex = 0; noteIndex < track.length; noteIndex++) {
      const note = track[noteIndex];
      if (note.pitch == null || note.start == null || note.end == null) continue;
      const family = instrumentFamily(note.instrument);
      if (family === "fx") continue;
      const amount = dynamicHumanAmount(baseAmount, note.start, trackIndex, noteIndex);

      const dur = Math.max(0.001, note.end - note.start);
      const seedBase = `${trackIndex}:${noteIndex}:${Math.round(note.start * 512)}:${note.pitch}:${note.instrument || ""}`;
      const timingNoise = stableSignedNoise(`${seedBase}:timing`);
      const durationNoise = stableSignedNoise(`${seedBase}:duration`);
      const volumeNoise = stableSignedNoise(`${seedBase}:volume`);
      const centsNoise = stableSignedNoise(`${seedBase}:cents`);
      const mistakeNoise = stableUnitNoise(`${seedBase}:mistake`);
      const bowedString = isBowedStringInstrument(note.instrument);
      const bowDirection = noteIndex % 2 === 0 ? 1 : -1;
      const bowPressureNoise = stableSignedNoise(`${seedBase}:bow-pressure`);
      const bowReleaseNoise = stableSignedNoise(`${seedBase}:bow-release`);
      const bowFrictionNoise = stableSignedNoise(`${seedBase}:bow-friction`);

      const rubatoWidth =
        family === "strings" ? 0.01 : family === "woodwind" ? 0.008 : family === "brass" ? 0.006 : 0.005;
      const bowTimeShift = bowedString
        ? bowDirection * 0.0015 + bowPressureNoise * 0.0025
        : 0;
      const timeShift = (timingNoise * rubatoWidth + bowTimeShift) * amount;
      const start = Math.max(0, note.start + timeShift);
      const bowDurationDrift = bowedString
        ? bowDirection * 0.008 + bowReleaseNoise * 0.018
        : 0;
      const durFactor =
        1 +
        (durationNoise * familyDurationDrift(family, note.instrument) +
          bowDurationDrift) *
          amount;
      const nextDur = Math.max(0.01, dur * durFactor);
      note.start = start;
      note.end = start + nextDur;

      if (note.volume != null) {
        const volumeRange =
          family === "strings" ? 0.1 : family === "woodwind" ? 0.075 : family === "brass" ? 0.07 : 0.05;
        let volumeFactor = 1 + volumeNoise * volumeRange * amount;
        if (mistakeNoise < amount * 0.035 && family !== "keyboard") {
          volumeFactor *= 0.88 + stableUnitNoise(`${seedBase}:tone-slip`) * 0.2;
        }
        if (bowedString) {
          // Alternating bow pressure adds a small attack/release irregularity.
          volumeFactor *= 1 + (bowDirection * 0.045 + bowPressureNoise * 0.06) * amount;
          note.bowFriction = Math.round(
            Math.max(-1, Math.min(1, bowFrictionNoise * 0.7 + bowPressureNoise * 0.3)) *
              amount *
              100,
          ) / 100;
          if (isViolinInstrument(note.instrument)) {
            volumeFactor *= violinBowCycle(note, dur, seedBase, amount);
          }
          if (mistakeNoise < amount * 0.06) {
            volumeFactor *= 0.9 + stableUnitNoise(`${seedBase}:bow-slip`) * 0.12;
          }
        }
        note.volume = Math.max(10, Math.min(118, Math.round(note.volume * volumeFactor)));
      }

      const centsWidth = familyCentsWidth(family, note.instrument);
      if (centsWidth) {
        const existing = Number(note.cents) || 0;
        let cents = existing + centsNoise * centsWidth * amount;
        if (isViolinInstrument(note.instrument)) {
          const previous = track[noteIndex - 1];
          const previousPitch = Number(previous?.pitch);
          const pitch = Number(note.pitch);
          const interval = Number.isFinite(previousPitch) ? pitch - previousPitch : 0;
          const approach = interval > 0 ? -1 : interval < 0 ? 1 : 0;
          const registerBias = pitch >= 79 ? -0.7 : pitch <= 55 ? 0.55 : 0;
          cents += (approach * 1.8 + registerBias) * amount;
        }
        if (mistakeNoise < amount * 0.025) {
          cents += stableSignedNoise(`${seedBase}:cents-slip`) * centsWidth * 0.6 * amount;
        }
        note.cents = Math.round(cents * 10) / 10;
      }
    }
  }
}

function dynamicHumanAmount(baseAmount, start, trackIndex, noteIndex) {
  const phrasePhase = start * 0.72 + trackIndex * 0.37;
  const slowBreath = Math.sin(phrasePhase) * 0.12;
  const phraseNoise = stableSignedNoise(
    `human-phrase:${trackIndex}:${Math.floor(start / 2)}:${noteIndex % 4}`,
  ) * 0.08;
  return Math.max(0, Math.min(1, baseAmount * (1 + slowBreath + phraseNoise)));
}

function familyDurationDrift(family, instrument) {
  if (isViolinInstrument(instrument)) return 0.07;
  if (family === "strings") return 0.055;
  if (family === "woodwind") return 0.04;
  if (family === "brass") return 0.035;
  if (family === "keyboard") return 0.02;
  return 0.025;
}

function familyCentsWidth(family, instrument) {
  if (isViolinInstrument(instrument)) return 12;
  if (family === "strings") return 9;
  if (family === "woodwind") return 6;
  if (family === "brass") return 5;
  if (family === "bass") return 7;
  return 0;
}

function addPercussionMarkers(tracks, ctx) {
  const source = String(ctx?.sourceText || "");
  if (!source) return;

  const additions = [];
  for (const track of tracks) {
    for (const note of track) {
      if (note.startChar == null || note.endChar == null) continue;
      const marker = findDrumMarker(source, note.endChar);
      if (!marker) continue;
      const drum = marker.kind === "o" ? ctx?.drum1 ?? DEFAULT_DRUM_1 : ctx?.drum2 ?? DEFAULT_DRUM_2;
      additions.push({
        track,
        note: {
          pitch: drum.pitch,
          instrument: "percussion",
          start: note.start,
          end: note.end,
          volume: Math.max(18, Math.min(127, Math.round(note.volume * (marker.accent ? 0.82 : 0.68)))),
        },
      });
    }
  }

  for (const item of additions) {
    item.track.push(item.note);
  }
}

function spreadVoicePan(source) {
  const count = countVoices(source);
  if (count <= 1) return undefined;
  if (count === 2) return [-0.28, 0.28];
  const spread = Math.min(0.44, 1.35 / Math.max(2, count - 1));
  const pan = [];
  for (let i = 0; i < count; i++) {
    const offset = i - (count - 1) / 2;
    pan.push(Math.max(-0.85, Math.min(0.85, Math.round(offset * spread * 100) / 100)));
  }
  return pan;
}

function countVoices(source) {
  const ids = new Set();
  for (const line of String(source || "").split(/\r?\n/)) {
    const m = line.trim().match(/^V:\s*([^\s]+)/i);
    if (m) ids.add(m[1]);
  }
  return ids.size;
}

function findDrumMarker(source, endChar) {
  const rest = source.slice(Math.max(0, endChar));
  const m = rest.match(DRUM_MARKER_RE);
  if (!m) return null;
  const kind = (m[1] || m[2]).toLowerCase();
  return {
    kind,
    accent: (m[1] || m[2]) === (m[1] || m[2]).toUpperCase(),
  };
}

function isWoodwindInstrument(instrument) {
  const name = normalizeInstrumentName(instrument);
  if (WOODWIND_NAMES.has(name)) return true;
  const program = Number(name);
  return Number.isInteger(program) && WOODWIND_PROGRAMS.has(program);
}

function isViolinInstrument(instrument) {
  const name = normalizeInstrumentName(instrument);
  return name === "violin" || name === "fiddle";
}

function isBowedStringInstrument(instrument) {
  const name = normalizeInstrumentName(instrument);
  if (name.includes("pizzicato")) return false;
  return (
    name === "violin" ||
    name === "fiddle" ||
    name === "viola" ||
    name === "cello" ||
    name === "contrabass" ||
    /^string-ensemble(?:-1|-2)?$/.test(name) ||
    /^synth-strings(?:-1|-2)?$/.test(name) ||
    name === "strings"
  );
}

function isSlowResponseBowedString(instrument) {
  const name = normalizeInstrumentName(instrument);
  return name === "cello" || name === "contrabass" || name === "double-bass";
}

function normalizeInstrumentName(instrument) {
  return String(instrument || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function clampPitchForSoundfont(note) {
  if (note?.pitch == null) return;
  const pitch = Number(note.pitch);
  if (!Number.isFinite(pitch)) return;
  const family = instrumentFamily(note.instrument);
  if (family !== "keyboard") return;
  note.pitch = Math.max(KEYBOARD_PITCH_RANGE.min, Math.min(KEYBOARD_PITCH_RANGE.max, Math.round(pitch)));
}

function stableUnitNoise(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function stableSignedNoise(seed) {
  return stableUnitNoise(seed) * 2 - 1;
}

function instrumentFamily(instrument) {
  const name = normalizeInstrumentName(instrument);
  if (!name) return "other";
  if (WOODWIND_NAMES.has(name)) return "woodwind";
  if (STRING_NAMES.has(name) || /^(violin|viola|cello|strings?|fiddle)/.test(name)) {
    return "strings";
  }
  if (BRASS_NAMES.has(name) || /^(trumpet|trombone|tuba|horn|cornet|bugle|flugelhorn|baritone|euphonium)/.test(name)) {
    return "brass";
  }
  if (BASS_NAMES.has(name) || /bass/.test(name)) return "bass";
  if (KEYBOARD_NAMES.has(name) || /^(acoustic-grand-piano|bright-acoustic-piano|piano|bright-piano|electric-piano|harpsichord|organ|accordion|keyboard)/.test(name)) {
    return "keyboard";
  }
  if (FX_NAMES.has(name) || /^(fx|pad)-/.test(name)) return "fx";
  return "other";
}

const BOWED_STRING_BASE_PROFILE = {
  base: 1.0,
  shortBoost: 1.2,
  holdBase: 0.96,
  holdDepth: 0.08,
  highCut: 90,
  stackFactor: 0.9,
  unisonFactor: 0.88,
};

function familyMixProfile(family) {
  switch (family) {
    case "woodwind":
      return {
        base: 0.93,
        shortBoost: 1.18,
        holdBase: 0.88,
        holdDepth: 0.15,
        highCut: 82,
        stackFactor: 0.78,
        unisonFactor: 0.7,
      };
    case "strings":
      return BOWED_STRING_BASE_PROFILE;
    case "brass":
      return {
        base: 0.94,
        shortBoost: 1.24,
        holdBase: 0.9,
        holdDepth: 0.12,
        highCut: 78,
        stackFactor: 0.8,
        unisonFactor: 0.75,
      };
    case "bass":
      return {
        base: 0.98,
        shortBoost: 1.08,
        holdBase: 0.98,
        holdDepth: 0.04,
        highCut: 0,
        stackFactor: 0.98,
        unisonFactor: 0.96,
      };
    case "keyboard":
      return {
        base: 1.02,
        shortBoost: 1.12,
        holdBase: 0.99,
        holdDepth: 0.04,
        highCut: 0,
        stackFactor: 0.94,
        unisonFactor: 0.9,
      };
    case "fx":
      return {
        base: 0.92,
        shortBoost: 1.0,
        holdBase: 0.97,
        holdDepth: 0.02,
        highCut: 0,
        stackFactor: 0.98,
        unisonFactor: 0.98,
      };
    default:
      return {
        base: 0.98,
        shortBoost: 1.16,
        holdBase: 0.94,
        holdDepth: 0.09,
        highCut: 0,
        stackFactor: 0.88,
        unisonFactor: 0.84,
      };
  }
}

/**
 * Find stepwise crescendo/diminuendo runs and reshape to a stronger curve.
 * abcjs only bumps ~50 velocity over the span; we stretch and ease it.
 */
function enhanceDynamicRamps(tracks, humanAmount = 0) {
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
        reshapeRamp(notes.slice(i, j + 1), dir, humanAmount);
      }
      i = Math.max(j, i + 1);
    }
  }
}

/**
 * @param {Array<{volume:number}>} run
 * @param {number} dir +1 crescendo, -1 diminuendo
 */
function reshapeRamp(run, dir, humanAmount = 0) {
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
    const curve = lo + (hi - lo) * Math.pow(shaped, dir > 0 ? 0.85 : 1.1);
    const edge = Math.min(t, 1 - t);
    const noise = stableSignedNoise(`dynamic-ramp:${dir}:${run.length}:${k}`);
    const imperfect = noise * Math.min(7, (hi - lo) * 0.12) * humanAmount * Math.min(1, edge * 4);
    const bowed = isBowedStringInstrument(run[k].instrument);
    const pressure = bowed
      ? dir > 0
        ? 1 + 0.1 * humanAmount * Math.pow(t, 1.35)
        : 1 - 0.08 * humanAmount * Math.pow(1 - t, 1.2)
      : 1;
    const v = curve * pressure + imperfect;
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
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone>, room?: ReturnType<typeof resolveRoom>, midiProgram?: number, hasMultipleMidiPrograms?: boolean }} meta
 */
export function deskAudioParams(meta) {
  const program = meta.hasMultipleMidiPrograms
    ? undefined
    : meta.midiProgram ?? meta.instrument?.program;
  const forceInstrument = programToSoundfontName(program);
  const pan = spreadVoicePan(meta.sourceText);

  const options = {
    chordsOff: false,
    fadeLength: 320,
    callbackContext: {
      forceInstrument,
      sourceText: meta.sourceText,
      drum1: meta.drum1,
      drum2: meta.drum2,
      tone: meta.tone,
      inlineToneChanges: meta.inlineToneChanges,
      humanize: meta.humanize,
      room: meta.room,
      distance: meta.distance,
      players: meta.players,
      adaptiveStrings: false,
    },
    pan,
    sequenceCallback: (tracks, ctx) =>
      balanceHeldNotes(tracks, {
        forceInstrument: ctx?.forceInstrument ?? forceInstrument,
        sourceText: ctx?.sourceText ?? meta.sourceText,
        inlineToneChanges: ctx?.inlineToneChanges ?? meta.inlineToneChanges,
        drum1: ctx?.drum1 ?? meta.drum1,
        drum2: ctx?.drum2 ?? meta.drum2,
        tone: ctx?.tone ?? meta.tone,
        humanize: ctx?.humanize ?? meta.humanize,
        players: ctx?.players ?? meta.players,
        adaptiveStrings: ctx?.adaptiveStrings ?? false,
        expressionExpansion: ctx?.expressionExpansion ?? false,
        experimentalPerformance: ctx?.experimentalPerformance ?? false,
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
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone>, humanize?: ReturnType<typeof resolveHumanization>, instrumentSource?: string | null, decorationsUsed?: string[] }} meta
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
  if (meta.room) {
    parts.push(`Room ${meta.room.label}`);
  }
  if (meta.players) {
    parts.push(`Players ${meta.players}`);
  }
  if (meta.distance != null) {
    parts.push(`Distance ${meta.distance}`);
  }
  if (meta.humanize?.amount) {
    parts.push(meta.humanize.label);
  }
  if (meta.drum1 || meta.drum2) {
    const drums = [meta.drum1?.label, meta.drum2?.label].filter(Boolean);
    if (drums.length) parts.push(`Drums ${drums.join(" / ")}`);
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
