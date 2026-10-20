import { createSampleCache, sampleTrackPan as salamanderTrackPan } from "./sampledInstrument.js";
export { salamanderTrackPan };

const SAMPLE_BASE =
  "https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/3382bf9496bba2486f5ab0de55a264d1dfc38404/Samples/";
const VELOCITY_LIMITS = [26, 34, 36, 43, 46, 50, 56, 64, 72, 80, 88, 96, 104, 112, 120, 127];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OUTPUT_GAIN = 0.6;

export function salamanderSample(note) {
  const velocity = Number(note.pianoVelocity ?? note.volume);
  if (!Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127 ||
      !Number.isFinite(velocity) || velocity < 0) {
    throw new Error("Salamander requires a valid MIDI pitch and strike velocity.");
  }
  const strike = Math.max(1, Math.min(127, velocity));
  const layer = VELOCITY_LIMITS.findIndex((limit) => strike <= limit) + 1;
  const root = Math.max(21, Math.min(108, 21 + Math.round((note.pitch - 21) / 3) * 3));
  const name = `${NOTE_NAMES[root % 12]}${Math.floor(root / 12) - 1}v${layer}.flac`;
  return { root, layer, strike, name, url: SAMPLE_BASE + encodeURIComponent(name) };
}

export function createSalamanderSampleCache(options = {}) {
  return createSampleCache({
    ...options, label: "Salamander",
    failureHint: "Check your connection or turn off High-quality piano in Customize.",
  });
}

const sampleCache = createSalamanderSampleCache();

export function mixSalamanderNote(output, sample, note, wholeNoteSeconds, pan = 0, multiplier = 1) {
  const descriptor = salamanderSample(note);
  const rate = output.sampleRate;
  const offset = Math.round(note.start * wholeNoteSeconds * rate);
  const held = Math.round((note.end - note.start) * wholeNoteSeconds * rate);
  const release = Math.ceil(note.pianoReleaseMs * rate / 1000);
  const frames = held + release;
  const cents = Number(note.cents ?? 0);
  if (!Number.isFinite(wholeNoteSeconds) || wholeNoteSeconds <= 0 ||
      !Number.isFinite(offset) || offset < 0 || !Number.isFinite(frames) ||
      held < 0 || release < 0 || frames <= 0 || output.length < offset + frames ||
      output.numberOfChannels !== 2 || ![1, 2].includes(sample.numberOfChannels) ||
      !sample.length || !Number.isFinite(sample.sampleRate) || sample.sampleRate <= 0 ||
      !Number.isFinite(note.volume) || note.volume < 0 ||
      !Number.isFinite(cents) || !Number.isFinite(pan) || Math.abs(pan) > 1 ||
      !Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error("Salamander sample does not match the performance timeline.");
  }
  const step = sample.sampleRate / rate * 2 ** ((note.pitch - descriptor.root + cents / 100) / 12);
  if (!Number.isFinite(step) || step <= 0) throw new Error("Invalid Salamander playback rate.");
  // Recorded layers supply the touch; mix compensation must not select a softer recording.
  const gain = OUTPUT_GAIN * note.volume / descriptor.strike *
    (descriptor.strike / 127) ** 0.54 * multiplier;
  const left = sample.getChannelData(0);
  const right = sample.getChannelData(sample.numberOfChannels === 2 ? 1 : 0);
  const outLeft = output.getChannelData(0);
  const outRight = output.getChannelData(1);
  const angle = (pan <= 0 ? pan + 1 : pan) * Math.PI / 2;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const monoLeft = Math.cos((pan + 1) * Math.PI / 4);
  const monoRight = Math.sin((pan + 1) * Math.PI / 4);
  const available = Math.ceil(sample.length / step);
  for (let index = 0; index < Math.min(frames, available); index++) {
    const position = index * step;
    const low = Math.floor(position), high = Math.min(low + 1, sample.length - 1);
    const fraction = position - low;
    let l = left[low] + (left[high] - left[low]) * fraction;
    let r = right[low] + (right[high] - right[low]) * fraction;
    if (sample.numberOfChannels === 1) {
      l *= monoLeft;
      r *= monoRight;
    } else if (pan <= 0) {
      l += r * cosine;
      r *= sine;
    } else {
      r += l * sine;
      l *= cosine;
    }
    const damping = index < held ? 1 : (frames - index) / release;
    const sampleEnd = Math.min(1, (available - index) / (rate * 0.005));
    const volume = gain * damping * sampleEnd;
    outLeft[offset + index] += l * volume;
    outRight[offset + index] += r * volume;
  }
}

export async function renderSalamanderPiano(context, tracks, output, wholeNoteSeconds, options, mixDamperNote) {
  const groups = new Map();
  let length = output.length;
  tracks.forEach((track, trackIndex) => {
    const pan = salamanderTrackPan(options.pan, trackIndex, tracks.length);
    for (const note of track) {
      if (note.volume === 0) continue;
      const descriptor = salamanderSample(note);
      if (!groups.has(descriptor.name)) groups.set(descriptor.name, { descriptor, notes: [] });
      groups.get(descriptor.name).notes.push({ note, pan });
      length = Math.max(length, Math.round(note.start * wholeNoteSeconds * output.sampleRate) +
        Math.round((note.end - note.start) * wholeNoteSeconds * output.sampleRate) +
        Math.ceil(note.pianoReleaseMs * output.sampleRate / 1000));
    }
  });
  if (!Number.isFinite(length) || length < 1) throw new Error("Invalid Salamander performance length.");
  if (length > output.length) {
    const extended = context.createBuffer(2, length, output.sampleRate);
    for (let channel = 0; channel < 2; channel++) extended.getChannelData(channel).set(output.getChannelData(channel));
    output = extended;
  }
  let completed = 0;
  const signal = options.pianoSampleSignal;
  options.onPianoLoadProgress?.({ completed, total: groups.size });
  for (const { descriptor, notes } of groups.values()) {
    signal?.throwIfAborted();
    const sample = await sampleCache.load(context, descriptor, signal);
    for (const { note, pan } of notes) {
      const multiplier = options.soundFontVolumeMultiplier ?? 1;
      if (note.pianoDamperRelease) {
        const frames = Math.round((note.end - note.start) * wholeNoteSeconds * output.sampleRate) +
          Math.ceil(note.pianoReleaseMs * output.sampleRate / 1000);
        const strike = context.createBuffer(2, frames, output.sampleRate);
        mixSalamanderNote(strike, sample,
          { ...note, start: 0, end: frames / output.sampleRate / wholeNoteSeconds, pianoReleaseMs: 0 },
          wholeNoteSeconds, pan, multiplier);
        mixDamperNote(output, strike, note, wholeNoteSeconds);
      } else {
        mixSalamanderNote(output, sample, note, wholeNoteSeconds, pan, multiplier);
      }
    }
    options.onPianoLoadProgress?.({ completed: ++completed, total: groups.size });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return output;
}
