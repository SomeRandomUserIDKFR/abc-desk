import * as JSSynth from "js-synthesizer";
import fluidSynthScriptUrl from "js-synthesizer/externals/libfluidsynth-2.4.6.js?url";

const MUSESCORE_SOUNDFONT_URL =
  "https://raw.githubusercontent.com/wrightflyer/SF2_SoundFonts/97e9b8d0a2cd37064e7d031243b25df573372140/GeneralUser%20GS%20MuseScore%20v1.442.sf2";

let engineReady;

export function createMuseScorePlayer({ abcjs, audioSelector }) {
  let synth = null;
  let audioNode = null;
  let loaded = false;
  let visualObj = null;
  let midiBytes = null;

  return {
    supportsAudio: typeof AudioContext !== "undefined",
    backendName: "musescore-fluidsynth-wasm",
    canCreateWav: false,

    load() {
      if (!this.supportsAudio || loaded) return;
      loaded = true;
      const audio = document.querySelector(audioSelector);
      if (!audio) throw new Error(`MuseScore target not found: ${audioSelector}`);
      audio.innerHTML =
        '<button type="button" class="primary" data-musescore-load>Load MuseScore General</button>';
      audio.querySelector("[data-musescore-load]").addEventListener("click", () => {
        void initialize();
      });
    },

    get loaded() {
      return loaded;
    },

    setTune(nextVisualObj) {
      visualObj = nextVisualObj;
      const payload = abcjs.synth.getMidiFile(visualObj, {
        midiOutputType: "binary",
      });
      midiBytes = toArrayBuffer(payload);
    },

    getDiagnostics() {
      return { backend: "MuseScore General via FluidSynth WASM" };
    },

    disable(value) {
      document
        .querySelector(audioSelector)
        ?.querySelectorAll("button")
        .forEach((button) => {
          button.disabled = Boolean(value);
        });
    },

    invalidate() {
      synth?.stopPlayer();
      synth?.closePlayer();
      synth?.close();
      synth = null;
      audioNode?.disconnect();
      audioNode = null;
    },
  };

  async function initialize() {
    const button = document.querySelector("[data-musescore-load]");
    if (button) button.disabled = true;
    try {
      await prepareEngine();
      const context = new AudioContext();
      synth = new JSSynth.Synthesizer();
      synth.init(context.sampleRate);
      audioNode = synth.createAudioNode(context, 8192);
      audioNode.connect(context.destination);
      const soundfont = await fetch(MUSESCORE_SOUNDFONT_URL);
      if (!soundfont.ok) {
        throw new Error(`MuseScore soundfont request failed (${soundfont.status}).`);
      }
      await synth.loadSFont(await soundfont.arrayBuffer());
      const audio = document.querySelector(audioSelector);
      if (audio) {
        audio.innerHTML =
          '<button type="button" class="primary" data-musescore-play>Play MuseScore General</button>';
        audio.querySelector("[data-musescore-play]").addEventListener("click", () => {
          void play();
        });
      }
    } catch (error) {
      if (button) button.disabled = false;
      throw error;
    }
  }

  async function play() {
    if (!synth || !midiBytes) return;
    synth.closePlayer();
    await synth.addSMFDataToPlayer(midiBytes);
    await synth.playPlayer();
  }
}

async function prepareEngine() {
  if (!engineReady) {
    engineReady = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = fluidSynthScriptUrl;
      script.onload = () => {
        try {
          JSSynth.Synthesizer.initializeWithFluidSynthModule(window.Module);
          resolve(JSSynth.waitForReady());
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error("Could not load FluidSynth WebAssembly."));
      document.head.appendChild(script);
    });
  }
  return engineReady;
}

function toArrayBuffer(payload) {
  if (payload instanceof ArrayBuffer) return payload;
  if (payload instanceof Uint8Array) {
    return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
  }
  throw new Error("Unexpected MIDI payload format.");
}
