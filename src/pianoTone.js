import { isViolinInstrument } from "./sampledInstrument.js";

export function isPianoInstrument(instrument) {
  const name = String(instrument ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  return name === "acoustic-grand-piano" ||
    name === "piano" ||
    name === "bright-acoustic-piano" ||
    name === "bright-piano";
}

export function pianoToneBand(note) {
  const velocity = Number(note.pianoVelocity ?? note.volume);
  if (!Number.isFinite(velocity)) {
    throw new Error("Piano strike velocity must be finite.");
  }
  return Math.min(4, Math.floor(Math.max(0, Math.min(127, velocity)) / 26));
}

export async function primePianoSynth(abcjs, synth, initOptions) {
  await synth.init(initOptions);
  const sequenceCallback = synth.sequenceCallback;
  const pedalEvents = collectPianoPedalEvents(initOptions.visualObj, synth.flattened?.totalDuration);
  const wholeNoteSeconds = synth.millisecondsPerMeasure / 1000 / synth.meterSize;
  let pianoTracks = [];
  let violinTracks = [];
  let otherTracks = [];
  synth.sequenceCallback = (tracks, context) => {
    const hasPiano = tracks.some((track) => track.some((note) =>
      isPianoInstrument(context?.forceInstrument ?? note.instrument)));
    const hasViolin = initOptions.options?.highQualityViolin === true && tracks.some(track =>
      track.some(note => isViolinInstrument(context?.forceInstrument ?? note.instrument)));
    if (!hasPiano && !hasViolin) {
      sequenceCallback?.(tracks, context);
      initOptions.onPerformanceTracks?.(tracks);
      return;
    }
    tracks.forEach((track, trackIndex) => {
      const originals = new Map(
        (synth.flattened?.tracks[trackIndex] ?? [])
          .filter((note) => note.cmd === "note")
          .map((note) => [`${Math.round(note.start * 1e6)}:${note.pitch}`, note]),
      );
      for (const note of track) {
        const original = originals.get(`${Math.round(note.start * 1e6)}:${note.pitch}`);
        if (original && isPianoInstrument(context?.forceInstrument ?? note.instrument)) {
          note.pianoArticulation = original.endType ?? "normal";
          if (original.endType === "staccato") {
            note.end = note.start + original.duration * 0.6;
          }
        }
      }
    });
    const performanceContext = { ...context, pianoPedalEvents: pedalEvents };
    sequenceCallback?.(tracks, performanceContext);
    applyPianoReleases(tracks, pedalEvents, wholeNoteSeconds, context?.humanize?.amount,
      initOptions.options?.pianoDamperRelease !== false);
    initOptions.onPerformanceTracks?.(tracks);
    pianoTracks = tracks.map((track) => track.filter((note) => isPianoInstrument(note.instrument)));
    violinTracks = tracks.map(track => track.filter(note =>
      initOptions.options?.highQualityViolin === true && isViolinInstrument(note.instrument)));
    otherTracks = tracks.map((track) => track.filter((note) => !isPianoInstrument(note.instrument) &&
      !(initOptions.options?.highQualityViolin === true && isViolinInstrument(note.instrument))));
    for (const track of tracks) {
      track.length = 0;
    }
  };
  let result;
  try {
    result = await synth.prime();
  } finally {
    synth.sequenceCallback = sequenceCallback;
  }

  const groups = new Map();
  const damperGroups = new Map();
  const highQualityPiano = initOptions.options?.highQualityPiano === true &&
    pianoTracks.some((track) => track.length);
  if (otherTracks.some((track) => track.length)) {
    groups.set("other", { band: null, release: initOptions.options?.fadeLength ?? 200 });
  }
  pianoTracks.forEach((track, trackIndex) => {
    for (const note of track) {
      if (highQualityPiano) continue;
      const band = pianoToneBand(note);
      if (note.pianoDamperRelease) {
        const key = `${trackIndex}:${note.instrument}:${note.pitch}:${note.volume}:${note.cents ?? 0}:${band}`;
        if (!damperGroups.has(key)) damperGroups.set(key, { band, trackIndex, notes: [] });
        damperGroups.get(key).notes.push(note);
      } else {
        const release = note.pianoReleaseMs;
        groups.set(`${band}:${release}`, { band, release });
      }
    }
  });
  const highQualityViolin = violinTracks.some(track => track.length);
  if (!groups.size && !damperGroups.size && !highQualityPiano && !highQualityViolin) return result;
  let output = synth.getAudioBuffer();
  if (!output) throw new Error("Piano rendering produced no output buffer.");

  // Render one group at a time rather than retaining full-score stems in memory.
  for (const { band, release } of groups.values()) {
    const stem = new abcjs.synth.CreateSynth();
    const selected = band == null
      ? otherTracks.map((track) => track.map((note) => ({ ...note })))
      : pianoTracks.map((track) =>
        track.filter((note) => !note.pianoDamperRelease &&
          pianoToneBand(note) === band && note.pianoReleaseMs === release)
          .map((note) => ({ ...note })));
    try {
      await stem.init({
        ...initOptions,
        options: {
          ...initOptions.options,
          swing: 0,
          fadeLength: release,
          noteEnd: band == null ? initOptions.options?.noteEnd ?? 0 : 0,
          sequenceCallback(tracks) {
            tracks.splice(0, tracks.length, ...selected);
          },
        },
      });
      stem.flattened = {
        ...stem.flattened,
        totalDuration: Math.max(stem.flattened.totalDuration, ...selected.flat().map((note) => note.end)),
      };
      await stem.prime();
      const buffer = stem.getAudioBuffer();
      if (!buffer) throw new Error("Piano strike rendering produced no audio buffer.");
      const shaped = band == null ? buffer : await renderPianoTone(buffer, band);
      if (shaped.sampleRate !== output.sampleRate ||
          shaped.numberOfChannels !== output.numberOfChannels) {
        throw new Error("Piano strike buffer does not match the performance timeline.");
      }
      if (shaped.length > output.length) {
        output = extendPerformanceBuffer(abcjs, output, shaped.length);
      }
      for (let channel = 0; channel < output.numberOfChannels; channel++) {
        const destination = output.getChannelData(channel);
        const source = shaped.getChannelData(channel);
        for (let index = 0; index < source.length; index++) {
          destination[index] += source[index];
        }
      }
    } finally {
      stem.stop();
      stem.audioBuffers = [];
    }
  }
  for (const { band, trackIndex, notes } of damperGroups.values()) {
    const sampleRate = output.sampleRate;
    const requiredFrames = (note) =>
      Math.round((note.end - note.start) * wholeNoteSeconds * sampleRate) +
      Math.ceil(note.pianoReleaseMs * sampleRate / 1000);
    const frames = Math.max(...notes.map(requiredFrames));
    const first = notes[0];
    const duration = frames / sampleRate / wholeNoteSeconds;
    const sampleSynth = new abcjs.synth.CreateSynth();
    try {
      await sampleSynth.init({
        audioContext: abcjs.synth.activeAudioContext(),
        millisecondsPerMeasure: wholeNoteSeconds * 1000,
        sequence: {
          tempo: synth.flattened.tempo,
          totalDuration: duration,
          tracks: pianoTracks.map((_, index) => index === trackIndex ? [{
            cmd: "note",
            instrument: /bright/i.test(first.instrument) ? 1 : 0,
            pitch: first.pitch,
            volume: first.volume,
            cents: first.cents ?? 0,
            start: 0,
            duration,
            gap: 0,
          }] : []),
        },
        options: {
          ...initOptions.options,
          sequenceCallback: undefined,
          swing: 0,
          fadeLength: 8,
          noteEnd: 0,
        },
      });
      await sampleSynth.prime();
      const buffer = sampleSynth.getAudioBuffer();
      if (!buffer) throw new Error("Piano damper rendering produced no sample.");
      const sample = await renderPianoTone(buffer, band);
      const length = Math.max(...notes.map((note) =>
        Math.round(note.start * wholeNoteSeconds * sampleRate) + requiredFrames(note)));
      output = extendPerformanceBuffer(abcjs, output, length);
      for (const note of notes) {
        mixPianoDamperNote(output, sample, note, wholeNoteSeconds);
      }
    } finally {
      sampleSynth.stop();
      sampleSynth.audioBuffers = [];
    }
  }
  if (highQualityPiano) {
    const { renderSalamanderPiano } = await import("./salamanderPiano.js");
    output = await renderSalamanderPiano(
      abcjs.synth.activeAudioContext(), pianoTracks, output, wholeNoteSeconds,
      initOptions.options, mixPianoDamperNote,
    );
  }
  if (highQualityViolin) {
    const { renderIowaViolin } = await import("./iowaViolin.js");
    output = await renderIowaViolin(
      abcjs.synth.activeAudioContext(), violinTracks, output, wholeNoteSeconds, initOptions.options,
    );
  }
  synth.audioBuffers = [output];
  synth.duration = output.length / output.sampleRate;
  return { ...result, duration: synth.duration };
}

function extendPerformanceBuffer(abcjs, buffer, length) {
  if (length <= buffer.length) return buffer;
  const extended = abcjs.synth.activeAudioContext().createBuffer(
    buffer.numberOfChannels, length, buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    extended.getChannelData(channel).set(buffer.getChannelData(channel));
  }
  return extended;
}

export function mixPianoDamperNote(output, sample, note, wholeNoteSeconds) {
  const sampleRate = output.sampleRate;
  const offset = Math.round(note.start * wholeNoteSeconds * sampleRate);
  const keyFrames = Math.round((note.end - note.start) * wholeNoteSeconds * sampleRate);
  const tailFrames = Math.ceil(note.pianoReleaseMs * sampleRate / 1000);
  const frames = keyFrames + tailFrames;
  if (!Number.isFinite(wholeNoteSeconds) || wholeNoteSeconds <= 0 ||
      !Number.isFinite(note.pitch) || !Number.isFinite(offset) ||
      !Number.isFinite(note.pianoDampingSeconds) || note.pianoDampingSeconds <= 0 ||
      !Number.isFinite(frames) || keyFrames < 0 || tailFrames <= 0 || offset < 0 ||
      sample.sampleRate !== sampleRate || sample.numberOfChannels !== output.numberOfChannels ||
      sample.length < frames || output.length < offset + frames) {
    throw new Error("Piano damper sample does not match the note timeline.");
  }
  const cutoff = Math.max(1000, Math.min(2800, 1800 * 2 ** ((note.pitch - 60) / 48)));
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
  const resonanceSeconds = note.pianoReleaseMs / 3000;
  const catchSeconds = note.pianoDampingSeconds * 0.75;
  for (let channel = 0; channel < output.numberOfChannels; channel++) {
    const source = sample.getChannelData(channel);
    const destination = output.getChannelData(channel);
    let low = 0;
    for (let index = 0; index < frames; index++) {
      const dry = source[index];
      low += alpha * (dry - low);
      let value = dry;
      if (index >= keyFrames) {
        const elapsed = (index - keyFrames) / sampleRate;
        const caught = elapsed - catchSeconds * (1 - Math.exp(-elapsed / catchSeconds));
        const damping = 0.86 * Math.exp(-caught / note.pianoDampingSeconds) +
          0.14 * Math.exp(-caught / resonanceSeconds);
        const warmth = 1 - Math.exp(-caught / 0.008);
        const remaining = Math.min(1, (frames - index) / (sampleRate * 0.032));
        const endFade = remaining * remaining * (3 - 2 * remaining);
        value = (dry + (low - dry) * warmth) * damping * endFade;
      }
      destination[offset + index] += value;
    }
  }
}

export function collectPianoPedalEvents(tune, scoreEnd) {
  const events = new Map();
  for (const line of tune?.lines ?? []) {
    for (const staff of line.staff ?? []) {
      for (const voice of staff.voices) {
        for (const element of voice) {
          for (const annotation of element.chord ?? []) {
            if (annotation.position !== "below" ||
                (annotation.name !== "Ped." && annotation.name !== "*")) continue;
            const times = [element.currentTrackWholeNotes].flat();
            for (const start of times) {
              if (!Number.isFinite(start)) {
                throw new Error("Place piano pedal markings before a note or rest.");
              }
              const type = annotation.name === "Ped." ? "down" : "up";
              events.set(`${start}:${type}`, {
                type, start, startChar: element.startChar, endChar: element.endChar,
              });
            }
          }
        }
      }
    }
  }
  if (Number.isFinite(scoreEnd)) events.set("end", { type: "end", start: scoreEnd });
  return [...events.values()].sort((a, b) =>
    a.start - b.start || (a.type === "up" ? -1 : b.type === "up" ? 1 : 0));
}

export function applyPianoReleases(tracks, pedalEvents, wholeNoteSeconds, human = 0, modeledDamper = true) {
  if (!Number.isFinite(wholeNoteSeconds) || wholeNoteSeconds <= 0) {
    throw new Error("Piano releases require a valid performance tempo.");
  }
  const amount = Math.max(0, Math.min(1, Number(human ?? 0) * 2));
  if (!Number.isFinite(amount)) throw new Error("Piano humanization must be finite.");
  const notes = tracks.flat().filter((note) => isPianoInstrument(note.instrument))
    .sort((a, b) => a.start - b.start);
  const scoreEnd = pedalEvents.find((event) => event.type === "end")?.start ??
    Math.max(0, ...notes.map((note) => note.end));
  const intervals = [];
  let down = null;
  let previousTime = 0;
  for (let index = 0; index < pedalEvents.length; index++) {
    const event = pedalEvents[index];
    if (event.type === "end") continue;
    const previousGap = index > 0 ? event.start - pedalEvents[index - 1].start : Infinity;
    const nextGap = index + 1 < pedalEvents.length ? pedalEvents[index + 1].start - event.start : Infinity;
    const limit = Math.min(0.025 / wholeNoteSeconds, previousGap * 0.45, nextGap * 0.45);
    const variation = stableSignedNoise(`piano-pedal:${event.start}`) * limit * amount;
    const time = Math.max(previousTime, Math.min(scoreEnd, event.start + variation));
    previousTime = time;
    if (event.type === "down" && down == null) down = time;
    if (event.type === "up" && down != null) {
      intervals.push({ start: down, end: time });
      down = null;
    }
  }
  if (down != null) intervals.push({ start: down, end: scoreEnd });

  const byPitch = new Map();
  for (const note of notes) {
    if (!byPitch.has(note.pitch)) byPitch.set(note.pitch, []);
    byPitch.get(note.pitch).push(note);
  }
  const nextAttacks = new Map();
  for (const group of byPitch.values()) {
    let previousStart = Infinity;
    let nextStart = Infinity;
    for (let index = group.length - 1; index >= 0; index--) {
      if (previousStart > group[index].start + 1e-6) nextStart = previousStart;
      if (Number.isFinite(nextStart)) nextAttacks.set(group[index], nextStart);
      previousStart = group[index].start;
    }
  }
  const releases = [30, 55, 80, 110, 150];
  notes.forEach((note, index) => {
    const seed = `piano-release:${note.startChar}:${note.start}:${note.pitch}:${index}`;
    const durationSeconds = Math.max(0.001, (note.end - note.start) * wholeNoteSeconds);
    const lift = stableSignedNoise(`${seed}:lift`) * Math.min(0.018, durationSeconds * 0.1) * amount;
    const keyEnd = Math.max(note.start + 0.004 / wholeNoteSeconds, note.end + lift / wholeNoteSeconds);
    const pedal = intervals.find((interval) => keyEnd >= interval.start && keyEnd < interval.end);
    const articulation = String(note.pianoArticulation ?? note.articulation ?? note.endType ?? "");
    const staccato = articulation.includes("staccato");
    const releaseBase = pedal ? 3 :
      articulation === "tenuto" || durationSeconds >= 0.7 ? 4 : 2;
    const releaseIndex = Math.max(0, Math.min(4,
      releaseBase + Math.round(stableSignedNoise(`${seed}:damping`) * amount)));
    note.pianoKeyEnd = keyEnd;
    note.pianoPedaled = Boolean(pedal);
    note.pianoReleaseMs = releases[releaseIndex];
    note.end = pedal
      ? Math.max(keyEnd, Math.min(pedal.end, nextAttacks.get(note) ?? Infinity))
      : keyEnd;
    if (staccato && !pedal && modeledDamper) {
      note.pianoDamperRelease = true;
      note.pianoReleaseMs = Math.round(140 * (
        1 + stableSignedNoise(`${seed}:ring-off`) * 0.15 * amount));
      note.pianoDampingSeconds = 0.012 * (
        1 + stableSignedNoise(`${seed}:damper-speed`) * 0.15 * amount);
    }
  });
  return tracks;
}

export async function renderPianoTone(buffer, band) {
  if (!Number.isInteger(band) || band < 0 || band > 4) {
    throw new Error("Piano tone band must be an integer from 0 to 4.");
  }
  if (band === 4) return buffer;
  const OfflineContext = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("Piano tone shaping requires offline Web Audio support.");
  const context = new OfflineContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = context.createBufferSource();
  const brightness = context.createBiquadFilter();
  source.buffer = buffer;
  brightness.type = "highshelf";
  brightness.frequency.value = 2400;
  brightness.gain.value = -6 + band * 1.5;
  source.connect(brightness).connect(context.destination);
  source.start();
  return context.startRendering();
}
import { stableSignedNoise } from "./performanceNoise.js";
