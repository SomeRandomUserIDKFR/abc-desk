/**
 * ABC Desk's player boundary.
 *
 * The current backend delegates to abcjs, but the application only depends on
 * this focused interface so a purpose-built scheduler can replace it later.
 */
import { buildPerformanceGraph, normalizePerformanceTracks } from "./deskEvents.js";

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

export function createTestingPlayer({
  abcjs,
  audioSelector,
  cursorControl,
  majorExpansion = false,
  onPerformanceEvent = null,
}) {
  let loaded = false;
  let visualObj = null;
  let timers = [];
  let events = [];
  let diagnostics = null;
  let paused = false;
  let currentAudioParams = null;
  let synth = null;
  let roomBus = null;
  let secondsPerWholeNote = 2;
  let pausedSeconds = 0;

  return {
    supportsAudio: true,
    canCreateWav: true,
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
      currentAudioParams = amplifyExperimentalHuman(audioParams, majorExpansion);
      const bpm = Number(visualObj.getBpm?.());
      secondsPerWholeNote = Number.isFinite(bpm) && bpm > 0 ? 240 / bpm : 2;
      const sequence = visualObj.setUpAudio(currentAudioParams);
      const tracks = normalizePerformanceTracks(sequence?.tracks ?? []);
      for (const track of tracks) {
        for (const event of track) {
          if (event.end == null) {
            event.end = event.start + event.duration;
          }
        }
      }
      events = tracks.flat().filter(
        (event) => event.cmd === "note" && !event.ensembleReplica,
      );
      const graph = buildPerformanceGraph(tracks, currentAudioParams?.callbackContext);
      attachVisualElements(events, visualObj);
      events = groupSimultaneousEvents(events);
      diagnostics = summarizeEvents(tracks, {}, graph);
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

    async createWav(nextVisualObj, audioParams) {
      const wavSynth = new abcjs.synth.CreateSynth();
      const options = amplifyExperimentalHuman(audioParams, majorExpansion);
      try {
        await wavSynth.init({ visualObj: nextVisualObj, options });
        await wavSynth.prime();
        const room = options?.callbackContext?.room;
        if (room && room.mix > 0) {
          const rendered = await renderRoomWav(wavSynth.getAudioBuffer(), room);
          return {
            url: URL.createObjectURL(rendered),
            stop: () => wavSynth.stop?.(),
          };
        }
        return {
          url: wavSynth.download(),
          stop: () => wavSynth.stop?.(),
        };
      } catch (error) {
        wavSynth.stop?.();
        throw error;
      }
    },
  };

  async function play() {
    if (!visualObj) return;
    if (synth && paused) {
      synth.start();
      paused = false;
      scheduleCursor(pausedSeconds);
      return;
    }
    synth = new abcjs.synth.CreateSynth();
    await synth.init({ visualObj, options: currentAudioParams });
    await synth.prime();
    synth.start();
    connectRoom(
      synth,
      currentAudioParams?.callbackContext?.room,
      currentAudioParams?.callbackContext?.distance,
      currentAudioParams?.callbackContext?.players,
      currentAudioParams?.pan,
    );
    cursorControl.onStart();
    pausedSeconds = 0;
    scheduleCursor(0);
  }

  function scheduleCursor(fromSeconds) {
    for (const event of events) {
      const eventSeconds = (Number(event.start) || 0) * secondsPerWholeNote;
      if (eventSeconds < fromSeconds) continue;
      const delay = Math.max(0, Math.round((eventSeconds - fromSeconds) * 1000));
      timers.push(window.setTimeout(() => cursorControl.onEvent({
        elements: event.elements || event.elts || [],
        highlightDuration: eventDuration(event) * secondsPerWholeNote * 1000,
        left: 0,
        top: 0,
        height: 0,
      }), delay));
      timers.push(window.setTimeout(() => {
        onPerformanceEvent?.({
          event,
          seconds: eventSeconds,
          duration: eventDuration(event) * secondsPerWholeNote,
        });
      }, delay));
    }
    const end = Math.max(...events.map(eventEnd), 0);
    timers.push(window.setTimeout(() => {
      cursorControl.onFinished();
      paused = true;
    }, Math.max(0, Math.round((end * secondsPerWholeNote - fromSeconds) * 1000)) + 20));
  }

  function pause() {
    paused = true;
    clearTimers();
    pausedSeconds = synth?.pause?.() ?? pausedSeconds;
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

  function attachVisualElements(noteEvents, tune) {
    const selectables = tune.getSelectableArray?.() ?? [];
    for (const event of noteEvents) {
      if (event.startChar == null || event.endChar == null) continue;
      const svgElements = selectables
        .filter((selectable) => {
          const abc = selectable.absEl?.abcelem;
          return (
            abc &&
            abc.startChar < event.endChar &&
            abc.endChar > event.startChar &&
            abc.el_type === "note"
          );
        })
        .map((selectable) => selectable.svgEl)
        .filter(Boolean);
      if (svgElements.length) event.elements = [svgElements];
    }

  }

  function connectRoom(nextSynth, room, distance = 0.5, players = 1, voicePans = []) {
    if (!nextSynth.directSource?.length) return;
    const context = nextSynth.directSource[0].context;
    const input = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    const roomProfile = room ?? { decay: 0.1, damping: 0.4, mix: 0 };
    const warmth = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const preDelay = context.createDelay(0.2);
    const wetFilter = context.createBiquadFilter();
    const convolver = context.createConvolver();
    const reflections = [
      { delay: 0.011, level: 0.52, pan: -0.72 },
      { delay: 0.019, level: 0.37, pan: 0.64 },
      { delay: 0.031, level: 0.28, pan: -0.38 },
      { delay: 0.047, level: 0.2, pan: 0.48 },
      { delay: 0.067, level: 0.13, pan: -0.18 },
    ];
    const length = Math.max(1, Math.ceil(context.sampleRate * roomProfile.decay));
    const impulse = context.createBuffer(2, length, context.sampleRate);
    fillRoomImpulse(impulse, roomProfile);
    convolver.buffer = impulse;
    const spacing = Math.max(0, Math.min(1, Number(distance) || 0));
    const playerCount = Math.max(1, Number(players) || 1);
    const directLevel = 1 - spacing * 0.28;
    const roomMix = room?.mix ?? 0;
    dry.gain.value = directLevel * (1 - roomMix);
    wet.gain.value = Math.min(0.6, roomMix + spacing * 0.18);
    preDelay.delayTime.value = room?.predelay ?? 0;
    wetFilter.type = "lowpass";
    wetFilter.frequency.value = Math.max(1800, 12000 * (1 - (roomProfile.damping ?? 0.4) * 0.72));
    wetFilter.Q.value = 0.35;
    warmth.type = "lowshelf";
    warmth.frequency.value = 180;
    warmth.gain.value = 0.8;
    presence.type = "peaking";
    presence.frequency.value = 4200;
    presence.Q.value = 0.8;
    presence.gain.value = -2.5;
    input.connect(warmth).connect(presence);
    presence.connect(dry).connect(context.destination);
    if (room?.mix > 0) {
      presence.connect(preDelay).connect(convolver).connect(wetFilter).connect(wet).connect(context.destination);
    }
    if (roomMix > 0) {
      for (const reflection of reflections) {
      const delay = context.createDelay(0.08);
      const reflectionGain = context.createGain();
      const reflectionPan = context.createStereoPanner();
      delay.delayTime.value = reflection.delay;
      reflectionGain.gain.value =
        reflection.level *
        (room?.earlyLevel ?? 0.15) *
        (1 - spacing * 0.22) *
        Math.min(1.2, playerCount / 4);
      reflectionPan.pan.value = reflection.pan * (room?.width ?? 0.6) * Math.min(1, spacing + 0.2);
      input.connect(delay).connect(reflectionGain).connect(reflectionPan).connect(context.destination);
      }
    }
    nextSynth.directSource.forEach((source, index) => {
      source.disconnect();
      const playerGain = context.createGain();
      const playerPan = context.createStereoPanner();
      const playerTone = context.createBiquadFilter();
      const variation = Math.min(0.08, (playerCount - 1) * 0.012);
      // Keep larger sections full without letting layered replicas dominate.
      const ensembleScale = 1 / Math.sqrt(playerCount);
      playerGain.gain.value =
        ensembleScale * (1 + Math.sin((index + 1) * 2.17) * variation);
      playerTone.type = "peaking";
      playerTone.frequency.value = 2100 + Math.sin((index + 1) * 1.73) * 260;
      playerTone.Q.value = 0.65;
      playerTone.gain.value = Math.sin((index + 1) * 2.91) * 1.15;
      const sectionWidth = playerCount > 1
        ? Math.min(0.78, 0.34 + playerCount * 0.035)
        : 1;
      const stagePosition =
        Number.isFinite(Number(voicePans[index]))
          ? Number(voicePans[index])
          : nextSynth.directSource.length > 1
            ? (index / (nextSynth.directSource.length - 1) * 2 - 1) * sectionWidth
            : 0;
      playerPan.pan.value = stagePosition * Math.max(0.35, spacing);
      source.connect(playerGain).connect(playerTone).connect(playerPan).connect(input);
    });
    roomBus = { input };
  }

}

function groupSimultaneousEvents(noteEvents) {
  const grouped = [];
  // Human/player timing can separate one written beat by a few hundredths
  // of a whole note; keep those voices in one visual callback.
  const tolerance = 0.04;
  for (const event of [...noteEvents].sort((a, b) => a.start - b.start)) {
    const previous = grouped[grouped.length - 1];
    if (
      previous &&
      Math.abs((Number(event.start) || 0) - (Number(previous.start) || 0)) <= tolerance
    ) {
      previous.elements = mergeEventElements(previous.elements, event.elements);
      previous.duration = Math.max(
        Number(previous.duration) || 0,
        Number(event.duration) || 0,
      );
      previous.end = Math.max(Number(previous.end) || 0, Number(event.end) || 0);
    } else {
      grouped.push({ ...event });
    }
  }
  return grouped;
}

function mergeEventElements(left = [], right = []) {
  const merged = [...left];
  for (const set of right) {
    if (!merged.includes(set)) merged.push(set);
  }
  return merged;
}

function fillRoomImpulse(impulse, room) {
  const damping = room.damping ?? 0.4;
  const decay = Math.max(0.05, room.decay ?? 1);
  const seed = hashString(room.name ?? room.label ?? "room");
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      const t = index / data.length;
      const noise = stableNoise(seed + channel * 31, index);
      const shimmer = stableNoise(seed + channel * 47, Math.floor(index / 37));
      const envelope = Math.pow(1 - t, 1.35 + damping * 2.1);
      const highFrequencyLoss = Math.exp(-t * (1.8 + damping * 6.2));
      data[index] = (noise * 0.78 + shimmer * 0.22) * envelope * highFrequencyLoss;
    }
  }
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableNoise(seed, index) {
  let value = (seed + Math.imul(index + 1, 374761393)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) / 2147483648) * 2 - 1;
}

async function renderRoomWav(audioBuffer, room) {
  const OfflineContext =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) {
    throw new Error("Room WAV export requires OfflineAudioContext.");
  }
  const tail = Math.ceil(room.decay * audioBuffer.sampleRate);
  const context = new OfflineContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length + tail + Math.ceil((room.predelay ?? 0) * audioBuffer.sampleRate),
    audioBuffer.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  const input = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  const warmth = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const preDelay = context.createDelay(0.2);
  const wetFilter = context.createBiquadFilter();
  const convolver = context.createConvolver();
  const impulse = context.createBuffer(2, Math.max(1, tail), audioBuffer.sampleRate);
  fillRoomImpulse(impulse, room);
  convolver.buffer = impulse;
  dry.gain.value = 1 - room.mix;
  wet.gain.value = room.mix;
  preDelay.delayTime.value = room.predelay ?? 0;
  wetFilter.type = "lowpass";
  wetFilter.frequency.value = Math.max(1800, 12000 * (1 - (room.damping ?? 0.4) * 0.72));
  wetFilter.Q.value = 0.35;
  warmth.type = "lowshelf";
  warmth.frequency.value = 180;
  warmth.gain.value = 0.8;
  presence.type = "peaking";
  presence.frequency.value = 4200;
  presence.Q.value = 0.8;
  presence.gain.value = -2.5;
  input.connect(warmth).connect(presence);
  presence.connect(dry).connect(context.destination);
  presence.connect(preDelay).connect(convolver).connect(wetFilter).connect(wet).connect(context.destination);
  for (const reflection of [
    { delay: 0.011, level: 0.52, pan: -0.72 },
    { delay: 0.019, level: 0.37, pan: 0.64 },
    { delay: 0.031, level: 0.28, pan: -0.38 },
    { delay: 0.047, level: 0.2, pan: 0.48 },
    { delay: 0.067, level: 0.13, pan: -0.18 },
  ]) {
    const delay = context.createDelay(0.08);
    const reflectionGain = context.createGain();
    const reflectionPan = context.createStereoPanner();
    delay.delayTime.value = reflection.delay;
    reflectionGain.gain.value = reflection.level * (room.earlyLevel ?? 0.15);
    reflectionPan.pan.value = reflection.pan * (room.width ?? 0.6);
    input.connect(delay).connect(reflectionGain).connect(reflectionPan).connect(context.destination);
  }
  source.connect(input);
  source.start();
  return encodeWav(await context.startRendering());
}

function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * channels * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  let offset = 0;
  const write32 = (value) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const write16 = (value) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  write32(0x46464952);
  write32(length - 8);
  write32(0x45564157);
  write32(0x20746d66);
  write32(16);
  write16(1);
  write16(channels);
  write32(audioBuffer.sampleRate);
  write32(audioBuffer.sampleRate * channels * 2);
  write16(channels * 2);
  write16(16);
  write32(0x61746164);
  write32(length - 44);
  const data = Array.from({ length: channels }, (_, channel) =>
    audioBuffer.getChannelData(channel),
  );
  for (let index = 0; index < audioBuffer.length; index++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][index]));
      view.setInt16(
        offset,
        (sample < 0 ? sample * 32768 : sample * 32767) | 0,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function eventDuration(event) {
  return Math.max(
    0.04,
    Number(event.duration) ||
      ((Number(event.end) || 0) - (Number(event.start) || 0)),
  );
}

function eventEnd(event) {
  return (Number(event.start) || 0) + eventDuration(event);
}

function amplifyExperimentalHuman(audioParams, majorExpansion = false) {
  const amount = Number(audioParams?.callbackContext?.humanize?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return audioParams;

  return {
    ...audioParams,
    callbackContext: {
      ...audioParams.callbackContext,
      experimentalPerformance: true,
      expressionExpansion: majorExpansion,
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

function summarizeEvents(tracks, counts = {}, graph = null) {
  let notes = counts.notes ?? 0;
  let events = counts.events ?? 0;
  let end = counts.end ?? 0;
  if (counts.notes == null) {
    for (const track of tracks) {
      for (const event of track) {
        events++;
        if (event.cmd === "note" && !event.ensembleReplica) {
          notes++;
          end = Math.max(end, eventEnd(event));
        }
      }
    }
  }
  const allNotes = tracks.flat().filter((event) => event.cmd === "note");
  const replicaNotes = allNotes.filter((event) => event.ensembleReplica).length;
  const playerCount = graph?.player.count ?? 1;
  return {
    tracks: tracks.length,
    notes,
    events,
    duration: Math.round(end * 1000) / 1000,
    phrases: graph?.phrases.length ?? 0,
    expressionEvents: graph?.expression.length ?? 0,
    toneEvents: graph?.tone.length ?? 0,
    tempoEvents: graph?.tempo.length ?? 0,
    articulations: graph?.articulations ?? {},
    roomEvents: graph?.room.length ?? 0,
    players: playerCount,
    ensembleLayers: replicaNotes ? Math.max(0, playerCount - 1) : 0,
    ensembleGain: Number((1 / Math.sqrt(Math.max(1, playerCount))).toFixed(3)),
    performance: graph
      ? {
          phrases: graph.phrases,
          expression: graph.expression,
          tone: graph.tone,
          tempo: graph.tempo,
          articulations: graph.articulations,
        }
      : null,
  };
}
