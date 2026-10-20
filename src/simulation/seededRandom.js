export function nextSeededRandom(seed) {
  let nextSeed = Number(seed) >>> 0;
  if (nextSeed === 0) nextSeed = 1;
  nextSeed ^= nextSeed << 13;
  nextSeed ^= nextSeed >>> 17;
  nextSeed ^= nextSeed << 5;
  nextSeed >>>= 0;
  return { seed: nextSeed, value: nextSeed / 4294967296 };
}
