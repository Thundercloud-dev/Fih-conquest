// Island world settings live here so spacing and size are easy to tune.
export const ISLAND_SETTINGS = Object.freeze({
  scale: 48,
  landRadius: 520,
  shoreRadius: 570,
  worldLimitX: 1000000000,
  worldLimitY: 1000000000,
  chunkSize: 7000,
  generatedIslandsPerChunk: 2,
  generatedBiomes: ['tropical', 'reef', 'mist', 'beach', 'rocky', 'remote'],
  chunkSearchRadius: 2,
  islandSafetyGap: 500,
  minGeneratedSize: 0.9,
  generatedSizeRange: 0.6
});
