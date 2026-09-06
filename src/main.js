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
import { parseParts } from "./deskParts.js";
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
const DEFAULT_ABC = shared || SAMPLES.cooleys;
const frameworkHash = window.location.hash.toLowerCase();
const oldFramework = frameworkHash === "#oldframework";
const testingFramework = frameworkHash === "#testingframework";
const experimentalFramework = !oldFramework;

const app = document.querySelector("#app");

app.innerHTML = `
  <header class="hero">
    <h1 class="brand">ABC <em>Desk</em></h1>
    <p class="tagline">Compose in text — lint, multi-part scores, attack marks, share links. <code>Inst:</code> / <code>%%MIDI</code>, <code>Part:</code>, <code>!gimplus!</code>.</p>
  </header>
  <main class="workspace">
    <section class="panel editor-panel" aria-label="ABC source">
      <div class="panel-header">
        <h2 class="panel-title">Source</h2>
        <div class="toolbar">
          <label class="sr-only" for="sample">Sample tune</label>
          <select id="sample" title="Load a sample">
            <option value="cooleys">Cooley's</option>
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
        experimentalFramework
          ? `<div id="testing-panel" class="lint-panel" aria-label="Player experiment">
              <div class="lint-header"><h2 class="panel-title">Player experiment</h2><span class="lint-count">${testingFramework ? "#testingframework" : "default"}</span></div>
              <p id="testing-metrics" class="lint-empty">Render a tune to inspect normalized playback events.</p>
              <div id="performance-timeline" class="performance-timeline" aria-label="Performance timeline" hidden>
                <div class="timeline-header"><span>Performance map</span><span id="timeline-time">0.0s</span></div>
                <div class="timeline-track">
                  <div id="timeline-phrases" class="timeline-layer timeline-phrases"></div>
                  <div id="timeline-expression" class="timeline-layer timeline-expression"></div>
                  <div id="timeline-tempo" class="timeline-layer timeline-tempo"></div>
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
`;
document.head.appendChild(style);

const editor = document.querySelector("#editor");
const paper = document.querySelector("#paper");
const statusEl = document.querySelector("#status");
const sampleSelect = document.querySelector("#sample");
const audioEl = document.querySelector("#audio");
const lintList = document.querySelector("#lint-list");
const lintCount = document.querySelector("#lint-count");
const downloadMidiBtn = document.querySelector("#download-midi");
const downloadWavBtn = document.querySelector("#download-wav");
const downloadPdfBtn = document.querySelector("#download-pdf");
const downloadPngBtn = document.querySelector("#download-png");
const downloadJpegBtn = document.querySelector("#download-jpeg");
const testingMetrics = document.querySelector("#testing-metrics");
const performanceTimeline = document.querySelector("#performance-timeline");
const timelinePhrases = document.querySelector("#timeline-phrases");
const timelineExpression = document.querySelector("#timeline-expression");
const timelineTempo = document.querySelector("#timeline-tempo");
const timelinePlayhead = document.querySelector("#timeline-playhead");
const timelineLegend = document.querySelector("#timeline-legend");
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
  }

  onStart() {
    this.experimentalActive.clear();
    const svg = paper.querySelector("svg");
    if (!svg) return;
    let cursor = svg.querySelector(".abcjs-cursor");
    if (!cursor) {
      cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
      cursor.setAttribute("class", "abcjs-cursor");
      cursor.setAttributeNS(null, "x1", "0");
      cursor.setAttributeNS(null, "y1", "0");
      cursor.setAttributeNS(null, "x2", "0");
      cursor.setAttributeNS(null, "y2", "0");
      svg.appendChild(cursor);
    }
  }

  onEvent(event) {
    if (!event?.elements?.length) return;
    if (!this.experimental) {
      paper.querySelectorAll(".abcjs-highlight").forEach((el) => {
        el.classList.remove("abcjs-highlight");
      });
    }
    for (const set of event.elements) {
      for (const el of set) {
        el.classList.add("abcjs-highlight");
        if (this.experimental && event.highlightDuration) {
          const token = {};
          this.experimentalActive.set(el, token);
          window.setTimeout(() => {
            if (this.experimentalActive.get(el) !== token) return;
            this.experimentalActive.delete(el);
            el.classList.remove("abcjs-highlight");
          }, event.highlightDuration);
        }
      }
    }
    const cursor = paper.querySelector(".abcjs-cursor");
    if (cursor) {
      cursor.setAttribute("x1", event.left - 2);
      cursor.setAttribute("x2", event.left - 2);
      cursor.setAttribute("y1", event.top);
      cursor.setAttribute("y2", event.top + event.height);
    }
  }

  onFinished() {
    this.experimentalActive.clear();
    paper.querySelectorAll(".abcjs-highlight").forEach((el) => {
      el.classList.remove("abcjs-highlight");
    });
    const cursor = paper.querySelector(".abcjs-cursor");
    if (cursor) {
      cursor.setAttribute("x1", 0);
      cursor.setAttribute("x2", 0);
      cursor.setAttribute("y1", 0);
      cursor.setAttribute("y2", 0);
    }
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

function initSynth() {
  player = experimentalFramework
    ? createTestingPlayer({
        abcjs,
        audioSelector: "#audio",
        cursorControl: new CursorControl(true),
      majorExpansion: testingFramework,
      onPerformanceEvent: ({ seconds }) => updateTimelinePlayhead(seconds),
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
  const partInfo = parseParts(source);
  let working = source;
  /** @type {string[]} */
  const extraWarnings = [...(partInfo.warnings || [])];
  let partsMeta = null;

  if (partInfo.isMultiPart && partInfo.assembledAbc) {
    working = partInfo.assembledAbc;
    partsMeta = partInfo.parts;
  }

  const parsed = parseDeskHeaders(working);
  return {
    cleanAbc: parsed.cleanAbc,
    meta: { ...parsed.meta, parts: partsMeta, sourceText: parsed.cleanAbc },
    warnings: [...extraWarnings, ...parsed.warnings],
    partInfo,
    sourceForLint: source,
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

    if (player?.loaded && lastVisualObj) {
      const audioParams = deskAudioParams(prepared.meta);
      try {
        player.setTune(lastVisualObj, audioParams);
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
    ? `${player.backendName}: ${metrics.tracks} tracks · ${metrics.notes} notes · ${metrics.events} events · ${metrics.duration}s · ${metrics.phrases} phrases · ${metrics.expressionEvents} curves · ${metrics.toneEvents} tone changes · ${metrics.players} players · ${metrics.ensembleGain}x section gain · ${formatArticulations(metrics.articulations)}`
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
  const addExpressionSpike = (parent, note) => {
    const start = Math.max(0, Number(note.start) || 0);
    const end = Math.max(start, Number(note.end) || start);
    const intensity = Math.max(0.12, Math.min(1, (Number(note.volume) || 32) / 127));
    const spike = document.createElement("span");
    spike.className = "timeline-spike";
    spike.style.left = `${(start / duration) * 100}%`;
    spike.style.width = `${Math.max(0.18, ((end - start) / duration) * 100)}%`;
    spike.style.height = `${Math.round(18 + intensity * 72)}%`;
    spike.title = `Note intensity: ${Math.round(intensity * 100)}%`;
    parent.appendChild(spike);
  };

  timelinePhrases.innerHTML = "";
  timelineExpression.innerHTML = "";
  timelineTempo.innerHTML = "";
  for (const phrase of graph.phrases ?? []) addRange(timelinePhrases, phrase, "phrase");
  for (const curve of graph.expression ?? []) {
    addRange(timelineExpression, curve, "expression");
  }
  for (const note of graph.events ?? []) {
    if (note.type === "note" || note.cmd === "note") {
      addExpressionSpike(timelineExpression, note);
    }
  }
  for (const curve of graph.tempo ?? []) addRange(timelineTempo, curve, "tempo");

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
      const audioParams = deskAudioParams(lastPrepared.meta);
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
  editor.value = SAMPLES[key] ?? DEFAULT_ABC;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  renderScore();
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
  try {
    if (!supportsAudio) {
      setStatus("WAV download is not supported in this browser.", true);
      return;
    }
    if (!lastVisualObj || !lastPrepared) {
      setStatus("Render a tune before downloading WAV.", true);
      return;
    }
    const audioParams = deskAudioParams(lastPrepared.meta);
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
  editor.value = "";
  history.replaceState(null, "", window.location.pathname + window.location.search);
  renderScore();
});

editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + 2;
    scheduleRender();
  }
});

initSynth();
renderScore();
updateDownloadButtons();
