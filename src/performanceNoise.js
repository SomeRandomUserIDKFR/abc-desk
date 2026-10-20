export function stableUnitNoise(seed) {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function stableSignedNoise(seed) {
  return stableUnitNoise(seed) * 2 - 1;
}
