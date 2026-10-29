// Island generation and coast geometry are kept outside the main game loop.
import { ISLAND_SETTINGS as CFG } from './island-settings.js';

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function chunkSeed(cx, cy) {
  return (Math.imul(cx + 12000, 73856093) ^ Math.imul(cy + 12000, 19349663) ^ 0x51F1C0DE) >>> 0;
}

export function createIslandWorld({ getIslands, setIslands, islandRadius, hash, context }) {
  function ensureWorldAround(x, y) {
    let islands = getIslands();
    const cx = Math.floor(x / CFG.chunkSize), cy = Math.floor(y / CFG.chunkSize);
    const range = CFG.chunkSearchRadius;

    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        const gx = cx + dx, gy = cy + dy;
        if (Math.abs(gx * CFG.chunkSize) > CFG.worldLimitX || Math.abs(gy * CFG.chunkSize) > CFG.worldLimitY) continue;
        const key = 'gen:' + gx + ':' + gy;
        if (islands.some(i => i.worldKey === key)) continue;

        const rand = seededRandom(chunkSeed(gx, gy));
        for (let n = 0; n < CFG.generatedIslandsPerChunk; n++) {
          // Keep islands toward the center of each large chunk to preserve wide sea lanes.
          const wx = gx * CFG.chunkSize + (rand() - 0.5) * CFG.chunkSize * 0.5;
          const wy = gy * CFG.chunkSize + (rand() - 0.5) * CFG.chunkSize * 0.5;
          const biome = CFG.generatedBiomes[Math.floor(rand() * CFG.generatedBiomes.length)];
          const size = CFG.minGeneratedSize + rand() * CFG.generatedSizeRange;
          const radius = CFG.landRadius * size;

          // Account for both islands' real sizes, not just their center points.
          if (islands.some(i => Math.hypot(i.wx - wx, i.wy - wy) < islandRadius(i) + radius + CFG.islandSafetyGap)) continue;

          const seed = Math.floor(rand() * 1e9);
          const names = ['Driftwood Isle', 'Northwind Reach', 'Silver Shoal', 'Whisper Cay', 'Stormglass Key', 'Tidewatch', 'Seafarer’s Rest', 'Bluehaven'];
          islands.push({
            key: key + ':' + n,
            worldKey: key,
            row: { id: key + ':' + n, name: names[Math.floor(rand() * names.length)], biome, x: wx, y: wy, claim_cost: 0, owner_id: null, generated: true },
            wx, wy, generated: true, size, seed, palms: []
          });
        }
      }
    }

    // Keep only nearby generated islands in memory; they regenerate from their seed when revisited.
    islands = islands.filter(i => !i.generated || (Math.abs(i.wx - x) <= CFG.chunkSize * 3 && Math.abs(i.wy - y) <= CFG.chunkSize * 3));
    setIslands(islands);
  }

  function shapeIsland(i, x, y) {
    const r = islandRadius(i), seed = i.seed || hash(i.row.id || i.key || i.row.name);
    const points = 24;
    const noise = a => 1 + 0.085 * Math.sin(a * 3 + seed * 0.001) + 0.055 * Math.cos(a * 5 + seed * 0.0007) + 0.035 * Math.sin(a * 9 + seed * 0.002);
    context.beginPath();
    for (let n = 0; n <= points; n++) {
      const a = n / points * Math.PI * 2, d = r * noise(a);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.78;
      if (n === 0) context.moveTo(px, py); else context.lineTo(px, py);
    }
    context.closePath();
  }

  return { ensureWorldAround, shapeIsland };
}
