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
%% Desk: ascent, cluster, styles, crescendo / diminuendo (descendo alias ok)
!ascent!C2 D2 E2 G2 | !cluster!c4 !cluster5!e4 | !xhead!G2 !harmonic!c2 !triangle!e2 z2 |
!p! !crescendo(! C2 E2 G2 c2 | e2 g2 c'2 e'2 !crescendo)! !ff! |
!descendo(! e'2 c'2 g2 e2 | c2 G2 E2 C2 !descendo)! !pp! |
!gimplus! !cluster!c8 | z8 |`,

  broken: songTxt,
};

const DEFAULT_ABC = SAMPLES.cooleys;

const app = document.querySelector("#app");

app.innerHTML = `
  <header class="hero">
    <h1 class="brand">ABC <em>Desk</em></h1>
    <p class="tagline">Compose in ABC with Desk marks — <code>!ascent!</code>, <code>!cluster!</code>, note styles, real cresc./dim. ramps, <code>Inst:</code> / <code>%%MIDI program</code>. Powered by abcjs ${abcjs.signature?.replace("abcjs-", "") ?? "6"}.</p>
  </header>
  <main class="workspace">
    <section class="panel editor-panel" aria-label="ABC source">
      <div class="panel-header">
        <h2 class="panel-title">Source</h2>
        <div class="toolbar">
          <label class="sr-only" for="sample">Sample tune</label>
          <select id="sample" title="Load a sample">
            <option value="cooleys">Cooley's (Inst:)</option>
            <option value="twinkle">Twinkle (%%desk-)</option>
            <option value="bach">Bach (I:desk-)</option>
            <option value="blues">Blues (Inst:)</option>
            <option value="expression">Expression pack</option>
            <option value="broken">Broken Reflection</option>
          </select>
          <button type="button" id="copy">Copy</button>
          <button type="button" id="copy-strict" title="Strip Desk tags; keep MIDI program">Copy strict</button>
          <button type="button" id="clear">Clear</button>
        </div>
      </div>
      <textarea id="editor" spellcheck="false" aria-label="ABC notation editor">${DEFAULT_ABC}</textarea>
    </section>
    <section class="panel score-panel" aria-label="Rendered score">
      <div class="panel-header">
        <h2 class="panel-title">Score</h2>
        <div class="toolbar">
          <button type="button" class="primary" id="render-now">Render</button>
        </div>
      </div>
      <div class="audio-row">
        <div id="audio"></div>
      </div>
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

let synthControl = null;
let renderTimer = null;
let lastVisualObj = null;
let renderGen = 0;

class CursorControl {
  constructor() {
    this.beatSubdivisions = 2;
  }

  onStart() {
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
    paper.querySelectorAll(".abcjs-highlight").forEach((el) => {
      el.classList.remove("abcjs-highlight");
    });
    for (const set of event.elements) {
      for (const el of set) {
        el.classList.add("abcjs-highlight");
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

function initSynth() {
  if (!abcjs.synth.supportsAudio()) {
    audioEl.innerHTML =
      '<p style="margin:0;color:var(--muted);font-size:0.85rem">Audio playback is not supported in this browser.</p>';
    return;
  }

  synthControl = new abcjs.synth.SynthController();
  synthControl.load("#audio", new CursorControl(), {
    displayLoop: true,
    displayRestart: true,
    displayPlay: true,
    displayProgress: true,
    displayWarp: true,
  });
}

/** abcjs setTune(userAction=false) keeps isLoaded + old audio buffer — force rebuild on next play. */
function invalidateSynthAudio() {
  if (!synthControl) return;
  try {
    if (typeof synthControl.pause === "function") synthControl.pause();
  } catch {
    /* ignore */
  }
  if (synthControl.timer) {
    try {
      synthControl.timer.reset();
      synthControl.timer.stop();
    } catch {
      /* ignore */
    }
    synthControl.timer = null;
  }
  if (synthControl.midiBuffer) {
    try {
      synthControl.midiBuffer.stop();
    } catch {
      /* ignore */
    }
    synthControl.midiBuffer = null;
  }
  synthControl.isLoaded = false;
  synthControl.isLoading = false;
  synthControl.isStarted = false;
}

function renderScore() {
  const abc = editor.value;
  const gen = ++renderGen;

  if (!abc.trim()) {
    paper.innerHTML = "";
    lastVisualObj = null;
    invalidateSynthAudio();
    setStatus("Enter ABC notation to render a score.");
    if (synthControl) synthControl.disable(true);
    return;
  }

  try {
    const { cleanAbc, meta, warnings: deskWarnings } = parseDeskHeaders(abc);
    if (gen !== renderGen) return;

    // Always redraw the SVG so the score can't stick to a previous parse.
    paper.innerHTML = "";

    const visualObjs = abcjs.renderAbc(paper, cleanAbc, {
      responsive: "resize",
      add_classes: true,
      clickListener: (abcElem) => {
        if (abcElem?.startChar != null && abcElem?.endChar != null) {
          editor.focus();
          editor.setSelectionRange(abcElem.startChar, abcElem.endChar);
        }
      },
    });

    if (gen !== renderGen) return;

    lastVisualObj = visualObjs[0] ?? null;
    const warnings = filterDecorationWarnings([
      ...deskWarnings,
      ...(lastVisualObj?.warnings ?? []),
    ]);
    const title = lastVisualObj?.metaText?.title ?? "Untitled";
    const deskBit = deskStatusFragment(meta);
    const base = deskBit
      ? `Rendered “${title}” · ${deskBit}`
      : `Rendered “${title}”`;

    if (warnings.length) {
      setStatus(`${base} — ${warnings[0]}`, true);
    } else {
      setStatus(base);
    }

    if (synthControl && lastVisualObj) {
      const audioParams = deskAudioParams(meta);
      // userAction=false updates visualObj but leaves isLoaded + old midiBuffer.
      synthControl.setTune(lastVisualObj, false, audioParams);
      invalidateSynthAudio();
      synthControl.visualObj = lastVisualObj;
      synthControl.options = audioParams;
      synthControl.disable(false);
    }
  } catch (err) {
    if (gen !== renderGen) return;
    paper.innerHTML = "";
    setStatus(`Parse error: ${err.message ?? err}`, true);
  }
}

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
  renderScore();
});

document.querySelector("#render-now").addEventListener("click", renderScore);

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
    const strict = toStrictAbc(editor.value);
    await navigator.clipboard.writeText(strict);
    setStatus("Copied strict ABC (Desk tags stripped; MIDI program kept).");
  } catch {
    setStatus("Could not copy to clipboard.", true);
  }
});

document.querySelector("#clear").addEventListener("click", () => {
  editor.value = "";
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
