/**
 * Small, source-level motif compiler.
 *
 * Motifs are deliberately expanded before abcjs sees the tune. This keeps
 * normal ABC playback/export behavior while allowing a compact composition
 * source such as:
 *
 *   Motif: rain = E2 D2 C2 B,2
 *   Call: rain transpose=-2 octave=1 dynamics=mf
 */

const MOTIF_DECLARATION_RE =
  /^\s*Motif\s*:\s*([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(.*?)\s*$/i;
const MOTIF_CALL_RE =
  /^\s*Call\s*:\s*([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*?))?\s*$/i;
const DYNAMICS = new Set(["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "sfz"]);
const PARAMETER_NAMES = new Set([
  "transpose",
  "octave",
  "repeat",
  "dynamics",
  "fragment",
]);

export function expandMotifs(source) {
  const motifs = new Map();
  const warnings = [];
  const annotations = [];
  const lines = String(source ?? "").split(/\r?\n/);

  for (const line of lines) {
    const declaration = line.match(MOTIF_DECLARATION_RE);
    if (!declaration) continue;
    const name = declaration[1].toLowerCase();
    if (!declaration[2]) {
      warnings.push(`Motif "${declaration[1]}" is empty`);
      continue;
    }
    if (motifs.has(name)) {
      warnings.push(`Motif "${declaration[1]}" is declared more than once; last wins`);
    }
    motifs.set(name, declaration[2]);
  }

  const expandedLines = lines.map((line, lineIndex) => {
    if (MOTIF_DECLARATION_RE.test(line)) return "";
    const call = line.match(MOTIF_CALL_RE);
    if (!call) return line;

    const motifName = call[1];
    const body = motifs.get(motifName.toLowerCase());
    if (!body) {
      warnings.push(`Unknown motif "${motifName}"`);
      return line;
    }

    const parsed = parseMotifParameters(call[2] ?? "", motifName, warnings);
    const expanded = expandMotifBody(body, parsed);
    annotations.push({
      name: motifName,
      parameters: parsed,
      line: lineIndex + 1,
      source: line,
      expanded,
    });
    return expanded;
  });

  return {
    source: expandedLines.join("\n"),
    warnings,
    annotations,
    motifs: [...motifs.keys()],
  };
}

function parseMotifParameters(raw, motifName, warnings) {
  const parameters = {
    transpose: 0,
    octave: 0,
    repeat: 1,
    dynamics: null,
    fragment: null,
  };
  const tokens = String(raw)
    .replace(/^\((.*)\)$/, "$1")
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator < 1) {
      warnings.push(`Motif "${motifName}" parameter "${token}" needs key=value`);
      continue;
    }
    const key = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1);
    if (!PARAMETER_NAMES.has(key)) {
      warnings.push(`Motif "${motifName}" has unknown parameter "${key}"`);
      continue;
    }
    if (key === "dynamics") {
      if (!DYNAMICS.has(value.toLowerCase())) {
        warnings.push(`Motif "${motifName}" dynamics must be ppp through fff or sfz`);
      } else {
        parameters.dynamics = value.toLowerCase();
      }
      continue;
    }
    if (key === "fragment") {
      const fragment = value.match(/^(first|last):([1-9]\d*)$/i);
      if (!fragment) {
        warnings.push(`Motif "${motifName}" fragment must be first:N or last:N`);
      } else {
        parameters.fragment = {
          side: fragment[1].toLowerCase(),
          count: Math.min(256, Number(fragment[2])),
        };
      }
      continue;
    }
    const number = Number(value);
    const limits = key === "repeat"
      ? [1, 16]
      : key === "octave"
        ? [-4, 4]
        : [-24, 24];
    if (!Number.isInteger(number) || number < limits[0] || number > limits[1]) {
      warnings.push(
        `Motif "${motifName}" ${key} must be an integer from ${limits[0]} to ${limits[1]}`,
      );
      continue;
    }
    parameters[key] = number;
  }
  return parameters;
}

function expandMotifBody(body, parameters) {
  let tokens = String(body).trim().split(/\s+/).filter(Boolean);
  if (parameters.fragment) {
    tokens = parameters.fragment.side === "first"
      ? tokens.slice(0, parameters.fragment.count)
      : tokens.slice(-parameters.fragment.count);
  }

  const transformed = tokens.map((token) =>
    parameters.transpose || parameters.octave
      ? transposeToken(token, parameters.transpose + parameters.octave * 12)
      : token,
  );
  const withDynamics = parameters.dynamics
    ? [`!${parameters.dynamics}!`, ...transformed]
    : transformed;
  return Array.from({ length: parameters.repeat }, () => withDynamics.join(" ")).join(" ");
}

function transposeToken(token, semitones) {
  if (!semitones || !/[A-Ga-g]/.test(token)) return token;
  let output = "";
  let cursor = 0;
  const noteRe = /([_^=]*)([A-Ga-g])([,']*)(\d*(?:\/\d*)?)/g;
  let match;
  while ((match = noteRe.exec(token)) !== null) {
    output += token.slice(cursor, match.index);
    const accidental = (match[1].match(/\^/g) || []).length -
      (match[1].match(/_/g) || []).length;
    const base = "CDEFGAB".indexOf(match[2].toUpperCase());
    const pitch = [0, 2, 4, 5, 7, 9, 11][base] +
      (match[2] === match[2].toLowerCase() ? 72 : 60) +
      match[3].split("").reduce((value, mark) => value + (mark === "'" ? 12 : -12), 0) +
      accidental + semitones;
    output += abcPitch(pitch) + match[4];
    cursor = match.index + match[0].length;
  }

  return output + token.slice(cursor);
}

export function transposeAbcToken(token, semitones) {
  return transposeToken(String(token ?? ""), Number(semitones) || 0);
}

function abcPitch(pitch) {
  const names = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
  const normalized = Math.max(0, Math.min(127, Math.round(pitch)));
  const octave = Math.floor((normalized - 60) / 12);
  const name = names[((normalized % 12) + 12) % 12];
  if (octave > 0) return name.toLowerCase() + "'".repeat(Math.max(0, octave - 1));
  if (octave < 0) return name + ",".repeat(-octave);
  return name;
}

export function formatMotifParameters(parameters) {
  const parts = [];
  if (parameters.transpose) parts.push(`tr:${parameters.transpose > 0 ? "+" : ""}${parameters.transpose}`);
  if (parameters.octave) parts.push(`oct:${parameters.octave > 0 ? "+" : ""}${parameters.octave}`);
  if (parameters.repeat !== 1) parts.push(`repeat:${parameters.repeat}`);
  if (parameters.dynamics) parts.push(parameters.dynamics);
  if (parameters.fragment) parts.push(`${parameters.fragment.side}:${parameters.fragment.count}`);
  return parts.join(" · ") || "exact";
}
