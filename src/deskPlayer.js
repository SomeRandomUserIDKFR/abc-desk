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

export function createTestingPlayer({ abcjs, audioSelector, cursorControl }) {
  let loaded = false;
  let visualObj = null;
  let timers = [];
  let events = [];
  let diagnostics = null;
  let paused = false;
  let currentAudioParams = null;
  let synth = null;
  let roomBus = null;

  return {
    supportsAudio: true,
    canCreateWav: false,
    backendName: "testing-timer-backend",

    load() {
      if (loaded) return;
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
      loaded = true;
    },

    get loaded() {
      return loaded;
    },

    setTune(nextVisualObj, audioParams) {
      invalidate();
      visualObj = nextVisualObj;
      currentAudioParams = amplifyExperimentalHuman(audioParams);
      const sequence = visualObj.setUpAudio(currentAudioParams);
      const tracks = sequence?.tracks ?? [];
      for (const track of tracks) {
        for (const event of track) {
          if (event.cmd === "note" && event.end == null) {
            event.end = (Number(event.start) || 0) + (Number(event.duration) || 0);
          }
        }
      }
      events = tracks.flat().filter((event) => event.cmd === "note");
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

  async function play() {
    if (!visualObj || paused) return;
    synth = new abcjs.synth.CreateSynth();
    await synth.init({ visualObj, options: currentAudioParams });
    await synth.prime();
    synth.start();
    connectRoom(synth, currentAudioParams?.callbackContext?.room);
    cursorControl.onStart();
    for (const event of events) {
      const delay = Math.max(0, Math.round((Number(event.start) || 0) * 1000));
      timers.push(window.setTimeout(() => cursorControl.onEvent({
        elements: event.elements || event.elts || [],
        left: 0,
        top: 0,
        height: 0,
      }), delay));
    }
    const end = Math.max(...events.map(eventEnd), 0);
    timers.push(window.setTimeout(() => {
      cursorControl.onFinished();
      paused = true;
    }, Math.round(end * 1000) + 20));
  }

  function pause() {
    paused = true;
    clearTimers();
    synth?.stop();
    roomBus?.input.disconnect();
    roomBus = null;
  }

  function reset() {
    pause();
    cursorControl.onFinished();
    paused = false;
  }

  function invalidate() {
    clearTimers();
    synth?.stop();
    roomBus?.input.disconnect();
    roomBus = null;
    synth = null;
    cursorControl.onFinished();
    paused = false;
  }

  function clearTimers() {
    for (const timer of timers) window.clearTimeout(timer);
    timers = [];
  }

  function eventDuration(event) {
    return Math.max(0.04, Number(event.duration) || ((Number(event.end) || 0) - (Number(event.start) || 0)));
  }

  function eventEnd(event) {
    return (Number(event.start) || 0) + eventDuration(event);
  }

  function connectRoom(nextSynth, room) {
    if (!room || room.mix <= 0 || !nextSynth.directSource?.length) return;
    const context = nextSynth.directSource[0].context;
    const input = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const convolver = context.createConvolver();
    const length = Math.max(1, Math.ceil(context.sampleRate * room.decay));
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let index = 0; index < length; index++) {
        data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.5);
      }
    }
    convolver.buffer = impulse;
    dry.gain.value = 1 - room.mix;
    wet.gain.value = room.mix;
    input.connect(dry).connect(context.destination);
    input.connect(convolver).connect(wet).connect(context.destination);
    for (const source of nextSynth.directSource) {
      source.disconnect();
      source.connect(input);
    }
    roomBus = { input };
  }

}

function amplifyExperimentalHuman(audioParams) {
  const amount = Number(audioParams?.callbackContext?.humanize?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return audioParams;

  return {
    ...audioParams,
    callbackContext: {
      ...audioParams.callbackContext,
      experimentalPerformance: true,
      humanize: {
        ...audioParams.callbackContext.humanize,
        // The experiment is deliberately expressive: Human remains the master
        // control, but moderate values reach the existing humanizer sooner.
        amount: Math.min(1, amount * 2.5),
      },
    },
  };
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
        end = Math.max(end, eventEnd(event));
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
          end = Math.max(end, eventEnd(event));
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
