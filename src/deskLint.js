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
  if (visualObj) {
    lintFromTune(visualObj, issues);
  }
  if (meta?.parts?.length > 1) {
    lintParts(meta.parts, issues);
  }

  return issues.slice(0, 40);
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
