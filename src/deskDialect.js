/**
 * ABC Desk dialect: loose Inst: / Tone: headers (friendly or encoded).
 * Compiles to meta + clean ABC for abcjs.
 */

const FRIENDLY_RE = /^(Inst|Tone)\s*:\s*(.*)$/i;
const ENCODED_RE =
  /^(?:%%|I:)\s*desk-(instrument|tone)\s+(.+)$/i;
const UNKNOWN_DESK_RE = /^(?:%%|I:)\s*desk-([a-z0-9-]+)\b/i;

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
};

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
    return { program: asNum, label: `GM ${asNum}`, name: String(asNum) };
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
 * Parse Desk dialect headers; return clean ABC for abcjs + resolved meta.
 * @param {string} source
 */
export function parseDeskHeaders(source) {
  const lines = source.split(/\r?\n/);
  const kept = [];
  const warnings = [];
  let instrumentRaw = null;
  let toneRaw = null;

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

    kept.push(line);
  }

  let cleanAbc = kept.join("\n");
  const instrument = resolveInstrument(instrumentRaw);
  const tone = resolveTone(toneRaw);

  if (instrumentRaw && !instrument) {
    warnings.push(`Unknown Inst: “${instrumentRaw}” (try flute, violin, piano…)`);
  }
  if (toneRaw && !tone) {
    warnings.push(`Unknown Tone: “${toneRaw}” (try warm, bright, soft, swing, neutral)`);
  }

  // Inject MIDI program when Inst: resolved and no existing %%MIDI program
  if (instrument && !/%%MIDI\s+program\b/i.test(cleanAbc)) {
    cleanAbc = injectMidiProgram(cleanAbc, instrument.program);
  }

  return {
    cleanAbc,
    meta: {
      instrument,
      tone,
      instrumentRaw,
      toneRaw,
    },
    warnings,
  };
}

/**
 * Insert %%MIDI program after the K: header line when possible.
 * @param {string} abc
 * @param {number} program
 */
function injectMidiProgram(abc, program) {
  const lines = abc.split(/\r?\n/);
  const midiLine = `%%MIDI program ${program}`;
  let kIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^K:/i.test(lines[i].trim())) {
      kIndex = i;
      break;
    }
  }
  if (kIndex >= 0) {
    lines.splice(kIndex + 1, 0, midiLine);
    return lines.join("\n");
  }
  return `${midiLine}\n${abc}`;
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
 * Synth options derived from Desk meta.
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone> }} meta
 */
export function deskAudioParams(meta) {
  const options = { chordsOff: false };
  if (meta.instrument) {
    options.program = meta.instrument.program;
  }
  if (meta.tone) {
    Object.assign(options, meta.tone.options);
  }
  // Don't force swing:0 — leave unset when neutral
  if (options.swing === 0) delete options.swing;
  return options;
}

/**
 * Short status fragment for Inst/Tone.
 * @param {{ instrument: ReturnType<typeof resolveInstrument>, tone: ReturnType<typeof resolveTone> }} meta
 */
export function deskStatusFragment(meta) {
  const parts = [];
  if (meta.instrument) {
    parts.push(`${meta.instrument.label} · GM ${meta.instrument.program}`);
  }
  if (meta.tone) {
    parts.push(`Tone ${meta.tone.label}`);
  }
  return parts.join(" · ");
}
