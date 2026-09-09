import { parseDeskHeaders } from "./deskDialect.js";

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

export function formatForDesk(source) {
  if (/^\s*Part\s*:/im.test(source)) return null;
  const lines = source.split(/\r?\n/);
  const voices = new Map();
  let currentVoice = null;
  const header = [];
  let musicStarted = false;

  for (const line of lines) {
    const declaration = line.match(/^\s*V\s*:\s*(\S+)(.*)$/i);
    if (declaration) {
      musicStarted = true;
      const id = declaration[1];
      const attributes = declaration[2];
      voices.set(id, {
        id,
        name: readVoiceAttribute(attributes, "name") || `Voice ${id}`,
        clef: readVoiceAttribute(attributes, "clef"),
        lines: voices.get(id)?.lines ?? [],
      });
      currentVoice = id;
      continue;
    }
    if (!musicStarted) {
      if (!/^\s*%/.test(line)) header.push(line);
      continue;
    }
    const marked = [...line.matchAll(/\[V\s*:\s*(\S+)\]\s*/gi)];
    if (marked.length) {
      for (let index = 0; index < marked.length; index++) {
        const voice = voices.get(marked[index][1]);
        if (!voice) continue;
        const start = marked[index].index + marked[index][0].length;
        const end = marked[index + 1]?.index ?? line.length;
        voice.lines.push(line.slice(start, end).trim());
      }
      currentVoice = null;
    } else if (currentVoice && line.trim()) {
      voices.get(currentVoice)?.lines.push(line);
    }
  }

  if (!voices.size) {
    const fields = extractFields(source);
    const keyIndex = lines.findIndex((line) => /^\s*K\s*:/i.test(line));
    if (keyIndex < 0) return null;
    const music = lines.slice(keyIndex + 1).filter((line) => line.trim() && !/^\s*%/.test(line)).join(" ");
    if (!music.includes("&")) return null;
    voices.set("1", {
      id: "1",
      name: fields.T ? `${fields.T} voice` : "Voice 1",
      clef: "",
      lines: [music],
    });
  }
  const fields = extractFields(header.length ? header.join("\n") : source);
  const sharedHeader = [
    `X:${fields.X || 1}`,
    fields.T ? `T:${fields.T}` : null,
    fields.C ? `C:${fields.C}` : null,
    fields.M ? `M:${fields.M}` : null,
    fields.L ? `L:${fields.L}` : null,
    fields.Q ? `Q:${fields.Q}` : null,
    fields.K ? `K:${fields.K}` : null,
  ].filter(Boolean);
  const parts = [];
  for (const voice of voices.values()) {
    const instrument = fields.Inst || inferInstrument(voice.name, voice.clef);
    const music = voice.lines.filter(Boolean).join("\n");
    const overlays = splitOverlayVoices(music, fields.L);
    overlays.forEach((body, index) => {
      const name = overlays.length > 1 ? `${voice.name} voice ${index + 1}` : voice.name;
      parts.push([
        `Part: ${name}`,
        `Inst: ${instrument}`,
        ...sharedHeader,
        body,
      ].filter(Boolean).join("\n"));
    });
  }
  return `${parts.join("\n\n")}\n`;
}

function splitOverlayVoices(music, lengthField) {
  if (!music.includes("&")) return [music];
  const unit = parseLengthUnit(lengthField);
  const voices = [];
  let current = "";
  const flushBar = (barline = "") => {
    const segments = current.split("&").map((segment) => segment.trim()).filter(Boolean);
    if (!segments.length) {
      current = "";
      return;
    }
    while (voices.length < segments.length) voices.push([]);
    const durations = segments.map((segment) => abcDurationUnits(segment, unit));
    const target = Math.max(...durations);
    segments.forEach((segment, index) => {
      const padding = target - durations[index];
      voices[index].push(`${segment}${formatRest(padding, unit)}${barline}`.trim());
    });
    for (let index = segments.length; index < voices.length; index++) {
      voices[index].push(`${formatRest(target, unit)}${barline}`.trim());
    }
    current = "";
  };

  for (const piece of music.split(/(\|)/)) {
    if (piece === "|") flushBar("|");
    else current += `${current ? " " : ""}${piece}`;
  }
  flushBar();
  return voices.map((voice) => voice.join(" ").trim()).filter(Boolean);
}

function parseLengthUnit(value) {
  const match = String(value || "1/8").match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[1]) / Number(match[2]) : 0.125;
}

function abcDurationUnits(text, unit) {
  let total = 0;
  const tokens = text.match(/(?:\[[^\]]+\]|[_=^]?[A-Ga-gz][,']*)(?:\d+)?(?:\/\d*)?/g) || [];
  for (const token of tokens) {
    const suffix = token.match(/(\d+)?(?:\/(\d*))?$/);
    const numerator = Number(suffix?.[1] || 1);
    const denominator = suffix?.[2] === "" ? 2 : Number(suffix?.[2] || 1);
    total += (numerator / denominator) * unit;
  }
  return total;
}

function formatRest(duration, unit) {
  const units = duration / unit;
  if (units <= 0.001) return "";
  const rounded = Math.round(units * 16) / 16;
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
    return ` z${Math.max(1, Math.round(rounded))}`;
  }
  const denominator = 16;
  const numerator = Math.round(rounded * denominator);
  return ` z${numerator}/${denominator}`;
}

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
      if (trans) {
        current.transpose = Number(trans[1]);
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
    const prepared = parseDeskHeaders(part.body);
    const fields = extractFields(prepared.cleanAbc);
    const midiProgram = prepared.meta.midiProgram;
    for (const warning of prepared.warnings) {
      warnings.push(`Part “${part.name}”: ${warning}`);
    }

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

    const music = stripHeader(prepared.cleanAbc);
    if (!music.trim()) {
      warnings.push(`Part “${part.name}” has no note body`);
    }

    const vNum = idx + 1;
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
      midiProgram,
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

function readVoiceAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, "i"));
  return match?.[1]?.trim() || "";
}

function inferInstrument(name, clef = "") {
  const value = `${name} ${clef}`.toLowerCase();
  if (/double\s*bass|contrabass/.test(value)) return "contrabass";
  if (/cello/.test(value)) return "cello";
  if (/viola|alto/.test(value)) return "viola";
  if (/violin|fiddle/.test(value)) return "violin";
  return /bass/.test(value) ? "cello" : "violin";
}
