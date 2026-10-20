import { IOWA_VIOLIN_SAMPLES } from "./iowaViolinSamples.js";
import { createSampleCache, sampleTrackPan, isViolinInstrument } from "./sampledInstrument.js";
export { isViolinInstrument };

const ROOTS = Object.fromEntries(["pp", "mf", "ff"].map(layer => [layer,
  Object.values(IOWA_VIOLIN_SAMPLES).filter(sample => sample.layer === layer)
    .map(sample => sample.root).sort((a, b) => a - b),
]));
const OUTPUT_GAIN = 3;

export function iowaViolinSample(note) {
  const velocity = Number(note.violinVelocity ?? note.volume);
  if (!Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127 ||
      !Number.isFinite(velocity) || velocity < 0) {
    throw new Error("Iowa violin requires a valid MIDI pitch and bow velocity.");
  }
  const strike = Math.max(1, Math.min(127, velocity));
  const layer = strike <= 62 ? "pp" : strike <= 96 ? "mf" : "ff";
  const root = ROOTS[layer].reduce((best, candidate) =>
    Math.abs(candidate - note.pitch) < Math.abs(best - note.pitch) ? candidate : best);
  const sample = IOWA_VIOLIN_SAMPLES[`${layer}-${root}`];
  const embedded = globalThis.abcDeskIowaSamples;
  if (embedded && !embedded[sample.name]) throw new Error(`Embedded Iowa violin sample missing: ${sample.name}`);
  return { ...sample, strike, url: embedded?.[sample.name] ??
    `${import.meta.env?.BASE_URL ?? "/"}iowa-violin/${sample.name}` };
}

export function createIowaViolinSampleCache(options = {}) {
  return createSampleCache({
    ...options, label: "Iowa violin",
    failureHint: "Check your connection or turn off Use high quality violin in Customize.",
  });
}
const sampleCache = createIowaViolinSampleCache();

export function mixIowaViolinNote(output, sample, note, wholeNoteSeconds, pan = 0, options = {}) {
  const descriptor = iowaViolinSample(note);
  const rate = output.sampleRate;
  const held = Math.max(0.005, (note.end - note.start) * wholeNoteSeconds - (options.noteEnd ?? 0) / 1000);
  const release = options.violinReleaseMs ?? 200;
  const offset = Math.round(note.start * wholeNoteSeconds * rate);
  const frames = Math.ceil((held + release / 1000) * rate);
  const cents = note.cents ?? 0;
  const multiplier = options.soundFontVolumeMultiplier ?? 1;
  if (!Number.isFinite(wholeNoteSeconds) || wholeNoteSeconds <= 0 ||
      !Number.isFinite(note.start) || note.start < 0 || !Number.isFinite(note.end) || note.end < note.start ||
      !Number.isFinite(held) || !Number.isFinite(release) || release < 0 ||
      !Number.isFinite(note.volume) || note.volume < 0 || !Number.isFinite(cents) ||
      !Number.isFinite(pan) || Math.abs(pan) > 1 || !Number.isFinite(multiplier) || multiplier < 0 ||
      !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(frames) ||
      output.numberOfChannels !== 2 || !Number.isFinite(output.length) || output.length < offset + frames ||
      ![1, 2].includes(sample.numberOfChannels) || !Number.isFinite(sample.sampleRate) || sample.sampleRate <= 0 ||
      !Number.isFinite(sample.length) || sample.length <= 0 ||
      sample.length / sample.sampleRate < descriptor.loopEnd) {
    throw new Error("Iowa violin sample does not match the performance timeline.");
  }
  const step = sample.sampleRate / rate * 2 ** ((note.pitch - descriptor.root + cents / 100) / 12);
  const loopStart = descriptor.loopStart * sample.sampleRate;
  const loopEnd = descriptor.loopEnd * sample.sampleRate;
  const crossfade = descriptor.crossfade * sample.sampleRate;
  const loopLength = loopEnd - loopStart - crossfade;
  if (!Number.isFinite(step) || step <= 0 || loopLength <= 0) {
    throw new Error("Iowa violin sample does not match the performance timeline.");
  }
  const inputs = [sample.getChannelData(0), sample.getChannelData(sample.numberOfChannels === 2 ? 1 : 0)];
  const outputs = [output.getChannelData(0), output.getChannelData(1)];
  const gain = OUTPUT_GAIN * note.volume / 127 * multiplier;
  const angle = (pan <= 0 ? pan + 1 : pan) * Math.PI / 2;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const monoLeft = Math.cos((pan + 1) * Math.PI / 4), monoRight = Math.sin((pan + 1) * Math.PI / 4);
  const read = (input, position) => {
    const low = Math.floor(position), high = Math.min(low + 1, sample.length - 1);
    return input[low] + (input[high] - input[low]) * (position - low);
  };
  for (let i = 0; i < frames; i++) {
    let position = i * step;
    if (position >= loopEnd) position = loopStart + crossfade + (position - loopEnd) % loopLength;
    let l = read(inputs[0], position), r = read(inputs[1], position);
    if (position > loopEnd - crossfade) {
      const fraction = (position - loopEnd + crossfade) / crossfade;
      const head = loopStart + position - loopEnd + crossfade;
      l += (read(inputs[0], head) - l) * fraction;
      r += (read(inputs[1], head) - r) * fraction;
    }
    if (sample.numberOfChannels === 1) {
      l *= monoLeft; r *= monoRight;
    } else if (pan <= 0) {
      l += r * cosine; r *= sine;
    } else {
      r += l * sine; l *= cosine;
    }
    const time = i / rate;
    const envelope = Math.min(1, time / .001) *
      (time <= held ? 1 : Math.max(0, 1 - (time - held) / (release / 1000)));
    outputs[0][offset + i] += l * gain * envelope;
    outputs[1][offset + i] += r * gain * envelope;
  }
}

export async function renderIowaViolin(context, tracks, output, wholeNoteSeconds, options) {
  const groups = new Map();
  let length = output.length;
  const release = options.violinReleaseMs ?? 200;
  tracks.forEach((track, index) => {
    const pan = sampleTrackPan(options.pan, index, tracks.length);
    for (const note of track) {
      if (note.volume === 0) continue;
      const descriptor = iowaViolinSample(note);
      if (!groups.has(descriptor.name)) groups.set(descriptor.name, { descriptor, notes: [] });
      groups.get(descriptor.name).notes.push({ note, pan });
      length = Math.max(length, Math.round(note.start * wholeNoteSeconds * output.sampleRate) +
        Math.ceil((Math.max(.005, (note.end - note.start) * wholeNoteSeconds -
          (options.noteEnd ?? 0) / 1000) + release / 1000) * output.sampleRate));
    }
  });
  if (!Number.isFinite(length) || length < 1) throw new Error("Invalid Iowa violin performance length.");
  if (length > output.length) {
    const extended = context.createBuffer(2, length, output.sampleRate);
    for (let channel = 0; channel < 2; channel++) extended.getChannelData(channel).set(output.getChannelData(channel));
    output = extended;
  }
  const signal = options.pianoSampleSignal;
  let completed = 0;
  options.onViolinLoadProgress?.({ completed, total: groups.size });
  for (const { descriptor, notes } of groups.values()) {
    signal?.throwIfAborted();
    const sample = await sampleCache.load(context, descriptor, signal);
    for (const { note, pan } of notes) mixIowaViolinNote(output, sample, note, wholeNoteSeconds, pan, options);
    options.onViolinLoadProgress?.({ completed: ++completed, total: groups.size });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return output;
}
