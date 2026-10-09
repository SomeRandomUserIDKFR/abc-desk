/**
 * Composition lint for ABC Desk — issues with optional source ranges.
 * @typedef {{ id: string, severity: 'error'|'warn'|'info', message: string, start?: number, end?: number }} LintIssue
 */

/**
 * @param {string} source editor source (may include Desk dialect)
 * @param {string} cleanAbc preprocessed ABC
 * @param {import('abcjs').TuneObject | null} visualObj
 * @param {object} [meta]
 * @returns {LintIssue[]}
 */
export function lintComposition(source, cleanAbc, visualObj, meta = {}) {
  /** @type {LintIssue[]} */
  const issues = [];

  lintStructure(source, cleanAbc, issues);
  lintDynamics(source, issues);
  lintHolds(source, issues);
  lintMismatchedTies(source, issues);
  lintMeterMeasures(source, issues);
  if (visualObj) {
    lintFromTune(visualObj, issues);
  }

  function lintMeterMeasures(source, issues) {
    const meter = readMeter(source);
    const length = readLengthUnit(source);
    if (!meter || !length) return;
    const expectedUnits = meter.numerator / meter.denominator / length;
    const bodyMatch = source.match(/^K:[^\n]*(?:\n|$)/im);
    if (!bodyMatch) return;

    const bodyStart = bodyMatch.index + bodyMatch[0].length;
    const body = source.slice(bodyStart);
    let measureStart = 0;
    let measureNumber = 1;
    const reportMeasure = (segment, endOffset) => {
      const units = overlayMeasureDuration(segment, length);
      if (units <= 0 || Math.abs(units - expectedUnits) <= 0.001) return;
      const short = units < expectedUnits;
      const difference = Math.abs(expectedUnits - units);
      const severity = short && measureNumber === 1 ? "info" : "warn";
      issues.push({
        id: `meter-measure-${measureNumber}-${bodyStart + measureStart}`,
        severity,
        message: `Measure ${measureNumber} is ${short ? "short" : "long"} by ${formatUnits(difference)} L-units (${formatUnits(units)} of ${formatUnits(expectedUnits)}; M:${meter.text})`,
        start: bodyStart + measureStart,
        end: bodyStart + Math.max(measureStart + 1, endOffset),
      });
    };
    for (const bar of body.matchAll(/\|:|:\||::|\|{1,2}/g)) {
      const segment = body.slice(measureStart, bar.index);
      if (!segment.trim()) {
        measureStart = bar.index + bar[0].length;
        continue;
      }
      reportMeasure(segment, bar.index);
      measureStart = bar.index + bar[0].length;
      measureNumber += 1;
    }
    const finalSegment = body.slice(measureStart);
    if (finalSegment.trim()) reportMeasure(finalSegment, body.length);
  }

  function readMeter(source) {
    const match = String(source).match(/^\s*M\s*:\s*([^\s%]+)/im);
    if (!match) return null;
    const value = match[1].trim();
    if (/^C\|$/i.test(value)) return { numerator: 2, denominator: 2, text: "C|" };
    if (/^C$/i.test(value)) return { numerator: 4, denominator: 4, text: "C" };
    const numeric = value.match(/^([0-9]+(?:\s*\+\s*[0-9]+)*)\s*\/\s*([0-9]+)/);
    if (!numeric) return null;
    const numerator = numeric[1]
      .split("+")
      .reduce((sum, part) => sum + Number(part), 0);
    return {
      numerator,
      denominator: Number(numeric[2]),
      text: `${numeric[1]}/${numeric[2]}`,
    };
  }

  function readLengthUnit(source) {
    const match = String(source).match(/^\s*L\s*:\s*(\d+)\s*\/\s*(\d+)/im);
    return match ? Number(match[1]) / Number(match[2]) : 0;
  }

  function overlayMeasureDuration(segment, unit) {
    return Math.max(
      ...segment
        .split("&")
        .map((voice) => musicDuration(voice, unit)),
      0,
    );
  }

  function musicDuration(segment, unit) {
    const cleaned = String(segment)
      .replace(/%.*$/gm, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/![^!]*!/g, "")
      .replace(/"[^"]*"/g, "");
    const tokenRe =
      /(\((\d+))?|(?:\[[^\]]+\]|[_^=]*[A-Ga-gxzZ][,']*)(\d+)?(?:\/(\d*))?([<>]?)/g;
    let total = 0;
    let tuplet = null;
    let previousDuration = 0;
    for (const match of cleaned.matchAll(tokenRe)) {
      if (match[2]) {
        const count = Number(match[2]);
        tuplet = count > 0 ? { remaining: count, factor: (count - 1) / count } : null;
        continue;
      }
      const numerator = Number(match[3] || 1);
      const denominator = match[4] === "" ? 2 : Number(match[4] || 1);
      let duration = numerator / denominator;
      if (tuplet) {
        duration *= tuplet.factor;
        tuplet.remaining -= 1;
        if (tuplet.remaining <= 0) tuplet = null;
      }
      if (match[5] === ">") {
        total -= previousDuration / 3;
        duration *= 4 / 3;
      } else if (match[5] === "<") {
        total += previousDuration / 3;
        duration *= 2 / 3;
      }
      total += duration;
      previousDuration = duration;
    }
    return total;
  }

  function formatUnits(units) {
    return Number.isInteger(units)
      ? String(units)
      : String(Number(units.toFixed(2)));
  }
  if (meta?.parts?.length > 1) {
    lintParts(meta.parts, issues);
  }

  return issues.slice(0, 40);
}

function lintMismatchedTies(source, issues) {
  const bodyStart = source.search(/^K:[^\n]*\n?/im);
  if (bodyStart < 0) return;
  const body = source.slice(bodyStart);
  const tieRe = /([_^=]*[A-Ga-g][,']*(?:\d+)?(?:\/+\d*)?)[ \t]*-[ \t]*([_^=]*[A-Ga-g][,']*(?:\d+)?(?:\/+\d*)?)/g;
  let match;
  while ((match = tieRe.exec(body)) !== null) {
    const left = parseTiePitch(match[1]);
    const right = parseTiePitch(match[2]);
    if (left == null || right == null || left === right) continue;
    const start = bodyStart + match.index;
    issues.push({
      id: `mismatched-tie-${start}`,
      severity: "warn",
      message: `Tie connects different pitches (“${match[1]}-${match[2]}”) — plays normally; use (${match[1].replace(/\d.*$/, "")}${match[2].replace(/\d.*$/, "")}) for a slur or !glissando! for a slide`,
      start,
      end: start + match[0].length,
    });
  }
}

function parseTiePitch(token) {
  const match = String(token).match(/^([_^=]*)([A-Ga-g])([,']*)/);
  if (!match) return null;
  const accidental =
    match[1].split("").reduce(
      (value, mark) => value + (mark === "^" ? 1 : mark === "_" ? -1 : 0),
      0,
    );
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[2].toUpperCase()];
  const octave = (match[2] === match[2].toLowerCase() ? 1 : 0) +
    match[3].split("").reduce(
      (value, mark) => value + (mark === "'" ? 1 : -1),
      0,
    );
  return octave * 12 + base + accidental;
}

/** @param {LintIssue[]} issues */
function lintStructure(source, cleanAbc, issues) {
  if (!/^\s*X:/m.test(cleanAbc) && !/^Part:/im.test(source)) {
    issues.push({
      id: "missing-x",
      severity: "warn",
      message: "No X: reference — add X:1 (or a Part: block)",
      start: 0,
      end: Math.min(20, source.length),
    });
  }
  if (!/^\s*K:/m.test(cleanAbc)) {
    const m = source.search(/^K:/im);
    issues.push({
      id: "missing-k",
      severity: "error",
      message: "Missing K: key — required to end the header",
      start: m >= 0 ? m : 0,
      end: m >= 0 ? m + 2 : 8,
    });
  }
  const body = cleanAbc.replace(/^[\s\S]*?^K:[^\n]*\n?/m, "");
  if (!/[A-Ga-gzxZ]/.test(body)) {
    issues.push({
      id: "empty-body",
      severity: "warn",
      message: "No notes in the tune body yet",
    });
  }
}

/** @param {LintIssue[]} issues */
function lintDynamics(source, issues) {
  const pairs = [
    ["crescendo(", "crescendo)", "crescendo"],
    ["diminuendo(", "diminuendo)", "diminuendo"],
    ["descendo(", "descendo)", "diminuendo"],
    ["decrescendo(", "decrescendo)", "diminuendo"],
  ];
  for (const [open, close, label] of pairs) {
    const openRe = new RegExp(`!${open.replace("(", "\\(")}!`, "gi");
    const closeRe = new RegExp(`!${close.replace(")", "\\)")}!`, "gi");
    const opens = [...source.matchAll(openRe)];
    const closes = [...source.matchAll(closeRe)];
    if (opens.length > closes.length) {
      const last = opens[opens.length - 1];
      issues.push({
        id: `unclosed-${label}`,
        severity: "warn",
        message: `Unclosed ${label} hairpin — add !${close}!`,
        start: last.index,
        end: last.index + last[0].length,
      });
    }
  }
}

/** Flag long holds that sit under busy figuration in the same measure-ish window. */
function lintHolds(source, issues) {
  // Whole-ish holds: letter + 8 (with L:1/8) or A4-style longs in body
  const holdRe = /([_^=]*[A-Ga-g][,']*)(8|16)\b/g;
  let match;
  while ((match = holdRe.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    // Look ahead ~80 chars for dense eighth motion
    const window = source.slice(end, end + 100);
    const shortNotes = (window.match(/[A-Ga-g]/g) || []).length;
    if (shortNotes >= 6) {
      issues.push({
        id: `hold-bury-${start}`,
        severity: "info",
        message: `Long hold “${match[0]}” under busy motion — may bury the line in playback`,
        start,
        end,
      });
    }
  }
}

/** @param {LintIssue[]} issues */
function lintFromTune(visualObj, issues) {
  const warnings = visualObj.warnings || [];
  for (const w of warnings.slice(0, 8)) {
    const text = String(w);
    // Skip HTML-heavy unknown-deco spam we already filter elsewhere
    if (/Unknown decoration/i.test(text)) continue;
    issues.push({
      id: `abcjs-${issues.length}`,
      severity: "warn",
      message: text.replace(/<[^>]+>/g, "").slice(0, 160),
    });
  }

  // Pitch range from setUpAudio if available
  try {
    const audio = visualObj.setUpAudio?.({}) || null;
    if (!audio?.tracks) return;
    let lo = 128;
    let hi = 0;
    let loChar = null;
    let hiChar = null;
    for (const track of audio.tracks) {
      for (const ev of track) {
        if (ev.cmd !== "note" || ev.pitch == null) continue;
        if (ev.pitch < lo) {
          lo = ev.pitch;
          loChar = ev.startChar;
        }
        if (ev.pitch > hi) {
          hi = ev.pitch;
          hiChar = ev.startChar;
        }
      }
    }
    if (hi >= 88) {
      issues.push({
        id: "range-high",
        severity: "info",
        message: `Very high pitch (MIDI ${hi}) — check octave marks`,
        start: hiChar ?? undefined,
        end: hiChar != null ? hiChar + 1 : undefined,
      });
    }
    if (lo <= 28 && lo < 128) {
      issues.push({
        id: "range-low",
        severity: "info",
        message: `Very low pitch (MIDI ${lo}) — check commas / bass octave`,
        start: loChar ?? undefined,
        end: loChar != null ? loChar + 1 : undefined,
      });
    }
  } catch {
    /* setUpAudio can throw on incomplete tunes */
  }
}

/** @param {LintIssue[]} issues */
function lintParts(parts, issues) {
  const meters = new Set(
    parts.map((p) => p.meter || "").filter(Boolean),
  );
  if (meters.size > 1) {
    issues.push({
      id: "part-meter-mismatch",
      severity: "warn",
      message: `Parts use different meters (${[...meters].join(", ")}) — assembly may misalign`,
    });
  }
}
