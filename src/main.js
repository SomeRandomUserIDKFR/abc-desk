import "./style.css";
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";
import {
  parseDeskHeaders,
  toStrictAbc,
  deskAudioParams,
  deskStatusFragment,
  filterDecorationWarnings,
} from "./deskDialect.js";
import {
  formatForDesk,
  formatToStandard,
  formatMeasures,
  removeExtraSpaces,
  normalizeInlineOverlayMeasures,
  parseParts,
} from "./deskParts.js";
import { expandMotifs, formatMotifParameters } from "./deskMotifs.js";
import {
  addChordTone,
  appendGraphicalNote,
  moveNoteToOverlay,
  sourceCanBeEdited,
} from "./deskGraphical.js";
import { lintComposition } from "./deskLint.js";
import { readShareFromLocation, copyShareUrl } from "./deskShare.js";
import { createDeskPlayer, createTestingPlayer } from "./deskPlayer.js";
import songTxt from "../Song.txt?raw";

const SAMPLES = {
  cooleys: `X:1
T:Cooley's
Inst: fiddle
Tone: swing
M:4/4
L:1/8
R:reel
K:Emin
|:D2|EBBA B2 EB|B2 AB dBAG|FDAD BDAD|FDAD dAFD|
EBBA B2 EB|B2 AB defg|afe^c dBAF|DEFD E2:|
|:gf|eB B2 gBfB|eB B2 gedB|A2 FA DAFA|A2 FA defg|
eB B2 gBfB|eB B2 defg|afe^c dBAF|DEFD E2:|`,

  lanterns: `X:1
T:Lanterns on the Water
C:ABC Desk original
Inst: violin
Tone: emotional
Human: 0.34
Room: chamber
Distance: 0.35
M:6/8
L:1/8
Q:1/4=68
K:Dm
V:1 name="Solo violin"
!p! (DFA d2c2 | A2G2 F2 | !crescendo(! EFG A2B2 | c4 A2 !crescendo)! |
!f! d2c2 A2 | G2F2 E2 | !diminuendo(! D2F2 A2 | D6 !diminuendo)! |
!p! (A,DF A2G2 | F2E2 D2 | !crescendo(! FGA c2d2 | e4 c2 !crescendo)! |
!f! f2e2 d2 | c2A2 F2 | !diminuendo(! E2D2 C2 | D6 !diminuendo)!:|`,

  twinkle: `X:1
T:Twinkle Twinkle Little Star
C:Traditional
%%desk-instrument flute
%%desk-tone soft
M:4/4
L:1/4
Q:1/4=100
K:C
C C G G | A A G2 | F F E E | D D C2 |
G G F F | E E D2 | G G F F | E E D2 |
C C G G | A A G2 | F F E E | D D C2 |`,

  bach: `X:1
T:Minuet in G
C:J.S. Bach
I:desk-instrument harpsichord
I:desk-tone warm
M:3/4
L:1/8
Q:1/4=104
K:G
D2 |"G"B3 A B2|"D"A3 G A2|"G"G3 F G2|"D"A4 D2|
"G"B3 A B2|"D"A3 G A2|"Em"G3 F E2|"D"D4:|
|:A2 |"D"c3 B c2|"G"B3 A B2|"D"A3 G F2|"G"G4 D2|
"C"E3 F G2|"G"D3 E D2|"D"C3 B, A,2|"G"G,4:|`,

  blues: `X:1
T:Simple Blues
Inst: jazz guitar
Tone: warm
M:4/4
L:1/8
Q:1/4=90
K:C
|"C"C2 E2 G2 c2|"F"F2 A2 c2 A2|"C"C2 E2 G2 E2|"C"C4 z4|
|"F"F2 A2 c2 A2|"F"F2 A2 c2 A2|"C"C2 E2 G2 E2|"C"C4 z4|
|"G"G2 B2 d2 B2|"F"F2 A2 c2 A2|"C"C2 E2 G2 c2|"G"G4 z4|`,

  expression: `X:1
T:Desk Expression Pack
Inst: atmosphere
Tone: warm
M:4/4
L:1/8
Q:1/4=96
K:C
!ascent!C2 D2 E2 G2 | !cluster!c4 !grit!e4 | !whisper!G2 !snap!c2 !smear!e2 !choke!g2 |
!p! !crescendo(! C2 E2 G2 c2 | e2 g2 c'2 e'2 !crescendo)! !ff! |
!descendo(! e'2 c'2 g2 e2 | c2 G2 E2 C2 !descendo)! !pp! |
!gimplus! !cluster!c8 | z8 |`,

  expansion: `X:1
T:ABC Desk Expansion Pack
Inst: violin
Tone: rustic
Human: 0.28
Room: concert
Players: 4
Distance: 0.65
M:4/4
L:1/8
Q:1/4=84
K:Gm
V:1 name="Violin I"
!p! (GABc d2c2 | BAGF G4 | [Tone:warm] (ABcd e2d2 | cBAG A4 |
!crescendo(! B2d2 g2a2 | b2a2 g2f2 !crescendo)! |
[Tone:emotional] (edcB A2G2 | F4 z4 |
V:2 name="Violin II"
z4 (D2G2 | A2B2 c4 | z4 [Tone:sorrow] (D2F2 |
G2A2 B4 | d2c2 B2A2 | G4 z4 |
(G2A2 B2c2 | d8 |`,

articulation: `X:1
T:ABC Desk Articulation Lab
Inst: violin
Tone: warm
Human: 0.24
Room: chamber
Players: 2
M:4/4
L:1/8
Q:1/4=96
K:Dm
!staccato!D !staccato!F !staccato!A !staccato!d |
!tenuto!d2 !marcato!c2 !tremolo!A4 |
(D2F2 A2d2) | !marcato!c2 !staccato!A2 D4 |`,

  strings: `X:1
T:Four Strings Register Showcase
Inst: string
Tone: emotional
Human: 0.24
Room: concert
Players: 3
M:4/4
L:1/4
Q:1/4=72
K:C
C,, G,, C, G, | C G c e | g a b c' | e' d' c' G |
G,, C, D, G, | C E G c | d' c' a g | C4 |`,

ensemble: `Part: flute
Inst: flute
Trans: 0
X:1
T:Desk Ensemble
M:4/4
L:1/8
Q:1/4=100
K:C
c2 e2 g2 c'2 | g2 e2 c4 | d2 f2 a2 d'2 | a2 f2 d4 |

Part: clarinet
Inst: clarinet
Trans: -2
X:1
M:4/4
L:1/8
K:C
e2 g2 c'2 e'2 | c'2 g2 e4 | f2 a2 d'2 f'2 | d'2 a2 f4 |

Part: bass
Inst: bass
Trans: 0
X:1
M:4/4
L:1/8
K:C bass
C,2 E,2 G,2 C2 | G,2 E,2 C,4 | D,2 F,2 A,2 D2 | A,2 F,2 D,4 |`,

  ensembleStress: `X:1
T:Violin Ensemble Stress Test
Inst: violin
Tone: warm
Human: 0.35
Room: concert
Players: 8
Distance: 0.7
M:4/4
L:1/8
Q:1/4=88
K:Dm
V:1 name="Lead"
(DFGA d2c2 | BAGF E2D2 | (DEFG A2G2 | FEDC D4 |
!gimplus!d2c2 BAGF | E2F2 G2A2 | d4 c2A2 | G8 |
V:2 name="Counterpoint"
z4 A2F2 | G2E2 F2D2 | z4 (ABcd | e2d2 c2A2 |
F2A2 d2c2 | B2G2 A2F2 | D4 z4 | A,8 |`,

  broken: songTxt,
};

const shared = readShareFromLocation();

function presetInstrument(source, instrument, humanAmount = null) {
  const lines = String(source).split(/\r?\n/);
  const instrumentLine = /^\s*Inst\s*:/i;
  const midiLine = /^\s*%%MIDI\s+program\b/i;
  const humanLine = /^\s*(?:Human|Imperfect)\s*:/i;
  let foundInstrument = false;
  let foundHumanization = false;
  const preset = lines.map((line) => {
    if (instrumentLine.test(line)) {
      foundInstrument = true;
      return `Inst: ${instrument}`;
    }
    if (midiLine.test(line)) {
      foundInstrument = true;
      return "%%MIDI program 40";
    }
    if (humanLine.test(line) && humanAmount != null) {
      foundHumanization = true;
      return `Human: ${humanAmount}`;
    }
    return line;
  });

  if (!foundInstrument) {
    const keyIndex = preset.findIndex((line) => /^\s*K\s*:/i.test(line));
    preset.splice(keyIndex >= 0 ? keyIndex : 0, 0, `Inst: ${instrument}`);
  }
  if (humanAmount != null && !foundHumanization) {
    const keyIndex = preset.findIndex((line) => /^\s*K\s*:/i.test(line));
    preset.splice(keyIndex >= 0 ? keyIndex : 0, 0, `Human: ${humanAmount}`);
  }
  return preset.join("\n");
}

const frameworkHash = window.location.hash.toLowerCase();
const oldFramework = frameworkHash === "#oldframework";
const testingFramework = frameworkHash === "#testingframework";
const violinPreset = frameworkHash === "#violin";
const museScoreFramework = frameworkHash === "#musescore";
const graphicalEditorFramework = frameworkHash === "#graphicaleditor";
const experimentalFramework = !oldFramework;
const DEFAULT_ABC =
  shared ||
  (violinPreset
    ? presetInstrument(SAMPLES.cooleys, "violin", 0.28)
    : SAMPLES.cooleys);

const app = document.querySelector("#app");
document.body.classList.toggle("graphical-editor", graphicalEditorFramework);

app.innerHTML = `
  <header class="hero">
    <h1 class="brand">ABC <em>Desk</em></h1>
    <p class="tagline">Compose in text — lint, multi-part scores, attack marks, share links. <code>Inst:</code> / <code>%%MIDI</code>, <code>Part:</code>, <code>!gimplus!</code>.</p>
    <div class="customization">
      <button type="button" id="customize" aria-expanded="false" aria-controls="customization-menu">Customize</button>
      <div id="customization-menu" class="customization-menu" hidden>
        <label for="cursor-style">Cursor style</label>
        <select id="cursor-style">
          <option value="classic">Classic bar</option>
          <option value="serif">Serif</option>
          <option value="double-note">Double note</option>
          <option value="wild-cards">Wild cards</option>
          <option value="mimic-note">Mimic note</option>
          <option value="next-note">Next note</option>
        </select>
        <button type="button" id="equalizer-open">Equalizer</button>
      </div>
    </div>
  </header>
  <div id="equalizer-panel" class="equalizer-panel" hidden>
    <div class="equalizer-header">
      <strong>Equalizer</strong>
      <button type="button" id="equalizer-close">Close</button>
    </div>
    <label class="equalizer-enabled"><input id="equalizer-enabled" type="checkbox"> On</label>
    <label for="equalizer-preset">Preset</label>
    <select id="equalizer-preset">
      <option value="flat">Flat</option>
      <option value="warm">Warm</option>
      <option value="bright">Bright</option>
      <option value="piano">Piano clarity</option>
      <option value="bass-cut">Bass reduction</option>
    </select>
    <div id="equalizer-bands" class="equalizer-bands"></div>
  </div>
  <main class="workspace">
    <section class="panel editor-panel" aria-label="ABC source">
      <div class="panel-header">
        <h2 class="panel-title">Source</h2>
        <div class="toolbar">
          <label class="sr-only" for="sample">Sample tune</label>
          <select id="sample" title="Load a sample">
            <option value="cooleys">Cooley's</option>
            <option value="lanterns">Lanterns on the Water</option>
            <option value="twinkle">Twinkle</option>
            <option value="bach">Bach</option>
            <option value="blues">Blues</option>
            <option value="expression">Expression pack</option>
            <option value="expansion">Expansion pack</option>
            <option value="articulation">Articulation lab</option>
            <option value="strings">Four strings showcase</option>
            <option value="ensemble">Ensemble (Part:)</option>
            <option value="ensembleStress">Ensemble stress test</option>
            <option value="broken">Broken Reflection</option>
          </select>
          <button type="button" id="copy">Copy</button>
          <button type="button" id="copy-strict" title="Strip Desk tags; keep MIDI program">Copy strict</button>
          <button type="button" id="format-desk" title="Convert standard V: voices into Part: blocks">Format for ABC Desk</button>
          <button type="button" id="format-standard" title="Merge Part: blocks into standard V: voices by clef">Format to standard</button>
          <label class="measure-format">
            Measures/line
            <input id="measures-per-line" type="number" min="1" max="32" value="4" inputmode="numeric">
          </label>
          <button type="button" id="format-measures" title="Reflow music while preserving non-musical lines">Format measures</button>
          <button type="button" id="remove-extra-spaces" title="Reduce runs of three or more spaces to two">Remove extra spaces</button>
          <button type="button" id="add-padding" title="Add only required rests to align overlay voices">Add padding</button>
          <button type="button" id="share" title="Copy shareable URL">Share</button>
          <button type="button" id="clear">Clear</button>
        </div>
      </div>
      <textarea id="editor" spellcheck="false" aria-label="ABC notation editor"></textarea>
      <div class="lint-panel" aria-label="Composition lint">
        <div class="lint-header">
          <h2 class="panel-title">Lint</h2>
          <span id="lint-count" class="lint-count">0</span>
        </div>
        <ul id="lint-list" class="lint-list"></ul>
      </div>
    </section>
    <section class="panel score-panel" aria-label="Rendered score">
      <div class="panel-header">
        <h2 class="panel-title">Score</h2>
        <div class="toolbar">
          <button type="button" class="primary" id="render-now">Render</button>
          <label class="score-view">
            View
            <select id="motif-view" title="Choose how motif callbacks appear in the score">
              <option value="expanded">Expanded music</option>
              <option value="annotated">Motif callbacks</option>
            </select>
          </label>
          <button type="button" id="download-midi" title="Download current tune as MIDI">MIDI</button>
          <button type="button" id="download-wav" title="Download current tune as WAV">WAV</button>
          <button type="button" id="download-pdf" title="Save the rendered score as PDF">PDF</button>
          <button type="button" id="download-png" title="Save the rendered score as PNG">PNG</button>
          <button type="button" id="download-jpeg" title="Save the rendered score as JPEG">JPEG</button>
        </div>
      </div>
      <div class="audio-row">
        <div id="audio"></div>
      </div>
      ${
        experimentalFramework && !museScoreFramework
          ? `<div id="testing-panel" class="lint-panel" aria-label="Player experiment">
              <div class="lint-header"><h2 class="panel-title">Player experiment</h2><span class="lint-count">${testingFramework ? "#testingframework" : violinPreset ? "#violin" : "default"}</span></div>
              <p id="testing-metrics" class="lint-empty">Render a tune to inspect normalized playback events.</p>
              <div id="performance-timeline" class="performance-timeline" aria-label="Performance timeline" hidden>
                <div class="timeline-header"><span>Performance map</span><span id="timeline-time">0.0s</span></div>
                <div class="timeline-polyphony">
                  <label for="timeline-polyphony">Polyphony</label>
                  <input id="timeline-polyphony" type="range" min="0" max="100" step="1" value="50" aria-describedby="timeline-polyphony-value">
                  <output id="timeline-polyphony-value" for="timeline-polyphony">1x</output>
                </div>
                <div class="timeline-track">
                  <div id="timeline-phrases" class="timeline-layer timeline-phrases"></div>
                  <div id="timeline-expression" class="timeline-layer timeline-expression"></div>
                  <div id="timeline-tempo" class="timeline-layer timeline-tempo"></div>
                  <div id="timeline-passives" class="timeline-layer timeline-passives"></div>
                  <div id="timeline-playhead" class="timeline-playhead"></div>
                </div>
                <div id="timeline-legend" class="timeline-legend"></div>
              </div>
            </div>`
          : ""
      }
      <div class="score-wrap">
        <div id="paper"></div>
      </div>
      <div id="status" class="status" role="status">Ready</div>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .tagline code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    color: var(--accent-soft);
  }
  .customization {
    position: relative;
    align-self: flex-start;
  }
  .customization-menu {
    position: absolute;
    z-index: 2;
    top: calc(100% + 0.45rem);
    right: 0;
    min-width: 8rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: 0.65rem;
    background: var(--panel);
    color: var(--muted);
    box-shadow: 0 0.7rem 1.5rem rgba(0, 0, 0, 0.2);
  }
  .customization-menu label {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--text);
    font-size: 0.8rem;
  }
  .customization-menu select {
    min-width: 9rem;
  }
`;
document.head.appendChild(style);

const editor = document.querySelector("#editor");
const paper = document.querySelector("#paper");
const statusEl = document.querySelector("#status");
const sampleSelect = document.querySelector("#sample");
const formatDeskBtn = document.querySelector("#format-desk");
const formatStandardBtn = document.querySelector("#format-standard");
const formatMeasuresBtn = document.querySelector("#format-measures");
const removeExtraSpacesBtn = document.querySelector("#remove-extra-spaces");
const addPaddingBtn = document.querySelector("#add-padding");
const measuresPerLine = document.querySelector("#measures-per-line");
const audioEl = document.querySelector("#audio");
const lintList = document.querySelector("#lint-list");
const lintCount = document.querySelector("#lint-count");
const downloadMidiBtn = document.querySelector("#download-midi");
const downloadWavBtn = document.querySelector("#download-wav");
const downloadPdfBtn = document.querySelector("#download-pdf");
const downloadPngBtn = document.querySelector("#download-png");
const downloadJpegBtn = document.querySelector("#download-jpeg");
const motifViewSelect = document.querySelector("#motif-view");
const customizeBtn = document.querySelector("#customize");
const customizationMenu = document.querySelector("#customization-menu");
const cursorStyleSelect = document.querySelector("#cursor-style");
const testingMetrics = document.querySelector("#testing-metrics");
const performanceTimeline = document.querySelector("#performance-timeline");
const timelinePhrases = document.querySelector("#timeline-phrases");
const timelineExpression = document.querySelector("#timeline-expression");
const timelineTempo = document.querySelector("#timeline-tempo");
const timelinePassives = document.querySelector("#timeline-passives");
const timelinePlayhead = document.querySelector("#timeline-playhead");
const timelineLegend = document.querySelector("#timeline-legend");
const timelinePolyphony = document.querySelector("#timeline-polyphony");
const timelinePolyphonyValue = document.querySelector("#timeline-polyphony-value");
const equalizerOpen = document.querySelector("#equalizer-open");
const equalizerClose = document.querySelector("#equalizer-close");
const equalizerPanel = document.querySelector("#equalizer-panel");
const equalizerEnabled = document.querySelector("#equalizer-enabled");
const equalizerPreset = document.querySelector("#equalizer-preset");
const equalizerBands = document.querySelector("#equalizer-bands");
let motifView = window.localStorage.getItem("abc-desk-motif-view") ?? "expanded";
motifViewSelect.value = motifView;
motifViewSelect.addEventListener("change", () => {
  motifView = motifViewSelect.value;
  window.localStorage.setItem("abc-desk-motif-view", motifView);
  if (lastPrepared) renderMotifAnnotations(lastPrepared.motif.annotations);
});

function replaceEditorValue(value) {
  if (value === editor.value) return false;
  editor.focus();
  editor.setSelectionRange(0, editor.value.length);
  if (!document.execCommand("insertText", false, value)) {
    editor.value = value;
  }
  editor.setSelectionRange(value.length, value.length);
  return true;
}

function replaceEditorSelection(value) {
  editor.focus();
  if (!document.execCommand("insertText", false, value)) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.setRangeText(value, start, end, "end");
  }
}

customizeBtn.addEventListener("click", () => {
  const open = customizationMenu.hidden;
  customizationMenu.hidden = !open;
  customizeBtn.setAttribute("aria-expanded", String(open));
});

const savedCursorStyle = window.localStorage.getItem("abc-desk-cursor-style") ?? "classic";
cursorStyleSelect.value = savedCursorStyle;
document.documentElement.dataset.cursorStyle = savedCursorStyle;
cursorStyleSelect.addEventListener("change", () => {
  const style = cursorStyleSelect.value;
  document.documentElement.dataset.cursorStyle = style;
  window.localStorage.setItem("abc-desk-cursor-style", style);
});
const timelineTime = document.querySelector("#timeline-time");
const supportsAudio = abcjs.synth.supportsAudio();

editor.value = DEFAULT_ABC;
if (shared) {
  sampleSelect.value = "";
}

let player = null;
let renderTimer = null;
let lastVisualObj = null;
let lastPrepared = null;
let polyphonySliderPosition = 50;
const equalizerFrequencies = [62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const equalizerSettings = {
  enabled: false,
  bands: Object.fromEntries(equalizerFrequencies.map((frequency) => [frequency, 0])),
};

function polyphonyScaleFromSlider(position) {
  const value = Math.max(0, Math.min(100, Number(position) || 0));
  if (value >= 100) return Infinity;
  if (value <= 50) return 10 ** (value / 25 - 2);
  return 10 ** (((value - 50) / 45) * 2);
}

function formatPolyphonyScale(scale) {
  if (!Number.isFinite(scale)) return "∞";
  if (scale >= 10) return `${Math.round(scale)}x`;
  if (scale >= 1) return `${scale.toFixed(1).replace(/\.0$/, "")}x`;
  return `${scale.toFixed(2)}x`;
}

function createAudioParams(meta) {
  return deskAudioParams(meta, {
    polyphonyScale: polyphonyScaleFromSlider(polyphonySliderPosition),
    equalizer: equalizerSettings,
  });
}

const equalizerPresets = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  warm: [2, 2, 1, 0, -1, -1, -1, -2, -2],
  bright: [-2, -1, 0, 1, 2, 3, 4, 3, 2],
  piano: [-2, -1, 0, 1, 2, 2, 1, 2, 0],
  "bass-cut": [-5, -3, -2, 0, 1, 1, 1, 0, 0],
};

function formatEqualizerFrequency(frequency) {
  return frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`;
}

function syncEqualizerControls() {
  equalizerEnabled.checked = equalizerSettings.enabled;
  for (const frequency of equalizerFrequencies) {
    const input = equalizerBands.querySelector(`[data-frequency="${frequency}"]`);
    const output = equalizerBands.querySelector(`[data-output="${frequency}"]`);
    const value = Number(equalizerSettings.bands[frequency]) || 0;
    if (input) input.value = String(value);
    if (output) output.textContent = `${value > 0 ? "+" : ""}${value} dB`;
  }
}

for (const frequency of equalizerFrequencies) {
  const row = document.createElement("label");
  row.className = "equalizer-band";
  row.innerHTML = `<span>${formatEqualizerFrequency(frequency)}</span><input type="range" min="-12" max="12" step="1" value="0" data-frequency="${frequency}" aria-label="${formatEqualizerFrequency(frequency)} gain"><output data-output="${frequency}">0 dB</output>`;
  equalizerBands.append(row);
  row.querySelector("input").addEventListener("input", (event) => {
    const value = Number(event.target.value) || 0;
    equalizerSettings.bands[frequency] = value;
    row.querySelector("output").textContent = `${value > 0 ? "+" : ""}${value} dB`;
  });
  row.querySelector("input").addEventListener("change", applyAudioSettings);
}

equalizerOpen?.addEventListener("click", () => {
  equalizerPanel.hidden = false;
});
equalizerClose?.addEventListener("click", () => {
  equalizerPanel.hidden = true;
});
equalizerEnabled?.addEventListener("change", () => {
  equalizerSettings.enabled = equalizerEnabled.checked;
  applyAudioSettings();
});
equalizerPreset?.addEventListener("change", () => {
  const preset = equalizerPresets[equalizerPreset.value] ?? equalizerPresets.flat;
  equalizerFrequencies.forEach((frequency, index) => {
    equalizerSettings.bands[frequency] = preset[index];
  });
  syncEqualizerControls();
  applyAudioSettings();
});
syncEqualizerControls();

function applyAudioSettings() {
  if (player?.loaded && lastVisualObj && lastPrepared) {
    player.setTune(lastVisualObj, createAudioParams(lastPrepared.meta));
    updateTestingMetrics();
  }
}

function refreshPolyphonyControl() {
  const scale = polyphonyScaleFromSlider(polyphonySliderPosition);
  if (timelinePolyphony) timelinePolyphony.value = String(polyphonySliderPosition);
  if (timelinePolyphonyValue) {
    timelinePolyphonyValue.textContent = formatPolyphonyScale(scale);
  }
}

function applyPolyphonySetting() {
  if (player?.loaded && lastVisualObj && lastPrepared) {
    const audioParams = createAudioParams(lastPrepared.meta);
    player.setTune(lastVisualObj, audioParams);
    updateTestingMetrics();
  }
}

timelinePolyphony?.addEventListener("input", () => {
  polyphonySliderPosition = Number(timelinePolyphony.value);
  refreshPolyphonyControl();
});

timelinePolyphony?.addEventListener("change", () => {
  polyphonySliderPosition = Number(timelinePolyphony.value);
  applyPolyphonySetting();
});
refreshPolyphonyControl();
let renderGen = 0;

function safeFileStem(raw) {
  const base = String(raw || "untitled")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return base || "untitled";
}

function tuneFileStem() {
  return safeFileStem(lastVisualObj?.metaText?.title ?? "untitled");
}

function triggerDownloadFromUrl(
  url,
  fileName,
  { revoke = true, revokeDelayMs = 10000 } = {},
) {
  const link = document.createElement("a");
  document.body.appendChild(link);
  link.setAttribute("style", "display:none;");
  link.href = url;
  link.download = fileName;
  link.click();
  if (revoke && /^blob:/i.test(url)) {
    window.setTimeout(
      () => window.URL.revokeObjectURL(url),
      Math.max(1000, revokeDelayMs),
    );
  }
  document.body.removeChild(link);
}

function triggerDownloadFromBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  triggerDownloadFromUrl(url, fileName);
}

function toMidiBytes(midiPayload) {
  if (midiPayload instanceof Uint8Array) return midiPayload;
  if (midiPayload instanceof ArrayBuffer) return new Uint8Array(midiPayload);
  if (typeof midiPayload === "string") {
    const base64Match = midiPayload.match(/^data:audio\/midi;base64,(.*)$/i);
    let decoded = "";
    if (base64Match) {
      decoded = atob(base64Match[1]);
    } else if (/^data:audio\/midi,/i.test(midiPayload)) {
      const encoded = midiPayload.replace(/^data:audio\/midi,/i, "");
      decoded = decodeURIComponent(encoded);
    } else {
      decoded = midiPayload;
    }
    const out = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i) & 0xff;
    return out;
  }
  throw new Error("Unexpected MIDI payload format");
}

function getRenderedScoreSvg() {
  const svg = paper.querySelector("svg");
  if (!svg) {
    throw new Error("Render a tune before saving the sheet music.");
  }
  return svg;
}

function getSvgDimensions(svg) {
  const widthAttr = Number.parseFloat(svg.getAttribute("width"));
  const heightAttr = Number.parseFloat(svg.getAttribute("height"));
  if (Number.isFinite(widthAttr) && Number.isFinite(heightAttr)) {
    return { width: widthAttr, height: heightAttr };
  }
  const viewBox = svg.viewBox && svg.viewBox.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }
  throw new Error("Could not determine the score size.");
}

function cloneExportSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll(".abcjs-cursor, .abcjs-highlight").forEach((el) => {
    el.remove();
  });
  return clone;
}

function svgToDataUrl(svg) {
  const clone = cloneExportSvg(svg);
  const serializer = new XMLSerializer();
  let source = serializer.serializeToString(clone);
  if (!/^<svg[^>]+xmlns=/i.test(source)) {
    source = source.replace(
      /^<svg\b/,
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }
  source = `<?xml version="1.0" encoding="UTF-8"?>\n${source}`;
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, slice);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the sheet music image."));
    img.src = src;
  });
}

async function renderScoreCanvas(scale = 2) {
  const svg = getRenderedScoreSvg();
  const { width, height } = getSvgDimensions(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const image = await loadImage(svgToDataUrl(svg));
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

async function saveScoreAsImage(mimeType, extension, quality) {
  const canvas = await renderScoreCanvas(2);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error(`Could not create ${extension.toUpperCase()} image.`));
        return;
      }
      resolve(result);
    }, mimeType, quality);
  });
  triggerDownloadFromBlob(blob, `${tuneFileStem()}.${extension}`);
}

async function saveScoreAsPdf() {
  const { jsPDF } = await import("jspdf");
  const canvas = await renderScoreCanvas(2);
  const pngDataUrl = canvas.toDataURL("image/png");
  const pageWidth = Math.max(1, Math.round(canvas.width * 0.75));
  const pageHeight = Math.max(1, Math.round(canvas.height * 0.75));
  const orientation = pageWidth >= pageHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "pt",
    format: [pageWidth, pageHeight],
    compress: true,
  });
  pdf.addImage(pngDataUrl, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  triggerDownloadFromBlob(pdf.output("blob"), `${tuneFileStem()}.pdf`);
}

function getEventBounds(event) {
  const elements = (event?.elements ?? []).flatMap((set) => set ?? []);
  const boxes = elements
    .map((element) => {
      try {
        return element.getBBox?.();
      } catch {
        return null;
      }
    })
    .filter(
      (box) =>
        box &&
        Number.isFinite(box.x) &&
        Number.isFinite(box.y) &&
        Number.isFinite(box.width) &&
        Number.isFinite(box.height),
    );
  if (!boxes.length) {
    return {
      left: Number(event?.left) || 0,
      right: (Number(event?.left) || 0) + (Number(event?.width) || 0),
      top: Number(event?.top) || 0,
      bottom: (Number(event?.top) || 0) + (Number(event?.height) || 0),
    };
  }
  return {
    left: Math.min(...boxes.map((box) => box.x)),
    right: Math.max(...boxes.map((box) => box.x + box.width)),
    top: Math.min(...boxes.map((box) => box.y)),
    bottom: Math.max(...boxes.map((box) => box.y + box.height)),
  };
}

function createCursorNode(className) {
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", className);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.classList.add("cursor-stem");
  const topCap = document.createElementNS("http://www.w3.org/2000/svg", "line");
  topCap.classList.add("cursor-serif-cap", "cursor-serif-top");
  const bottomCap = document.createElementNS("http://www.w3.org/2000/svg", "line");
  bottomCap.classList.add("cursor-serif-cap", "cursor-serif-bottom");
  const brace = document.createElementNS("http://www.w3.org/2000/svg", "path");
  brace.classList.add("cursor-serif-brace");
  const topPoint = document.createElementNS("http://www.w3.org/2000/svg", "path");
  topPoint.classList.add("cursor-serif-point", "cursor-serif-point-top");
  const bottomPoint = document.createElementNS("http://www.w3.org/2000/svg", "path");
  bottomPoint.classList.add("cursor-serif-point", "cursor-serif-point-bottom");
  const mimic = document.createElementNS("http://www.w3.org/2000/svg", "g");
  mimic.classList.add("cursor-mimic-shape");
  const topNote = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  topNote.classList.add("cursor-notehead", "cursor-notehead-top");
  const bottomNote = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  bottomNote.classList.add("cursor-notehead", "cursor-notehead-bottom");
  group.append(
    line,
    topCap,
    bottomCap,
    brace,
    topPoint,
    bottomPoint,
    mimic,
    topNote,
    bottomNote,
  );
  setCursorGeometry(group, 0, 0, 0);
  return group;
}

function setCursorGeometry(cursor, x, top, bottom) {
  const line = cursor.querySelector(".cursor-stem");
  line?.setAttribute("x1", String(x));
  line?.setAttribute("x2", String(x));
  line?.setAttribute("y1", String(top));
  line?.setAttribute("y2", String(bottom));
  const capWidth = 5;
  cursor.querySelector(".cursor-serif-top")?.setAttribute("x1", String(x - capWidth));
  cursor.querySelector(".cursor-serif-top")?.setAttribute("x2", String(x + capWidth));
  cursor.querySelector(".cursor-serif-top")?.setAttribute("y1", String(top));
  cursor.querySelector(".cursor-serif-top")?.setAttribute("y2", String(top));
  cursor.querySelector(".cursor-serif-bottom")?.setAttribute("x1", String(x - capWidth));
  cursor.querySelector(".cursor-serif-bottom")?.setAttribute("x2", String(x + capWidth));
  cursor.querySelector(".cursor-serif-bottom")?.setAttribute("y1", String(bottom));
  cursor.querySelector(".cursor-serif-bottom")?.setAttribute("y2", String(bottom));
  const middle = top + (bottom - top) / 2;
  cursor.querySelector(".cursor-serif-brace")?.setAttribute(
    "d",
    `M ${x + 2} ${top} C ${x - 4} ${top}, ${x - 5} ${top + 4}, ${x - 2} ${top + 7} L ${x + 2} ${top + 11} C ${x + 5} ${top + 15}, ${x + 5} ${middle - 8}, ${x + 1} ${middle} C ${x + 5} ${middle + 8}, ${x + 5} ${bottom - 15}, ${x + 2} ${bottom - 11} L ${x - 2} ${bottom - 7} C ${x - 5} ${bottom - 4}, ${x - 4} ${bottom}, ${x + 2} ${bottom}`,
  );
  cursor.querySelector(".cursor-serif-point-top")?.setAttribute(
    "d",
    `M ${x + 2} ${top - 5} L ${x + 5} ${top + 2} L ${x - 1} ${top + 1} Z`,
  );
  cursor.querySelector(".cursor-serif-point-bottom")?.setAttribute(
    "d",
    `M ${x + 2} ${bottom + 5} L ${x + 5} ${bottom - 2} L ${x - 1} ${bottom - 1} Z`,
  );
  const stroke = getComputedStyle(cursor).stroke;
  if (stroke && stroke !== "none") {
    cursor.querySelectorAll(".cursor-serif-point").forEach((point) => {
      point.setAttribute("fill", stroke);
    });
  }

  cursor.querySelector(".cursor-notehead-top")?.setAttribute("cx", String(x));
  cursor.querySelector(".cursor-notehead-top")?.setAttribute("cy", String(top));
  cursor.querySelector(".cursor-notehead-bottom")?.setAttribute("cx", String(x));
  cursor.querySelector(".cursor-notehead-bottom")?.setAttribute("cy", String(bottom));
}

function setMimicShape(cursor, event, previousPosition = null) {
  const shape = cursor.querySelector(".cursor-mimic-shape");
  if (!shape) return;
  const rawBounds = getEventBounds(event);
  const bounds = {
    left: Number.isFinite(rawBounds.left) ? rawBounds.left : 0,
    right: Number.isFinite(rawBounds.right) ? rawBounds.right : 0,
    top: Number.isFinite(rawBounds.top) ? rawBounds.top : 0,
    bottom: Number.isFinite(rawBounds.bottom) ? rawBounds.bottom : 0,
  };
  const previousBounds = cursor.mimicBounds;
  const rawOffsetX = previousPosition
    ? previousPosition.x - bounds.left
    : previousBounds
      ? previousBounds.left - bounds.left
      : 0;
  const rawOffsetY = previousPosition
    ? previousPosition.y - bounds.top
    : previousBounds
      ? previousBounds.top - bounds.top
      : 0;
  const offsetX = Number.isFinite(rawOffsetX) ? rawOffsetX : 0;
  const offsetY = Number.isFinite(rawOffsetY) ? rawOffsetY : 0;
  shape.replaceChildren(
    ...(event.elements ?? [])
      .flatMap((set) => set ?? [])
      .map((element) => element.cloneNode(true)),
  );
  cursor.mimicBounds = bounds;
  cursor.mimicOrigin = bounds;
  cursor.mimicOffset = { x: offsetX, y: offsetY };
  shape.setAttribute("transform", `translate(${offsetX} ${offsetY})`);
}

function updateDownloadButtons() {
  const hasTune = Boolean(lastVisualObj);
  downloadMidiBtn.disabled = !hasTune;
  downloadWavBtn.disabled = !hasTune || !supportsAudio || !player?.canCreateWav;
  downloadPdfBtn.disabled = !hasTune;
  downloadPngBtn.disabled = !hasTune;
  downloadJpegBtn.disabled = !hasTune;
}

class CursorControl {
  constructor(experimental = false) {
    this.beatSubdivisions = 2;
    this.experimental = experimental;
    this.experimentalActive = new Map();
    this.lastEventSeconds = null;
    this.measureCursors = [];
    this.measureCursorNodes = new Map();
    this.measureCursorStates = new Map();
    this.measureCursorFrame = null;
    this.mimicCursorFrame = null;
    this.mimicCursorStates = new Map();
    this.measureTimelines = [];
    this.noteTimelines = [];
    this.passiveCursorNodes = new Map();
  }

  onStart({ events = [], secondsPerWholeNote = 2 } = {}) {
    this.experimentalActive.clear();
    this.lastEventSeconds = null;
    this.mimicCursorStates.clear();
    const svg = paper.querySelector("svg");
    if (!svg) return;
    for (const type of new Set(
      events
        .map((event) => String(event.timelinePassive ?? "").toLowerCase())
        .filter(Boolean),
    )) {
      this.ensurePassiveCursor(svg, type);
    }
    let cursor = svg.querySelector(
      ".abcjs-cursor:not(.abcjs-passive-cursor)",
    );
    if (!cursor) {
      cursor = createCursorNode("abcjs-cursor");
      svg.appendChild(cursor);
    }
    const canonicalEvents = events.filter((event) => !event.timelinePassive);
    this.measureTimelines = this.buildMeasureTimelines(
      svg,
      canonicalEvents,
      secondsPerWholeNote,
    );
    this.noteTimelines = this.buildNoteTimelines(svg, events, secondsPerWholeNote);
    this.onProgress(0);
  }

  onProgress(seconds) {
    const svg = paper.querySelector("svg");
    if (!svg || !this.measureTimelines.length) return;
    const visibleMeasures = this.measureTimelines
      .filter((measure) => seconds >= measure.start && seconds <= measure.end)
      .sort((left, right) => right.start - left.start);
    if (!visibleMeasures.length) return;
    const synchronized =
      visibleMeasures.length > 0 &&
      (visibleMeasures.length <= 1 ||
      visibleMeasures.every(
        (measure) =>
          Math.abs(measure.start - visibleMeasures[0].start) <= 0.25 &&
          Math.abs(measure.end - visibleMeasures[0].end) <= 0.25,
      ));
    const displayMeasures = synchronized
      ? [
          {
            ...visibleMeasures[0],
            top: Math.min(...visibleMeasures.map((measure) => measure.top)),
            bottom: Math.max(...visibleMeasures.map((measure) => measure.bottom)),
            key: "primary",
            sourceKeys: visibleMeasures.map((measure) => measure.key),
          },
        ]
      : visibleMeasures.map((measure) => ({
          ...measure,
          key: measure,
          sourceKeys: [measure.key],
        }));
    this.measureCursorNodes.forEach((cursor) => {
      cursor.style.display = "none";
    });
    const active = new Set();
    for (const measure of displayMeasures) {
      let cursor = this.measureCursorNodes.get(measure.key);
      if (!cursor) {
        cursor = createCursorNode("abcjs-measure-cursor");
        svg.appendChild(cursor);
        this.measureCursorNodes.set(measure.key, cursor);
      }
      cursor.style.display = "";
      active.add(cursor);
      const ratio = Math.max(
        0,
        Math.min(1, (seconds - measure.start) / Math.max(0.001, measure.end - measure.start)),
      );
      const x = measure.left + measure.width * ratio;
      const activeNotes = this.noteTimelines.filter(
        (note) =>
          !note.timelinePassive &&
          measure.sourceKeys.includes(note.key) &&
          seconds >= note.start &&
          seconds <= note.end,
      );
      const noteTop = activeNotes.length
        ? Math.min(...activeNotes.map((note) => note.top))
        : measure.top;
      const noteBottom = activeNotes.length
        ? Math.max(...activeNotes.map((note) => note.bottom))
        : measure.bottom;
      const state = this.measureCursorStates.get(cursor) ?? {
        x,
        y1: noteTop,
        y2: noteBottom,
        line: measure.line,
      };
      if (state.line !== measure.line) {
        state.x = x;
        state.y1 = noteTop;
        state.y2 = noteBottom;
        state.line = measure.line;
      }
      state.targetX = x;
      state.targetY1 = noteTop;
      state.targetY2 = noteBottom;
      this.measureCursorStates.set(cursor, state);
    }
    this.updatePassiveCursors(seconds);
    this.updateMimicCursors(seconds);
    this.measureCursors = [...active];
    if (this.measureCursorFrame == null) {
      this.measureCursorFrame = window.requestAnimationFrame(() =>
        this.animateMeasureCursors(),
      );
    }
  }

  animateMeasureCursors() {
    let moving = false;
    for (const [cursor, state] of this.measureCursorStates) {
      const ease = 0.5;
      state.x += (state.targetX - state.x) * ease;
      state.y1 += (state.targetY1 - state.y1) * ease;
      state.y2 += (state.targetY2 - state.y2) * ease;
      setCursorGeometry(cursor, state.x, state.y1, state.y2);
      if (
        Math.abs(state.targetX - state.x) > 0.1 ||
        Math.abs(state.targetY1 - state.y1) > 0.1 ||
        Math.abs(state.targetY2 - state.y2) > 0.1
      ) {
        moving = true;
      }

    }
    this.measureCursorFrame = moving
      ? window.requestAnimationFrame(() => this.animateMeasureCursors())
      : null;
  }

  updatePassiveCursors(seconds) {
    const passiveTypes = new Set(
      this.noteTimelines
        .map((note) => note.timelinePassive)
        .filter(Boolean),
    );
    for (const type of passiveTypes) {
      const notes = this.noteTimelines
        .filter((note) => note.timelinePassive === type)
        .sort((left, right) => left.start - right.start);
      if (!notes.length) continue;
      const first = notes[0];
      const last = notes[notes.length - 1];
      const cursor = this.passiveCursorNodes.get(type);
      if (!cursor) continue;
      if (seconds < first.start || seconds > last.end) {
        cursor.style.display = "none";
        continue;
      }

      cursor.style.display = "";
      let current = notes[0];
      for (const note of notes) {
        if (note.start <= seconds) current = note;
        else break;
      }
      const next = notes.find((note) => note.start > current.start);
      const ratio = next
        ? Math.max(
            0,
            Math.min(
              1,
              (seconds - current.start) /
                Math.max(0.001, next.start - current.start),
            ),
          )
        : 0;
      const left = current.left + (next ? next.left - current.left : 0) * ratio;
      setCursorGeometry(cursor, left - 2, current.top, current.bottom);
    }
  }

  updateMimicCursors(seconds) {
    const style = document.documentElement.dataset.cursorStyle;
    if (style !== "mimic-note" && style !== "next-note") return;
    const updateCursor = (cursor, notes) => {
      if (!cursor || !notes.length || !cursor.mimicOrigin) return;
      if (style === "next-note") {
        const state = this.mimicCursorStates.get(cursor);
        if (state) {
          state.targetX = 0;
          state.targetY = 0;
        }
        return;
      }
      let current = notes[0];
      for (const note of notes) {
        if (note.start <= seconds) current = note;
        else break;
      }
      const next = notes.find((note) => note.start > current.start);
      const ratio = next
        ? Math.max(
            0,
            Math.min(
              1,
              (seconds - current.start) /
                Math.max(0.001, next.start - current.start),
            ),
          )
        : 0;
      const left = current.left + (next ? next.left - current.left : 0) * ratio;
      const top = current.top + (next ? next.top - current.top : 0) * ratio;
      const state = this.mimicCursorStates.get(cursor) ?? {
        x: cursor.mimicOffset?.x ?? 0,
        y: cursor.mimicOffset?.y ?? 0,
      };
      if (
        !Number.isFinite(cursor.mimicOrigin.left) ||
        !Number.isFinite(cursor.mimicOrigin.top)
      ) {
        return;
      }
      state.targetX = left - cursor.mimicOrigin.left;
      state.targetY = top - cursor.mimicOrigin.top;
      this.mimicCursorStates.set(cursor, state);
    };

    const mainCursor = paper.querySelector(
      ".abcjs-cursor:not(.abcjs-passive-cursor)",
    );
    updateCursor(
      mainCursor,
      this.noteTimelines
        .filter((note) => !note.timelinePassive)
        .sort((left, right) => left.start - right.start),
    );
    for (const [type, cursor] of this.passiveCursorNodes) {
      updateCursor(
        cursor,
        this.noteTimelines
          .filter((note) => note.timelinePassive === type)
          .sort((left, right) => left.start - right.start),
      );
    }
    if (this.mimicCursorFrame == null) {
      this.mimicCursorFrame = window.requestAnimationFrame(() =>
        this.animateMimicCursors(),
      );
    }
  }

  animateMimicCursors() {
    let moving = false;
    for (const [cursor, state] of this.mimicCursorStates) {
      if (!Number.isFinite(state.x)) {
        state.x = Number.isFinite(cursor.mimicOffset?.x)
          ? cursor.mimicOffset.x
          : 0;
      }
      if (!Number.isFinite(state.y)) {
        state.y = Number.isFinite(cursor.mimicOffset?.y)
          ? cursor.mimicOffset.y
          : 0;
      }
      if (!Number.isFinite(state.targetX)) state.targetX = state.x;
      if (!Number.isFinite(state.targetY)) state.targetY = state.y;
      if (state.timed) {
        const progress = Math.min(
          1,
          Math.max(0, (performance.now() - state.startAt) / state.durationMs),
        );
        state.x = state.startX + (state.targetX - state.startX) * progress;
        state.y = state.startY + (state.targetY - state.startY) * progress;
      } else {
        state.x += (state.targetX - state.x) * 0.5;
        state.y += (state.targetY - state.y) * 0.5;
      }
      cursor
        .querySelector(".cursor-mimic-shape")
        ?.setAttribute("transform", `translate(${state.x} ${state.y})`);
      if (
        Math.abs(state.targetX - state.x) > 0.1 ||
        Math.abs(state.targetY - state.y) > 0.1
      ) {
        moving = true;
      }
    }
    this.mimicCursorFrame = moving
      ? window.requestAnimationFrame(() => this.animateMimicCursors())
      : null;
  }

  onEvent(event) {
    if (!event?.elements?.length) return;
    const sourceEvent = event.sourceEvent ?? event;
    const eventSeconds = Number(event.playbackSeconds);
    const passiveType = String(event.timelinePassive ?? "").toLowerCase();
    const passiveClass = passiveType
      ? `abcjs-passive-${passiveType.replace(/[^a-z0-9-]/g, "-")}`
      : "";
    const sameMoment =
      this.experimental &&
      Number.isFinite(eventSeconds) &&
      this.lastEventSeconds != null &&
      Math.abs(eventSeconds - this.lastEventSeconds) <= 0.04;
    if (!sameMoment) {
      paper.querySelectorAll(".abcjs-highlight, [class*='abcjs-passive-']").forEach((el) => {
        el.classList.remove("abcjs-highlight");
        el.classList.remove(
          "abcjs-passive-echo",
          "abcjs-passive-flashback",
          "abcjs-passive-foreshadow",
          "abcjs-passive-reverseflashback",
          "abcjs-passive-resolution",
        );
      });
      this.experimentalActive.clear();
    }
    if (Number.isFinite(eventSeconds)) this.lastEventSeconds = eventSeconds;
    for (const set of event.elements) {
      for (const el of set) {
        const targets = [el, ...el.querySelectorAll?.("path, ellipse, line, polygon, polyline, text") ?? []];
        for (const target of targets) {
          target.classList.add("abcjs-highlight");
          if (passiveClass) target.classList.add(passiveClass);
          if (this.experimental && event.highlightDuration) {
            const token = {};
            this.experimentalActive.set(target, token);
            window.setTimeout(() => {
              if (this.experimentalActive.get(target) !== token) return;
              this.experimentalActive.delete(target);
              target.classList.remove("abcjs-highlight");
              if (passiveClass) target.classList.remove(passiveClass);
            }, event.highlightDuration);
          }
        }
      }
    }
    const cursor = paper.querySelector(
      ".abcjs-cursor:not(.abcjs-passive-cursor)",
    );
    const cursorStyle = document.documentElement.dataset.cursorStyle;
    if (cursor && !passiveType) {
      cursor.classList.remove(
        "abcjs-cursor-passive-echo",
        "abcjs-cursor-passive-flashback",
        "abcjs-cursor-passive-foreshadow",
        "abcjs-cursor-passive-reverseflashback",
        "abcjs-cursor-passive-resolution",
      );
      if (passiveType) cursor.classList.add(`abcjs-cursor-passive-${passiveType}`);
      setCursorGeometry(cursor, event.left - 2, event.top, event.top + event.height);
      if (cursorStyle === "mimic-note" || cursorStyle === "next-note") {
        const state = this.mimicCursorStates.get(cursor);
        const previousPosition =
          state && cursor.mimicOrigin
            ? {
                x: cursor.mimicOrigin.left + state.x,
                y: cursor.mimicOrigin.top + state.y,
              }
            : null;
        const nextNote =
          cursorStyle === "next-note"
              ? this.noteTimelines
                  .filter(
                    (note) =>
                      !note.timelinePassive &&
                      note.event !== sourceEvent &&
                      note.start >
                        (this.noteTimelines.find((note) => note.event === sourceEvent)
                          ?.start ?? Infinity),
                  )
                  .sort((left, right) => left.start - right.start)[0]
              : null;
        setMimicShape(
          cursor,
          nextNote?.event ?? sourceEvent,
          previousPosition ?? getEventBounds(event),
        );
        const glideDurationMs =
          nextNote && Number.isFinite(nextNote.start)
            ? Math.max(
                50,
                (nextNote.start -
                  (this.noteTimelines.find((note) => note.event === sourceEvent)
                    ?.start ?? nextNote.start)) *
                  900,
              )
            : 180;
        const initialX = cursor.mimicOffset?.x ?? 0;
        const initialY = cursor.mimicOffset?.y ?? 0;
        this.mimicCursorStates.set(cursor, {
          x: initialX,
          y: initialY,
          startX: initialX,
          startY: initialY,
          targetX: cursorStyle === "next-note" ? 0 : initialX,
          targetY: cursorStyle === "next-note" ? 0 : initialY,
          startAt: performance.now(),
          durationMs: glideDurationMs,
          timed: cursorStyle === "next-note",
        });
      }
    }
    if (passiveType) {
      const svg = paper.querySelector("svg");
      if (svg) {
        const passiveCursor = this.ensurePassiveCursor(svg, passiveType);
        const bounds = getEventBounds(event);
        setCursorGeometry(
          passiveCursor,
          bounds.left - 2,
          bounds.top,
          bounds.bottom,
        );
        if (cursorStyle === "mimic-note" || cursorStyle === "next-note") {
          const state = this.mimicCursorStates.get(passiveCursor);
          const previousPosition =
            state && passiveCursor.mimicOrigin
              ? {
                  x: passiveCursor.mimicOrigin.left + state.x,
                  y: passiveCursor.mimicOrigin.top + state.y,
                }
              : null;
          const nextNote =
            cursorStyle === "next-note"
              ? this.noteTimelines
                  .filter(
                    (note) =>
                      note.timelinePassive === passiveType &&
                        note.event !== sourceEvent &&
                        note.start >
                          (this.noteTimelines.find(
                            (note) =>
                              note.event === sourceEvent &&
                              note.timelinePassive === passiveType,
                          )?.start ?? Infinity),
                    )
                  .sort((left, right) => left.start - right.start)[0]
              : null;
          setMimicShape(
            passiveCursor,
            nextNote?.event ?? sourceEvent,
            previousPosition ?? bounds,
          );
          const currentNote = this.noteTimelines.find(
            (note) =>
              note.event === sourceEvent && note.timelinePassive === passiveType,
          );
          const glideDurationMs =
            nextNote && currentNote
              ? Math.max(50, (nextNote.start - currentNote.start) * 900)
              : 180;
          const initialX = passiveCursor.mimicOffset?.x ?? 0;
          const initialY = passiveCursor.mimicOffset?.y ?? 0;
          this.mimicCursorStates.set(passiveCursor, {
            x: initialX,
            y: initialY,
            startX: initialX,
            startY: initialY,
            targetX: cursorStyle === "next-note" ? 0 : initialX,
            targetY: cursorStyle === "next-note" ? 0 : initialY,
            startAt: performance.now(),
            durationMs: glideDurationMs,
            timed: cursorStyle === "next-note",
          });
        }
      }
    }
  }

  ensurePassiveCursor(svg, passiveType) {
    let cursor = this.passiveCursorNodes.get(passiveType);
    if (!cursor) {
      cursor = createCursorNode(
        `abcjs-cursor abcjs-passive-cursor abcjs-cursor-passive-${passiveType}`,
      );
      svg.appendChild(cursor);
      this.passiveCursorNodes.set(passiveType, cursor);
    }
    return cursor;
  }

  onFinished() {
    this.experimentalActive.clear();
    this.lastEventSeconds = null;
    this.measureCursors.forEach((cursor) => cursor.remove());
    this.measureCursors = [];
    this.measureCursorNodes.forEach((cursor) => cursor.remove());
    this.measureCursorNodes.clear();
    this.passiveCursorNodes.forEach((cursor) => cursor.remove());
    this.passiveCursorNodes.clear();
    if (this.measureCursorFrame != null) {
      window.cancelAnimationFrame(this.measureCursorFrame);
      this.measureCursorFrame = null;
    }
    if (this.mimicCursorFrame != null) {
      window.cancelAnimationFrame(this.mimicCursorFrame);
      this.mimicCursorFrame = null;
    }
    this.mimicCursorStates.clear();
    this.measureCursorStates.clear();
    this.measureTimelines = [];
    this.noteTimelines = [];
    paper.querySelectorAll(".abcjs-highlight, [class*='abcjs-passive-']").forEach((el) => {
      el.classList.remove("abcjs-highlight");
      el.classList.remove(
        "abcjs-passive-echo",
        "abcjs-passive-flashback",
        "abcjs-passive-foreshadow",
        "abcjs-passive-reverseflashback",
        "abcjs-passive-resolution",
      );
    });
    const cursor = paper.querySelector(
      ".abcjs-cursor:not(.abcjs-passive-cursor)",
    );
    if (cursor) {
      cursor.classList.remove(
        "abcjs-cursor-passive-echo",
        "abcjs-cursor-passive-flashback",
        "abcjs-cursor-passive-foreshadow",
        "abcjs-cursor-passive-reverseflashback",
        "abcjs-cursor-passive-resolution",
      );
      setCursorGeometry(cursor, 0, 0, 0);
    }
  }

  buildMeasureTimelines(svg, events, secondsPerWholeNote) {
    const measures = new Map();
    for (const note of svg.querySelectorAll(".abcjs-note")) {
      const classes = note.getAttribute("class") ?? "";
      const line = classes.match(/\babcjs-l(-?\d+)\b/)?.[1];
      const measure = classes.match(/\babcjs-m(-?\d+)\b/)?.[1];
      if (line == null || measure == null) continue;
      const box = note.getBBox();
      const key = `${line}:${measure}`;
      const current = measures.get(key);
      measures.set(key, {
        line,
        measureIndex: Number(measure),
        left: Math.min(current?.left ?? box.x, box.x),
        right: Math.max(current?.right ?? box.x + box.width, box.x + box.width),
        top: Math.min(current?.top ?? box.y, box.y),
        bottom: Math.max(current?.bottom ?? box.y + box.height, box.y + box.height),
        start: current?.start ?? Infinity,
        end: current?.end ?? -Infinity,
      });
    }
    const mappedEvents = [];
    for (const event of events) {
      const start = (Number(event.start) || 0) * secondsPerWholeNote;
      const end =
        start +
        Math.max(
          0.04,
          Number(event.duration) ||
            (Number(event.end) || 0) - (Number(event.start) || 0),
        ) *
          secondsPerWholeNote;
      for (const set of event.elements ?? []) {
        for (const element of set) {
          const classes = element.getAttribute("class") ?? "";
          const line = classes.match(/\babcjs-l(-?\d+)\b/)?.[1];
          const measure = classes.match(/\babcjs-m(-?\d+)\b/)?.[1];
          if (line != null && measure != null && measures.has(`${line}:${measure}`)) {
            mappedEvents.push({ key: `${line}:${measure}`, start, end });
          }
        }
      }
    }
    mappedEvents.sort((left, right) => left.start - right.start);
    const occurrences = [];
    for (const event of mappedEvents) {
      const previous = occurrences[occurrences.length - 1];
      if (previous?.key === event.key) {
        previous.end = Math.max(previous.end, event.end);
      } else {
        occurrences.push({ ...event });
      }
    }
    for (let index = 0; index < occurrences.length - 1; index += 1) {
      const nextStart = occurrences[index + 1].start;
      if (nextStart > occurrences[index].start) {
        occurrences[index].end = nextStart;
      }
    }
    return occurrences
      .map((occurrence) => {
        const measure = measures.get(occurrence.key);
        return {
          ...measure,
          ...occurrence,
          width: Math.max(1, measure.right - measure.left),
        };
      })
      .filter((measure) => measure.end > measure.start);
  }

  buildNoteTimelines(svg, events, secondsPerWholeNote) {
    const notes = [];
    for (const event of events) {
      const start = (Number(event.start) || 0) * secondsPerWholeNote;
      const end =
        start +
        Math.max(
          0.04,
          Number(event.duration) ||
            (Number(event.end) || 0) - (Number(event.start) || 0),
        ) *
          secondsPerWholeNote;
      const elements = (event.elements ?? []).flatMap((set) => set ?? []);
      if (!elements.length) continue;
      const classes = elements[0].getAttribute("class") ?? "";
      const line = classes.match(/\babcjs-l(-?\d+)\b/)?.[1];
      const measure = classes.match(/\babcjs-m(-?\d+)\b/)?.[1];
      if (line == null || measure == null) continue;
      const bounds = getEventBounds(event);
      notes.push({
        key: `${line}:${measure}`,
        event,
        timelinePassive: event.timelinePassive,
        left: bounds.left,
        start,
        end,
        top: bounds.top,
        bottom: bounds.bottom,
      });
    }
    return notes;
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderLint(issues) {
  lintCount.textContent = String(issues.length);
  lintCount.dataset.level = issues.some((i) => i.severity === "error")
    ? "error"
    : issues.some((i) => i.severity === "warn")
      ? "warn"
      : issues.length
        ? "info"
        : "ok";

  lintList.innerHTML = "";
  if (!issues.length) {
    const li = document.createElement("li");
    li.className = "lint-empty";
    li.textContent = "No issues — looking good.";
    lintList.appendChild(li);
    return;
  }

  for (const issue of issues) {
    const li = document.createElement("li");
    li.className = `lint-item lint-${issue.severity}`;
    li.tabIndex = 0;
    li.innerHTML = `<span class="lint-sev">${issue.severity}</span><span class="lint-msg"></span>`;
    li.querySelector(".lint-msg").textContent = issue.message;
    const jump = () => {
      if (issue.start == null) return;
      editor.focus();
      editor.setSelectionRange(
        issue.start,
        issue.end ?? Math.min(issue.start + 12, editor.value.length),
      );
      // Scroll textarea to selection approximately
      const pre = editor.value.slice(0, issue.start);
      const line = pre.split(/\n/).length;
      editor.scrollTop = Math.max(0, (line - 3) * 18);
    };
    li.addEventListener("click", jump);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        jump();
      }
    });
    lintList.appendChild(li);
  }
}

async function initSynth() {
  player = museScoreFramework
    ? (await import("./museScorePlayer.js")).createMuseScorePlayer({
        abcjs,
        audioSelector: "#audio",
      })
    : experimentalFramework
    ? createTestingPlayer({
        abcjs,
        audioSelector: "#audio",
        cursorControl: new CursorControl(true),
      majorExpansion: testingFramework,
      onPerformanceEvent: ({ seconds }) => updateTimelinePlayhead(seconds),
      onPlaybackError: (error) =>
        setStatus(`Audio setup failed: ${error.message ?? error}`, true),
    })
    : createDeskPlayer({
        abcjs,
        audioSelector: "#audio",
        cursorControl: new CursorControl(),
      });
  if (!player.supportsAudio) {
    audioEl.innerHTML =
      '<p style="margin:0;color:var(--muted);font-size:0.85rem">Audio playback is not supported in this browser.</p>';
    updateDownloadButtons();
    return;
  }

  if (museScoreFramework) {
    player.load();
    return;
  }
  audioEl.innerHTML =
    '<button type="button" id="enable-audio" class="primary">Load playback</button>';
}

function enableSynth() {
  player?.load();
}

/**
 * Prepare source: multi-part assemble → Desk dialect preprocess.
 */
function prepareSource(source) {
  const normalizedSource = normalizeInlineOverlayMeasures(source);
  const partInfo = parseParts(normalizedSource);
  let working = normalizedSource;
  /** @type {string[]} */
  const extraWarnings = [...(partInfo.warnings || [])];
  let partsMeta = null;

  if (partInfo.isMultiPart && partInfo.assembledAbc) {
    working = partInfo.assembledAbc;
    partsMeta = partInfo.parts;
  }

  const motifs = expandMotifs(working);
  const parsed = parseDeskHeaders(motifs.source);
  return {
    cleanAbc: parsed.cleanAbc,
    meta: { ...parsed.meta, parts: partsMeta, sourceText: parsed.cleanAbc },
    warnings: [...extraWarnings, ...motifs.warnings, ...parsed.warnings],
    partInfo,
    sourceForLint: source,
    motif: motifs,
  };
}

function renderMotifAnnotations(annotations) {
  const svg = paper.querySelector("svg");
  svg?.querySelector(".desk-motif-annotations")?.remove();
  if (!svg || motifView !== "annotated" || !annotations?.length) return;

  const viewBox = svg.viewBox?.baseVal;
  const width = viewBox?.width || Number(svg.getAttribute("width")) || 800;
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "desk-motif-annotations");
  group.setAttribute("aria-label", "Motif callback annotations");
  const maxPerRow = Math.max(1, Math.floor(width / 190));
  annotations.forEach((annotation, index) => {
    const row = Math.floor(index / maxPerRow);
    const column = index % maxPerRow;
    const x = 12 + column * 190;
    const y = 22 + row * 28;
    const label = `${annotation.name} · ${formatMotifParameters(annotation.parameters)}`;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y - 15));
    rect.setAttribute("width", String(Math.min(180, Math.max(110, label.length * 5.8))));
    rect.setAttribute("height", "20");
    rect.setAttribute("rx", "4");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x + 7));
    text.setAttribute("y", String(y - 1));
    text.textContent = label;
    group.append(rect, text);
  });
  svg.insertBefore(group, svg.firstChild);
}

let graphicalMenu = null;

function closeGraphicalMenu() {
  graphicalMenu?.remove();
  graphicalMenu = null;
}

function showGraphicalMenu(event, note, prepared) {
  closeGraphicalMenu();
  const menu = document.createElement("div");
  menu.className = "graphical-context-menu";
  menu.style.left = `${Math.min(window.innerWidth - 230, event.clientX)}px`;
  menu.style.top = `${Math.min(window.innerHeight - 260, event.clientY)}px`;
  const actions = [
    ["Add third above", 4],
    ["Add fifth above", 7],
    ["Add octave above", 12],
  ];
  actions.forEach(([label, semitones]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      const next = addChordTone(
        editor.value,
        note.startChar,
        note.endChar,
        semitones,
      );
      if (!next) {
        setStatus("This note cannot be converted into a chord safely.", true);
      } else {
        replaceEditorValue(next);
        renderScore();
      }
      closeGraphicalMenu();
    });
    menu.append(button);
  });
  const move = document.createElement("button");
  move.type = "button";
  move.textContent = "Move to aligned voice (&)";
  move.addEventListener("click", () => {
    const unit = readGraphicalLengthUnit(editor.value);
    const next = moveNoteToOverlay(
      editor.value,
      note.startChar,
      note.endChar,
      unit,
    );
    if (!next) {
      setStatus("This note cannot be moved into an overlay safely.", true);
    } else {
      replaceEditorValue(next);
      renderScore();
    }
    closeGraphicalMenu();
  });
  menu.append(move);
  document.body.append(menu);
  graphicalMenu = menu;
}

function readGraphicalLengthUnit(source) {
  const match = String(source).match(/^\s*L\s*:\s*(\d+)\s*\/\s*(\d+)/im);
  return match ? Number(match[1]) / Number(match[2]) : 0.125;
}

function attachGraphicalInteractions(prepared) {
  closeGraphicalMenu();
  if (!graphicalEditorFramework) return;
  if (!sourceCanBeEdited(editor.value, prepared)) {
    setStatus(
      "Graphical editing is limited to plain single-voice ABC; use Source mode for Desk tags, motifs, or parts.",
      true,
    );
    return;
  }
  const selectable = lastVisualObj?.getSelectableArray?.() ?? [];
  selectable.forEach((item) => {
    const abcElem = item?.absEl?.abcelem;
    const element = item?.svgEl;
    if (!element || abcElem?.el_type !== "note") return;
    element.classList.add("graphical-note");
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showGraphicalMenu(event, abcElem, prepared);
    });
  });
  paper.oncontextmenu = (event) => {
    if (event.target.closest?.(".graphical-note")) return;
    event.preventDefault();
    closeGraphicalMenu();
    const next = appendGraphicalNote(editor.value, "C");
    if (next) {
      replaceEditorValue(next);
      renderScore();
      setStatus("Inserted a C at the end of the current music line.");
    }
  };
  paper.ondblclick = (event) => {
    if (event.target.closest?.(".graphical-note")) return;
    const next = appendGraphicalNote(editor.value, "C");
    if (!next) return;
    replaceEditorValue(next);
    renderScore();
    setStatus("Inserted a C at the end of the current music line.");
  };
}

function renderScore() {
  const abc = editor.value;
  const gen = ++renderGen;

  if (!abc.trim()) {
    paper.innerHTML = "";
    lastVisualObj = null;
    lastPrepared = null;
    player?.invalidate();
    renderLint([]);
    setStatus("Enter ABC notation to render a score.");
    player?.disable(true);
    updateDownloadButtons();
    return;
  }

  try {
    const prepared = prepareSource(abc);
    if (gen !== renderGen) return;
    lastPrepared = prepared;

    paper.innerHTML = "";

    const visualObjs = abcjs.renderAbc(paper, prepared.cleanAbc, {
      responsive: "resize",
      add_classes: true,
      clickListener: (abcElem) => {
        if (abcElem?.startChar != null && abcElem?.endChar != null) {
          editor.focus();
          // Prefer selecting in original editor when single-part
          if (!prepared.partInfo.isMultiPart) {
            editor.setSelectionRange(abcElem.startChar, abcElem.endChar);
          }
        }
      },
    });

    if (gen !== renderGen) return;

    lastVisualObj = visualObjs[0] ?? null;
    renderGlissandoMarks(lastVisualObj, prepared.cleanAbc);
    renderMotifAnnotations(prepared.motif.annotations);
    attachGraphicalInteractions(prepared);
    const warnings = filterDecorationWarnings([
      ...prepared.warnings,
      ...(lastVisualObj?.warnings ?? []),
    ]);

    const issues = lintComposition(
      prepared.sourceForLint,
      prepared.cleanAbc,
      lastVisualObj,
      prepared.meta,
    );
    renderLint(issues);

    const title = lastVisualObj?.metaText?.title ?? "Untitled";
    const deskBit = deskStatusFragment(prepared.meta);
    const partBit = prepared.partInfo.isMultiPart
      ? `${prepared.partInfo.parts.length} parts`
      : "";
    const bits = [deskBit, partBit].filter(Boolean).join(" · ");
    const base = bits ? `Rendered “${title}” · ${bits}` : `Rendered “${title}”`;

    if (warnings.length) {
      setStatus(`${base} — ${warnings[0]}`, true);
    } else {
      setStatus(base);
    }

    function renderGlissandoMarks(tune, cleanAbc) {
      const svg = paper.querySelector("svg");
      if (!svg || !tune || !cleanAbc) return;
      const markerPositions = [
        ...cleanAbc.matchAll(/"gliss\."\s*!slide!/gi),
      ]
        .map((match) => match.index)
        .filter((index) => index != null);
      if (!markerPositions.length) return;

      const notes = (tune.getSelectableArray?.() ?? [])
        .filter((selectable) => selectable?.absEl?.abcelem?.el_type === "note")
        .sort(
          (left, right) =>
            (left.absEl.abcelem.startChar ?? 0) -
            (right.absEl.abcelem.startChar ?? 0),
        );
      const noteEntries = notes.map((selectable) => ({
        selectable,
        start: selectable.absEl.abcelem.startChar,
        end: selectable.absEl.abcelem.endChar,
      }));

      for (const marker of markerPositions) {
        const sourceIndex = noteEntries.findIndex(
          (entry) => entry.start != null && entry.start >= marker,
        );
        if (sourceIndex < 0 || sourceIndex + 1 >= noteEntries.length) continue;
        const from = noteEntries[sourceIndex].selectable.svgEl;
        const to = noteEntries[sourceIndex + 1].selectable.svgEl;
        const fromBox = from?.getBBox?.();
        const toBox = to?.getBBox?.();
        if (!fromBox || !toBox) continue;

        const x1 = fromBox.x + fromBox.width;
        const y1 = fromBox.y + fromBox.height * 0.45;
        const x2 = toBox.x;
        const y2 = toBox.y + toBox.height * 0.45;
        const distance = Math.max(12, x2 - x1);
        const waves = Math.max(3, Math.round(distance / 9));
        const amplitude = Math.min(5, Math.max(2.5, distance / 35));
        const points = [];
        for (let index = 0; index <= waves * 4; index++) {
          const progress = index / (waves * 4);
          const x = x1 + (x2 - x1) * progress;
          const y =
            y1 +
            (y2 - y1) * progress +
            Math.sin(progress * waves * Math.PI * 2) * amplitude;
          points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        path.setAttribute("class", "abcjs-glissando-line");
        path.setAttribute("points", points.join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2.2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);
      }
    }

    if (player?.loaded && lastVisualObj) {
      const audioParams = createAudioParams(prepared.meta);
      try {
        player.setTune(lastVisualObj, audioParams);
        player.disable(false);
        updateTestingMetrics();
      } catch (error) {
        updateTestingMetrics();
        setStatus(`${base} — Audio setup failed: ${error.message ?? error}`, true);
      }
    }
    updateDownloadButtons();
  } catch (err) {
    if (gen !== renderGen) return;
    paper.innerHTML = "";
    lastVisualObj = null;
    lastPrepared = null;
    renderLint([
      {
        id: "parse",
        severity: "error",
        message: `Parse error: ${err.message ?? err}`,
      },
    ]);
    setStatus(`Parse error: ${err.message ?? err}`, true);
    updateDownloadButtons();
  }

}

function updateTestingMetrics() {
  if (!testingMetrics) return;
  const metrics = player?.getDiagnostics();
  testingMetrics.textContent = metrics
    ? `${player.backendName}: ${metrics.tracks} tracks · ${metrics.notes} notes · ${metrics.events} events · ${metrics.duration}s · ${metrics.glissandi ?? 0} glissandi · ${metrics.phrases} phrases · ${metrics.expressionEvents} curves · ${metrics.toneEvents} tone changes · ${metrics.players} players · ${metrics.ensembleGain}x section gain · ${formatArticulations(metrics.articulations)}`
    : "Load playback to inspect normalized playback events.";
  renderPerformanceTimeline(metrics);
}

function formatArticulations(articulations = {}) {
  return Object.entries(articulations)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ") || "no articulations";
}

function updateTimelinePlayhead(seconds) {
  if (!performanceTimeline || !timelinePlayhead) return;
  const duration = Number(player?.getDiagnostics()?.duration) || 0;
  const position = duration > 0 ? Math.max(0, Math.min(100, (seconds / duration) * 100)) : 0;
  timelinePlayhead.style.left = `${position}%`;
  if (timelineTime) timelineTime.textContent = `${Math.max(0, seconds).toFixed(1)}s`;
}

function renderPerformanceTimeline(metrics) {
  if (!performanceTimeline) return;
  const graph = metrics?.performance;
  const duration = Number(metrics?.duration) || 0;
  if (!graph || duration <= 0) {
    performanceTimeline.hidden = true;
    return;
  }

  const addRange = (parent, item, className) => {
    const start = Math.max(0, Number(item.start) || 0);
    const end = Math.max(start, Number(item.end) || start);
    const segment = document.createElement("span");
    segment.className = `timeline-segment ${className}`;
    segment.style.left = `${(start / duration) * 100}%`;
    segment.style.width = `${Math.max(0.8, ((end - start) / duration) * 100)}%`;
    segment.title = `${item.type ?? className}: ${start.toFixed(2)}–${end.toFixed(2)}s`;
    parent.appendChild(segment);
  };
  const addExpressionGraph = (parent, notes) => {
    const points = [];
    for (const note of notes) {
      const start = Math.max(0, Number(note.start) || 0);
      const end = Math.max(start, Number(note.end) || start);
      const intensity = Math.max(0.08, Math.min(1, (Number(note.volume) || 32) / 127));
      const x = Math.min(100, (start / duration) * 100);
      const endX = Math.min(100, (end / duration) * 100);
      const peak = 88 - intensity * 70;
      points.push(`${x},88`, `${Math.max(x + 0.05, endX - 0.08)},${peak}`, `${endX},88`);
    }
    if (!points.length) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("timeline-expression-graph");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Expression intensity graph");
    const baseline = document.createElementNS("http://www.w3.org/2000/svg", "line");
    baseline.setAttribute("x1", "0");
    baseline.setAttribute("x2", "100");
    baseline.setAttribute("y1", "88");
    baseline.setAttribute("y2", "88");
    baseline.classList.add("timeline-expression-baseline");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", points.join(" "));
    line.classList.add("timeline-expression-line");
    svg.append(baseline, line);
    parent.appendChild(svg);
  };

  timelinePhrases.innerHTML = "";
  timelineExpression.innerHTML = "";
  timelineTempo.innerHTML = "";
  timelinePassives.innerHTML = "";
  for (const phrase of graph.phrases ?? []) addRange(timelinePhrases, phrase, "phrase");
  addExpressionGraph(
    timelineExpression,
    (graph.events ?? []).filter(
      (note) =>
        (note.type === "note" || note.cmd === "note") &&
        !note.timelinePassive,
    ),
  );
  for (const curve of graph.tempo ?? []) addRange(timelineTempo, curve, "tempo");
  for (const passive of graph.timelinePassives ?? []) {
    addRange(
      timelinePassives,
      passive,
      `passive passive-${String(passive.type).toLowerCase()}`,
    );
  }

  timelineLegend.innerHTML = "";
  const labels = [
    ["phrase", "phrases"],
    ["expression", "expression"],
    ["tempo", "breath tempo"],
  ];
  for (const [className, label] of labels) {
    const item = document.createElement("span");
    item.className = "timeline-key";
    item.innerHTML = `<i class="${className}"></i>`;
    item.append(document.createTextNode(label));
    timelineLegend.appendChild(item);
  }
  for (const passive of graph.timelinePassives ?? []) {
    const item = document.createElement("span");
    item.className = "timeline-key";
    item.innerHTML = `<i class="passive-${String(passive.type).toLowerCase()}"></i>`;
    item.append(document.createTextNode(passive.label ?? passive.type));
    timelineLegend.appendChild(item);
  }
  for (const [index, tone] of (graph.tone ?? []).entries()) {
    const marker = document.createElement("span");
    marker.className = "timeline-tone";
    marker.style.left = `${((index + 1) / ((graph.tone?.length ?? 0) + 1)) * 100}%`;
    marker.title = `Tone: ${tone.tone}`;
    marker.textContent = tone.tone;
    timelineLegend.appendChild(marker);
  }
  performanceTimeline.hidden = false;
  updateTimelinePlayhead(0);
}

audioEl.addEventListener("click", (event) => {
  if (!(event.target instanceof Element) || !event.target.closest("#enable-audio")) {
    return;
  }
  try {
    enableSynth();
    if (player?.loaded && lastVisualObj && lastPrepared) {
      const audioParams = createAudioParams(lastPrepared.meta);
      player.setTune(lastVisualObj, audioParams);
      updateTestingMetrics();
    }
  } catch (error) {
    updateTestingMetrics();
    setStatus(`Audio setup failed: ${error.message ?? error}`, true);
  }
});

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderScore, 180);
}

editor.addEventListener("input", scheduleRender);
editor.addEventListener("change", scheduleRender);
editor.addEventListener("paste", () => scheduleRender());
editor.addEventListener("cut", () => scheduleRender());

sampleSelect.addEventListener("change", () => {
  const key = sampleSelect.value;
  replaceEditorValue(SAMPLES[key] ?? DEFAULT_ABC);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  renderScore();
});

formatDeskBtn.addEventListener("click", () => {
  const formatted = formatForDesk(editor.value);
  if (!formatted) {
    setStatus("No standard V: voices found to format, or the source already uses Part: blocks.", true);
    return;
  }
  replaceEditorValue(formatted);
  sampleSelect.value = "";
  renderScore();
  setStatus("Converted standard voices into ABC Desk Part: blocks.");
});

formatStandardBtn.addEventListener("click", () => {
  const formatted = formatToStandard(editor.value);
  if (!formatted) {
    setStatus("No Part: blocks with music found to convert.", true);
    return;
  }
  replaceEditorValue(formatted);
  sampleSelect.value = "";
  renderScore();
  setStatus("Converted Part: blocks into standard V: voices, merging matching clefs.");
});

formatMeasuresBtn.addEventListener("click", () => {
  const count = Math.max(1, Math.min(32, Number(measuresPerLine.value) || 4));
  measuresPerLine.value = String(count);
  const formatted = formatMeasures(editor.value, count);
  if (formatted === editor.value) {
    setStatus("Music is already formatted with the selected measure width.");
    return;
  }
  replaceEditorValue(formatted);
  sampleSelect.value = "";
  renderScore();
  setStatus(`Formatted music at ${count} measure${count === 1 ? "" : "s"} per line.`);
});

removeExtraSpacesBtn.addEventListener("click", () => {
  const formatted = removeExtraSpaces(editor.value);
  if (formatted === editor.value) {
    setStatus("No runs of more than two spaces found.");
    return;
  }
  replaceEditorValue(formatted);
  sampleSelect.value = "";
  renderScore();
  setStatus("Reduced runs of spaces to at most two.");
});

addPaddingBtn.addEventListener("click", () => {
  const formatted = normalizeInlineOverlayMeasures(editor.value);
  if (formatted === editor.value) {
    setStatus("No overlay padding is needed.");
    return;
  }
  replaceEditorValue(formatted);
  sampleSelect.value = "";
  renderScore();
  setStatus("Added only the padding needed to align overlay voices.");
});

document.querySelector("#render-now").addEventListener("click", renderScore);

downloadMidiBtn.addEventListener("click", () => {
  try {
    if (!lastVisualObj) {
      setStatus("Render a tune before downloading MIDI.", true);
      return;
    }
    const midiPayload = abcjs.synth.getMidiFile(lastVisualObj, {
      midiOutputType: "binary",
    });
    const midiBytes = toMidiBytes(midiPayload);
    const blob = new Blob([midiBytes], { type: "audio/midi" });
    const url = window.URL.createObjectURL(blob);
    triggerDownloadFromUrl(url, `${tuneFileStem()}.mid`);
    setStatus("Downloaded MIDI file.");
  } catch (err) {
    setStatus(`Could not download MIDI: ${err.message ?? err}`, true);
  }
});

downloadWavBtn.addEventListener("click", async () => {
  let wav = null;
  downloadWavBtn.disabled = true;
  try {
    if (!supportsAudio) {
      setStatus("WAV download is not supported in this browser.", true);
      return;
    }
    if (!lastVisualObj || !lastPrepared) {
      setStatus("Render a tune before downloading WAV.", true);
      return;
    }
    const audioParams = createAudioParams(lastPrepared.meta);
    setStatus("Rendering WAV…");
    wav = await player.createWav(lastVisualObj, audioParams);
    triggerDownloadFromUrl(wav.url, `${tuneFileStem()}.wav`);
    setStatus("Downloaded WAV file.");
  } catch (err) {
    setStatus(`Could not download WAV: ${err.message ?? err}`, true);
  } finally {
    try {
      wav?.stop();
    } catch {
      /* ignore cleanup errors */
    }
    updateDownloadButtons();
  }
});

downloadPdfBtn.addEventListener("click", async () => {
  try {
    if (!lastVisualObj) {
      setStatus("Render a tune before saving PDF.", true);
      return;
    }
    await saveScoreAsPdf();
    setStatus("Downloaded PDF sheet music.");
  } catch (err) {
    setStatus(`Could not save PDF: ${err.message ?? err}`, true);
  }
});

downloadPngBtn.addEventListener("click", async () => {
  try {
    if (!lastVisualObj) {
      setStatus("Render a tune before saving PNG.", true);
      return;
    }
    await saveScoreAsImage("image/png", "png");
    setStatus("Downloaded PNG sheet music.");
  } catch (err) {
    setStatus(`Could not save PNG: ${err.message ?? err}`, true);
  }
});

downloadJpegBtn.addEventListener("click", async () => {
  try {
    if (!lastVisualObj) {
      setStatus("Render a tune before saving JPEG.", true);
      return;
    }
    await saveScoreAsImage("image/jpeg", "jpeg", 0.95);
    setStatus("Downloaded JPEG sheet music.");
  } catch (err) {
    setStatus(`Could not save JPEG: ${err.message ?? err}`, true);
  }
});

document.querySelector("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    setStatus("Copied ABC Desk source to clipboard.");
  } catch {
    setStatus("Could not copy to clipboard.", true);
  }
});

document.querySelector("#copy-strict").addEventListener("click", async () => {
  try {
    const prepared = prepareSource(editor.value);
    await navigator.clipboard.writeText(toStrictAbc(prepared.cleanAbc));
    setStatus("Copied strict ABC (Desk tags stripped; MIDI program kept).");
  } catch {
    setStatus("Could not copy to clipboard.", true);
  }
});

document.querySelector("#share").addEventListener("click", async () => {
  try {
    const url = await copyShareUrl(editor.value);
    history.replaceState(null, "", url);
    setStatus("Share link copied — anyone with the URL can open this tune.");
  } catch {
    setStatus("Could not copy share link.", true);
  }
});

document.querySelector("#clear").addEventListener("click", () => {
  replaceEditorValue("");
  history.replaceState(null, "", window.location.pathname + window.location.search);
  renderScore();
});

editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    replaceEditorSelection("  ");
    scheduleRender();
  }
});

void initSynth().then(() => {
  renderScore();
  updateDownloadButtons();
});
