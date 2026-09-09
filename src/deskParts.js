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
  const header = [];
  const voices = [];
  let current = null;

  for (const line of lines) {
    const declaration = line.match(/^\s*V\s*:\s*(\S+)(.*)$/i);
    if (declaration) {
      current = {
        name: readVoiceAttribute(declaration[2], "name") || `Voice ${declaration[1]}`,
        clef: readVoiceAttribute(declaration[2], "clef"),
        lines: [],
      };
      voices.push(current);
    } else if (!current) {
      if (!/^\s*%(?!%MIDI)/i.test(line)) header.push(line);
    } else if (line.trim()) {
      current.lines.push(line);
    }
  }

  const fields = extractFields(header.join("\n") || source);
  if (!voices.length) {
    const keyIndex = lines.findIndex((line) => /^\s*K\s*:/i.test(line));
    const music = keyIndex >= 0
      ? lines.slice(keyIndex + 1)
        .filter((line) => line.trim() && !/^\s*%/.test(line) && !/^\s*[A-Za-z][A-Za-z0-9]*:/.test(line))
        .join(" ")
      : "";
    if (!music.includes("&")) return null;
    voices.push({ name: fields.T ? `${fields.T} voice` : "Voice 1", clef: "", lines: [sanitizeMusic(music)] });
  }

  const sharedHeader = [
    `X:${fields.X || 1}`,
    fields.T ? `T:${fields.T}` : null,
    fields.C ? `C:${fields.C}` : null,
    fields.M ? `M:${fields.M}` : null,
    fields.L ? `L:${fields.L}` : null,
    fields.Q ? `Q:${fields.Q}` : null,
    fields.K ? `K:${fields.K}` : null,
    readMidiProgramLine(header.join("\n")),
  ].filter(Boolean);
  const parts = [];
  const sharedProgram = readMidiProgram(header.join("\n"));
  for (const voice of voices) {
    const instrument = fields.Inst || instrumentForProgram(sharedProgram) ||
      inferPartInstrument(voice.name, voice.clef);
    const overlays = splitOverlayVoices(sanitizeMusic(voice.lines.join("\n")), fields.L);
    overlays.forEach((body, index) => {
      const name = overlays.length > 1 ? `${voice.name} voice ${index + 1}` : voice.name;
      parts.push([
        `Part: ${name}`,
        sharedProgram == null ? `Inst: ${instrument}` : null,
        ...sharedHeader,
        wrapMusicLines(makeRestsVisible(body)),
      ].filter(Boolean).join("\n"));
    });
  }
  return `${parts.join("\n\n")}\n`;
}

function splitOverlayVoices(music, lengthField) {
  if (!music.includes("&")) return [music];
  const unit = parseLengthUnit(lengthField);
  const voices = [];
  const barTargets = [];
  let bar = "";
  const flush = (barline = "") => {
    const segments = bar.split("&").map((value) => value.trim()).filter(Boolean);
    if (!segments.length) return;
    const durations = segments.map((value) => abcDurationUnits(value, unit));
    const target = Math.max(...durations);
    barTargets.push({ duration: target, barline });
    while (voices.length < segments.length) {
      voices.push(
        barTargets
          .slice(0, -1)
          .map((barInfo) => `${formatRest(barInfo.duration, unit)}${barInfo.barline}`.trim()),
      );
    }
    const fields = [...new Set(
      segments.join(" ").match(/\[[A-Za-z][A-Za-z0-9]*:[^\]]*\]/g) || [],
    )].join(" ");
    segments.forEach((segment, index) => {
      const sharedFields = fields && !segment.includes(fields) ? `${fields} ` : "";
      voices[index].push(`${sharedFields}${segment}${formatRest(target - durations[index], unit)}${barline}`.trim());
    });
    for (let index = segments.length; index < voices.length; index++) {
      voices[index].push(`${formatRest(target, unit)}${barline}`.trim());
    }

    bar = "";
  };
  for (const piece of music.split(/(\|)/)) {
    if (piece === "|") flush("|");
    else bar += `${bar ? " " : ""}${piece}`;
  }
  flush();
  return voices.map((voice) => voice.join(" ").trim()).filter(Boolean);
}

function parseLengthUnit(value) {
  const match = String(value || "1/8").match(/(\d+)\s*\/\s*(\d+)/);
  return match ? Number(match[1]) / Number(match[2]) : 0.125;
}

function abcDurationUnits(text, unit) {
  const tokens = text
    .replace(/%.*$/gm, "")
    .replace(/![^!]*!/g, "")
    .replace(/\[[A-Za-z][A-Za-z0-9]*:[^\]]*\]/g, "")
    .replace(/"[^"]*"/g, "")
    .match(/(?:\[[^\]]+\]|[_=^]?[A-GGa-gxz][,']*)(?:\d+)?(?:\/\d*)?/g) || [];
  return tokens.reduce((total, token) => {
    if (token.startsWith("[")) {
      const chordDurations = [...token.matchAll(/[_=^]?[A-Ga-g][,']*(\d+)?(?:\/(\d*))?/g)]
        .map((match) => {
          const numerator = Number(match[1] || 1);
          const denominator = match[2] === "" ? 2 : Number(match[2] || 1);
          return numerator / denominator;
        });
      return total + (Math.max(...chordDurations, 1) * unit);
    }
    const suffix = token.match(/(\d+)?(?:\/(\d*))?$/);
    const numerator = Number(suffix?.[1] || 1);
    const denominator = suffix?.[2] === "" ? 2 : Number(suffix?.[2] || 1);
    return total + (numerator / denominator) * unit;
  }, 0);
}

function sanitizeMusic(music) {
  return music
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*%/.test(line) && !/^\s*[A-Za-z][A-Za-z0-9]*\s*:/.test(line))
    .map((line) => line.replace(/%.*$/, ""))
    .join(" ");
}

function makeRestsVisible(music) {
  return music.replace(/(^|[\s|])x(?=(?:\d|\/|[\s|]|$))/gi, "$1z");
}

function wrapMusicLines(music) {
  const pieces = music.split(/(\|)/);
  const lines = [];
  let line = "";
  let bars = 0;
  for (const piece of pieces) {
    if (piece === "|") {
      line = `${line.trim()}|`;
      bars += 1;
      if (bars >= 4 || line.length >= 96) {
        lines.push(line.trim());
        line = "";
        bars = 0;
      } else {
        line += " ";
      }
    } else if (piece.trim()) {
      line += `${piece.trim()} `;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}

function formatRest(duration, unit) {
  const units = Math.round((duration / unit) * 16) / 16;
  if (units <= 0.001) return "";
  if (Number.isInteger(units)) return ` z${Math.max(1, units)}`;
  return ` z${Math.round(units * 16)}/16`;
}

function readMidiProgram(text) {
  const match = text.match(/^\s*%%\s*MIDI\s+program\s+(?:\d+\s+)?(\d+)\s*$/im);
  return match ? Number(match[1]) : null;
}

function readMidiProgramLine(text) {
  const program = readMidiProgram(text);
  return program == null ? null : `%%MIDI program ${program}`;
}

function instrumentForProgram(program) {
  return Number(program) === 99 ? "atmosphere" : Number(program) === 98 ? "crystal" : "";
}

function inferPartInstrument(name, clef = "") {
  const value = `${name} ${clef}`.toLowerCase();
  if (/double\s*bass|contrabass/.test(value)) return "contrabass";
  if (/cello/.test(value)) return "cello";
  if (/viola|alto/.test(value)) return "viola";
  if (/violin|fiddle/.test(value)) return "violin";
  return /bass/.test(value) ? "cello" : "violin";
}

function readVoiceAttribute(attributes, name) {
  return attributes.match(new RegExp(`${name}\\s*=\\s*"([^"]+)"`, "i"))?.[1]?.trim() || "";
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
        const instrument = line.trim().match(/^Inst:\s*(.+)$/i);
        if (instrument) current.instrument = instrument[1].trim();
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

export function updatePartMetadata(source, updates) {
  const lines = source.split(/\r?\n/);
  const firstPart = lines.findIndex((line) => /^\s*Part:\s*/i.test(line));
  if (firstPart < 0) return source;
  const output = lines.slice(0, firstPart);
  const blocks = [];
  let block = [];
  for (const line of lines.slice(firstPart)) {
    if (/^\s*Part:\s*/i.test(line) && block.length) {
      blocks.push(block);
      block = [];
    }
    block.push(line);
  }
  if (block.length) blocks.push(block);

  blocks.forEach((partLines, index) => {
    const update = updates[index] || {};
    const existingInst = partLines.find((line) => /^\s*Inst\s*:/i.test(line))
      ?.match(/^\s*Inst\s*:\s*(.+)$/i)?.[1]?.trim();
    const midiProgram = readMidiProgram(partLines.join("\n"));
    const effectiveInstrument = existingInst || instrumentForProgram(midiProgram);
    const requestedInstrument = update.instrument?.trim();
    const instrumentChanged =
      requestedInstrument && requestedInstrument.toLowerCase() !== effectiveInstrument.toLowerCase();
    partLines.forEach((line) => {
      const partMatch = line.match(/^(\s*)Part:\s*(.+)$/i);
      if (partMatch) {
        output.push(update.name?.trim()
          ? `${partMatch[1]}Part: ${update.name.trim()}`
          : line);
        if (instrumentChanged && !existingInst) {
          output.push(`Inst: ${requestedInstrument}`);
        }
      } else if (instrumentChanged && /^\s*%%\s*MIDI\s+program\b/i.test(line)) {
        return;
      } else if (/^\s*Inst\s*:/i.test(line) && requestedInstrument) {
        output.push(`Inst: ${requestedInstrument}`);
      } else {
        output.push(line);
      }
    });
  });
  return output.join("\n");
}

function finalizePart(partial) {
  const body = partial.lines.join("\n").trim();
  const program = readMidiProgram(body);
  return {
    name: partial.name,
    transpose: partial.transpose,
    instrument: partial.instrument || instrumentForProgram(program) || undefined,
    body,
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
    const m = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
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
