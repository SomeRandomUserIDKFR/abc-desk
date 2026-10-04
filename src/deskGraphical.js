import { transposeAbcToken } from "./deskMotifs.js";

const NOTE_TOKEN_RE = /^([_^=]*[A-Ga-g][,']*)(\d*(?:\/\d*)?)(.*)$/;

export function sourceCanBeEdited(source, prepared) {
  return Boolean(
    prepared &&
      !prepared.partInfo?.isMultiPart &&
      prepared.cleanAbc === source &&
      !/^\s*(?:Motif|Call)\s*:/im.test(source),
  );
}

export function addChordTone(source, start, end, semitones) {
  const token = source.slice(start, end);
  if (!NOTE_TOKEN_RE.test(token) || token.includes("&")) return null;
  const added = transposeAbcToken(token, semitones);
  const chord = token.startsWith("[")
    ? `${token.slice(0, -1)}${added}]`
    : `[${token}${added}]`;
  return replaceRange(source, start, end, chord);
}

export function moveNoteToOverlay(source, start, end, unit = 0.125) {
  const token = source.slice(start, end);
  if (!NOTE_TOKEN_RE.test(token) || token.startsWith("[")) return null;
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = source.indexOf("\n", end);
  const lineEnd = lineEndIndex < 0 ? source.length : lineEndIndex;
  const line = source.slice(lineStart, lineEnd);
  const localStart = start - lineStart;
  const localEnd = end - lineStart;
  const barStart = Math.max(line.lastIndexOf("|", localStart - 1) + 1, 0);
  const nextBar = line.indexOf("|", localEnd);
  const barEnd = nextBar < 0 ? line.length : nextBar;
  const before = line.slice(barStart, localStart);
  const after = line.slice(localEnd, barEnd);
  if (before.includes("&") || after.includes("&")) return null;

  const beforeUnits = musicDuration(before, unit);
  const noteUnits = musicDuration(token, unit);
  const afterUnits = musicDuration(after, unit);
  const original = [before.trim(), restForDuration(noteUnits, unit), after.trim()]
    .filter(Boolean)
    .join(" ");
  const moved = [
    restForDuration(beforeUnits, unit),
    token,
    restForDuration(afterUnits, unit),
  ]
    .filter(Boolean)
    .join(" ");
  const replacement = `${original} & ${moved}`;
  return replaceRange(source, lineStart + barStart, lineStart + barEnd, replacement);
}

export function appendGraphicalNote(source, note = "C") {
  const lines = String(source).split(/\r?\n/);
  let musicIndex = -1;
  for (let index = lines.length - 1; index >= 0; index--) {
    if (
      lines[index].trim() &&
      !/^\s*(?:[A-Za-z][A-Za-z0-9]*\s*:|%)/.test(lines[index])
    ) {
      musicIndex = index;
      break;
    }
  }
  if (musicIndex < 0) return null;
  lines[musicIndex] = `${lines[musicIndex].trimEnd()} ${note}`.trim();
  return lines.join("\n");
}

export function transposeGraphicalNote(source, start, end, semitones) {
  const token = source.slice(start, end);
  if (!NOTE_TOKEN_RE.test(token) || token.startsWith("[")) return null;
  const shifted = transposeAbcToken(token, semitones);
  return shifted === token ? null : replaceRange(source, start, end, shifted);
}

export function moveGraphicalNoteByStaffSteps(source, start, end, steps) {
  const token = source.slice(start, end);
  const match = token.match(NOTE_TOKEN_RE);
  if (!match || token.startsWith("[")) return null;
  const noteMatch = match[1].match(/^[_^=]*([A-Ga-g])([,']*)$/);
  if (!noteMatch) return null;
  const [, noteLetter, octaveMarks] = noteMatch;
  const suffix = `${match[2]}${match[3]}`;
  const letters = "CDEFGAB";
  const letterIndex = letters.indexOf(noteLetter.toUpperCase());
  if (letterIndex < 0) return null;
  const octave =
    (noteLetter === noteLetter.toLowerCase() ? 1 : 0) +
    (octaveMarks.match(/'/g) || []).length -
    (octaveMarks.match(/,/g) || []).length;
  const target = octave * 7 + letterIndex + Math.round(Number(steps) || 0);
  const targetOctave = Math.floor(target / 7);
  const targetLetter = letters[((target % 7) + 7) % 7];
  const targetToken =
    targetOctave >= 1
      ? `${targetLetter.toLowerCase()}${"'".repeat(targetOctave - 1)}`
      : `${targetLetter}${",".repeat(-targetOctave)}`;
  return replaceRange(source, start, end, `${targetToken}${suffix}`);
}

function replaceRange(source, start, end, replacement) {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function musicDuration(text, unit) {
  const cleaned = String(text)
    .replace(/%.*$/g, "")
    .replace(/![^!]*!/g, "")
    .replace(/"[^"]*"/g, "");
  const tokens = cleaned.match(/(?:\[[^\]]+\]|[_=^]?[A-Ga-gxz][,']*)(?:\d+)?(?:\/\d*)?/g) || [];
  return tokens.reduce((total, token) => {
    const duration = token.match(/(\d+)?(?:\/(\d*))?$/);
    const numerator = Number(duration?.[1] || 1);
    const denominator = duration?.[2] === "" ? 2 : Number(duration?.[2] || 1);
    return total + unit * numerator / denominator;
  }, 0);
}

function restForDuration(duration, unit) {
  if (duration <= 0) return "";
  const ratio = duration / unit;
  if (Number.isInteger(ratio)) return `z${ratio === 1 ? "" : ratio}`;
  const denominator = 16;
  const numerator = Math.max(1, Math.round(ratio * denominator));
  return `z${numerator}/${denominator}`;
}
