/**
 * ABC Desk's player boundary.
 *
 * The current backend delegates to abcjs, but the application only depends on
 * this focused interface so a purpose-built scheduler can replace it later.
 */
export function createDeskPlayer({ abcjs, audioSelector, cursorControl }) {
  const supportsAudio = abcjs.synth.supportsAudio();
  let controller = null;
  let diagnostics = null;

  return {
    supportsAudio,
    backendName: "abcjs-adapter",
    canCreateWav: true,

    load() {
      if (!supportsAudio || controller) return;
      controller = new abcjs.synth.SynthController();
      controller.load(audioSelector, cursorControl, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });
    },

    get loaded() {
      return Boolean(controller);
    },

    setTune(visualObj, audioParams) {
      if (!controller) return;
      diagnostics = inspectTune(visualObj, audioParams);
      controller.setTune(visualObj, false, audioParams);
      this.invalidate();
      controller.visualObj = visualObj;
      controller.options = audioParams;
      controller.disable(false);
    },

    getDiagnostics() {
      return diagnostics;
    },

    disable(value) {
      controller?.disable(value);
    },

    invalidate() {
      if (!controller) return;
      try {
        if (typeof controller.pause === "function") controller.pause();
      } catch {
        /* cleanup is best effort */
      }

      if (controller.timer) {
        try {
          controller.timer.reset();
          controller.timer.stop();
        } catch {
          /* cleanup is best effort */
        }
        controller.timer = null;
      }
      if (controller.midiBuffer) {
        try {
          controller.midiBuffer.stop();
        } catch {
          /* cleanup is best effort */
        }
        controller.midiBuffer = null;
      }
      controller.isLoaded = false;
      controller.isLoading = false;
      controller.isStarted = false;
    },

    async createWav(visualObj, audioParams) {
      const synth = new abcjs.synth.CreateSynth();
      try {
        await synth.init({ visualObj, options: audioParams });
        await synth.prime();
        return { url: synth.download(), stop: () => synth.stop?.() };
      } catch (error) {
        synth.stop?.();
        throw error;
      }
    },
  };
}

export function createTestingPlayer({ audioSelector, cursorControl }) {
  let loaded = false;
  let visualObj = null;
  let timers = [];
  let events = [];
  let diagnostics = null;
  let paused = false;
  let audioContext = null;
  let activeSources = [];

  return {
    supportsAudio: true,
    canCreateWav: false,
    backendName: "testing-timer-backend",

    load() {
      if (loaded) return;
      loaded = true;
      const audio = document.querySelector(audioSelector);
      if (!audio) throw new Error(`Testing backend target not found: ${audioSelector}`);
      audio.innerHTML = `
        <button type="button" class="primary" data-test-play>Play test clock</button>
        <button type="button" data-test-pause>Pause</button>
        <button type="button" data-test-reset>Reset</button>
      `;
      audio.querySelector("[data-test-play]").addEventListener("click", play);
      audio.querySelector("[data-test-pause]").addEventListener("click", pause);
      audio.querySelector("[data-test-reset]").addEventListener("click", reset);
    },

    get loaded() {
      return loaded;
    },

    setTune(nextVisualObj, audioParams) {
      invalidate();
      visualObj = nextVisualObj;
      const sequence = visualObj.setUpAudio(audioParams);
      events = (sequence?.tracks ?? []).flat().filter((event) => event.cmd === "note");
      diagnostics = summarizeEvents(sequence?.tracks ?? []);
      paused = false;
    },

    getDiagnostics() {
      return diagnostics;
    },

    disable(value) {
      const audio = document.querySelector(audioSelector);
      audio?.querySelectorAll("button").forEach((button) => {
        button.disabled = Boolean(value);
      });
    },

    invalidate,

    async createWav() {
      throw new Error("WAV export is unavailable in the testing backend.");
    },
  };

  function play() {
    if (!visualObj || paused) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is unavailable in the testing backend.");
    audioContext ??= new AudioContextClass();
    audioContext.resume();
    cursorControl.onStart();
    for (const event of events) {
      const delay = Math.max(0, Math.round((Number(event.start) || 0) * 1000));
      const duration = Math.max(0.04, (Number(event.end) || 0) - (Number(event.start) || 0));
      timers.push(window.setTimeout(() => cursorControl.onEvent({
        elements: event.elements || event.elts || [],
        left: 0,
        top: 0,
        height: 0,
      }), delay));
      timers.push(window.setTimeout(() => playNote(event, duration), delay));
    }
    const end = Math.max(...events.map((event) => Number(event.end) || 0), 0);
    timers.push(window.setTimeout(() => {
      cursorControl.onFinished();
      paused = true;
    }, Math.round(end * 1000) + 20));
  }

  function pause() {
    paused = true;
    clearTimers();
    stopSources();
  }

  function reset() {
    pause();
    cursorControl.onFinished();
    paused = false;
  }

  function invalidate() {
    clearTimers();
    stopSources();
    cursorControl.onFinished();
    paused = false;
  }

  function clearTimers() {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
  }

  function playNote(event, duration) {
    if (!audioContext || paused || event.pitch == null) return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequency = 440 * Math.pow(2, (Number(event.pitch) - 69) / 12);
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(
      Math.min(0.18, Math.max(0.02, (Number(event.volume) || 64) / 700)),
      now + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    activeSources.push(oscillator);
    oscillator.addEventListener("ended", () => {
      activeSources = activeSources.filter((source) => source !== oscillator);
    }, { once: true });
  }

  function stopSources() {
    for (const source of activeSources) {
      try {
        source.stop();
      } catch {
        /* source may already have ended */
      }
    }
    activeSources = [];
  }
}

function inspectTune(visualObj, audioParams) {
  const sequence = visualObj.setUpAudio(audioParams);
  const tracks = sequence?.tracks ?? [];
  let notes = 0;
  let events = 0;
  let end = 0;
  for (const track of tracks) {
    for (const event of track) {
      events++;
      if (event.cmd === "note") {
        notes++;
        end = Math.max(end, Number(event.end) || 0);
      }
    }
  }
  return summarizeEvents(tracks, { notes, events, end });
}

function summarizeEvents(tracks, counts = {}) {
  let notes = counts.notes ?? 0;
  let events = counts.events ?? 0;
  let end = counts.end ?? 0;
  if (counts.notes == null) {
    for (const track of tracks) {
      for (const event of track) {
        events++;
        if (event.cmd === "note") {
          notes++;
          end = Math.max(end, Number(event.end) || 0);
        }
      }
    }
  }
  return {
    tracks: tracks.length,
    notes,
    events,
    duration: Math.round(end * 1000) / 1000,
  };
}
