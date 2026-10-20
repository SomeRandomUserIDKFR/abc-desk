export function isViolinInstrument(instrument) {
  return /^(violin|fiddle)$/i.test(String(instrument ?? "").trim());
}

export function createSampleCache({
  label, failureHint,
  fetchSample = (...args) => globalThis.fetch(...args),
  maxBytes = 32 * 1024 * 1024,
} = {}) {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new Error(`Invalid ${label} cache budget.`);
  const buffers = new Map();
  let bytes = 0;
  return {
    async load(context, sample, signal) {
      signal?.throwIfAborted();
      const key = `${context.sampleRate}:${sample.name}`;
      const cached = buffers.get(key);
      if (cached) {
        buffers.delete(key);
        buffers.set(key, cached);
        return cached;
      }
      let buffer;
      try {
        const response = await fetchSample(sample.url, { cache: "force-cache", signal });
        if (!response.ok) throw new Error(`Sample request returned HTTP ${response.status}.`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (![1, 2].includes(buffer.numberOfChannels) || !buffer.length ||
            !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0) {
          throw new Error("Decoded sample has an unsupported audio format.");
        }
      } catch (error) {
        signal?.throwIfAborted();
        throw new Error(`Could not load ${label} sample ${sample.name}: ${error.message ?? error} ${failureHint}`,
          { cause: error });
      }
      signal?.throwIfAborted();
      const shared = buffers.get(key);
      if (shared) {
        buffers.delete(key);
        buffers.set(key, shared);
        return shared;
      }
      const size = buffer.length * buffer.numberOfChannels * 4;
      if (size <= maxBytes) {
        while (bytes + size > maxBytes && buffers.size) {
          const oldest = buffers.keys().next().value;
          const removed = buffers.get(oldest);
          bytes -= removed.length * removed.numberOfChannels * 4;
          buffers.delete(oldest);
        }
        buffers.set(key, buffer);
        bytes += size;
      }
      return buffer;
    },
  };
}

export function sampleTrackPan(pan, index, count) {
  if (pan == null) return 0;
  if (Array.isArray(pan)) {
    const value = Number(pan[index] ?? 0);
    if (!Number.isFinite(value)) throw new Error("Instrument pan must be finite.");
    return Math.max(-1, Math.min(1, value));
  }
  const separation = Number(pan);
  if (!Number.isFinite(separation)) throw new Error("Instrument pan must be finite.");
  if (separation * (count - 1) > 2) return 0;
  const low = count % 2 === 0 ? -separation / 2 : 0;
  return index % 2 === 0
    ? low - Math.floor(index / 2) * separation
    : low + separation + Math.floor(index / 2) * separation;
}
