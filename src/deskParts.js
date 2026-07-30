/**
 * Multi-part assembly: Part: blocks → one multi-voice conductor ABC.
 *
 * Example:
 *   Part: flute
 *   Trans: 0
 *   X:1
 *   M:4/4
 *   L:1/8
 *   K:C
 *   cdef|
 *
 *   Part: clarinet
 *   Trans: -2
 *   ...
 */

const PART_START = /^Part:\s*(.+)$/i;
const TRANS_LINE = /^(?:Trans|Transpose)\s*:\s*(-?\d+)\s*$/i;
const INST_LINE = /^Inst:\s*(.+)$/i;

/**
 * @typedef {{ name: string, transpose: number, instrument?: string, body: string, meter?: string, start: number }} DeskPart
 */

/**
 * @param {string} source
 * @returns {{ isMultiPart: boolean, parts: DeskPart[], assembledAbc?: string, warnings: string[] }}
 */
export function parseParts(source) {
  const lines = source.split(/\r?\n/);
  /** @type {DeskPart[]} */
  const parts = [];
  /** @type {string[]} */
  const warnings = [];

  let current = null;
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const partMatch = line.trim().match(PART_START);
    if (partMatch) {
      if (current) parts.push(finalizePart(current));
      current = {
        name: partMatch[1].trim(),
        transpose: 0,
        instrument: undefined,
        lines: [],
        start: offset,
        meter: undefined,
      };
    } else if (current) {
      const trans = line.trim().match(TRANS_LINE);
      const inst = line.trim().match(INST_LINE);
      if (trans) {
        current.transpose = Number(trans[1]);
      } else if (inst) {
        current.instrument = inst[1].trim();
        current.lines.push(line);
      } else {
        const m = line.trim().match(/^M:\s*(.+)$/i);
        if (m) current.meter = m[1].trim();
        current.lines.push(line);
      }
    }
    offset += line.length + 1;
  }
  if (current) parts.push(finalizePart(current));

  if (parts.length === 0) {
    return { isMultiPart: false, parts: [], warnings };
  }

  if (parts.length === 1) {
    warnings.push("Only one Part: — add another Part: block to assemble a score");
  }

  const assembledAbc = assembleParts(parts, warnings);
  return { isMultiPart: true, parts, assembledAbc, warnings };
}

function finalizePart(partial) {
  return {
    name: partial.name,
    transpose: partial.transpose,
    instrument: partial.instrument,
    body: partial.lines.join("\n").trim(),
    meter: partial.meter,
    start: partial.start,
  };
}

/**
 * @param {DeskPart[]} parts
 * @param {string[]} warnings
 */
function assembleParts(parts, warnings) {
  const voices = [];
  let title = "Assembled score";
  let meter = "4/4";
  let length = "1/8";
  let key = "C";
  let tempo = null;
  let ref = 1;

  parts.forEach((part, idx) => {
    const fields = extractFields(part.body);
    if (idx === 0) {
      if (fields.T) title = fields.T;
      if (fields.M) meter = fields.M;
      if (fields.L) length = fields.L;
      if (fields.K) key = fields.K;
      if (fields.Q) tempo = fields.Q;
      if (fields.X) ref = fields.X;
    } else {
      if (fields.M && fields.M !== meter) {
        warnings.push(`Part “${part.name}” meter ${fields.M} ≠ ${meter}`);
      }
    }

    const music = stripHeader(part.body);
    if (!music.trim()) {
      warnings.push(`Part “${part.name}” has no note body`);
    }

    const vNum = idx + 1;
    const voiceHeader = [
      `V:${vNum} name="${escapeQuotes(part.name)}"`,
      part.instrument ? `%%MIDI program ${resolveProgramGuess(part.instrument)}` : null,
      part.transpose ? `%%MIDI transpose ${part.transpose}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Visual transpose for written→concert when assembling
    const clefHint = /bass|cello|trombone/i.test(part.name)
      ? " clef=bass"
      : "";
    voices.push({
      vNum,
      name: part.name,
      declare: `V:${vNum} name="${escapeQuotes(part.name)}"${clefHint}`,
      music: music.trim(),
      transpose: part.transpose,
      instrument: part.instrument,
      midiProgram: part.instrument
        ? resolveProgramGuess(part.instrument)
        : undefined,
    });
  });

  const header = [
    `X:${ref}`,
    `T:${title}`,
    `M:${meter}`,
    `L:${length}`,
    tempo ? `Q:${tempo}` : null,
    ...voices.map((v) => v.declare),
    `K:${key}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Interleave by writing each voice block with V:n before its music lines
  const body = voices
    .map((v) => {
      const midi =
        v.midiProgram != null ? `%%MIDI program ${v.midiProgram}\n` : "";
      const tr =
        v.transpose != null && v.transpose !== 0
          ? `%%MIDI transpose ${v.transpose}\n`
          : "";
      return `V:${v.vNum}\n${midi}${tr}${v.music}`;
    })
    .join("\n");

  return `${header}\n${body}\n`;
}

function extractFields(body) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z]):\s*(.*)$/);
    if (m && !out[m[1]]) out[m[1]] = m[2].trim();
  }
  return out;
}

function stripHeader(body) {
  const lines = body.split(/\r?\n/);
  let k = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^K:/i.test(lines[i].trim())) {
      k = i;
      break;
    }
  }
  if (k < 0) return body;
  return lines.slice(k + 1).join("\n");
}

function escapeQuotes(s) {
  return String(s).replace(/"/g, "'");
}

/** Minimal name→program for part Inst: lines during assembly. */
function resolveProgramGuess(name) {
  const key = name.trim().toLowerCase();
  const map = {
    flute: 73,
    clarinet: 71,
    oboe: 68,
    violin: 40,
    viola: 41,
    cello: 42,
    bass: 32,
    piano: 0,
    trumpet: 56,
    horn: 60,
    guitar: 24,
    fiddle: 110,
    atmosphere: 99,
    crystal: 98,
  };
  if (map[key] != null) return map[key];
  const n = Number(key);
  if (Number.isInteger(n) && n >= 0 && n <= 127) return n;
  return 0;
}
