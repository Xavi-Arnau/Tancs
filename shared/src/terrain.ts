import { BOARD_HEIGHT } from "./constants.js";
import type { Terrain, TerrainDiffEntry } from "./types.js";

/**
 * Generates a heightmap via midpoint displacement, producing rolling hill-like terrain.
 * Deterministic given a seeded rng function so it can be tested; defaults to Math.random.
 */
export function generateTerrain(
  width: number,
  rng: () => number = Math.random,
): Terrain {
  // Work at a power-of-two-plus-one resolution, then resample down to `width` columns.
  let size = 1;
  while (size + 1 < width) size *= 2;
  size += 1;

  const points = new Array<number>(size);
  const baseHeight = BOARD_HEIGHT * 0.4;
  const roughness = BOARD_HEIGHT * 0.5;

  points[0] = baseHeight + (rng() - 0.5) * roughness;
  points[size - 1] = baseHeight + (rng() - 0.5) * roughness;

  let step = size - 1;
  let displacement = roughness;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < size - 1; i += step) {
      const avg = (points[i - half] + points[i + half]) / 2;
      points[i] = avg + (rng() - 0.5) * displacement;
    }
    step = half;
    displacement *= 0.55;
  }

  const heights = new Array<number>(width);
  for (let x = 0; x < width; x++) {
    const srcIndex = Math.floor((x / (width - 1)) * (size - 1));
    heights[x] = clampHeight(points[srcIndex]);
  }

  return { width, heights };
}

function clampHeight(h: number): number {
  return Math.max(BOARD_HEIGHT * 0.1, Math.min(BOARD_HEIGHT * 0.85, h));
}

export function heightAt(terrain: Terrain, x: number): number {
  const col = Math.round(x);
  if (col < 0 || col >= terrain.width) return 0;
  return terrain.heights[col];
}

/**
 * Carves a circular crater centered at impactX with the given radius, lowering terrain
 * heights within range using a semicircular cross-section. Returns a new heights array
 * plus a sparse diff of only the columns that actually changed.
 */
export function carveCrater(
  heights: number[],
  impactX: number,
  radius: number,
): { heights: number[]; diff: TerrainDiffEntry[] } {
  const newHeights = heights.slice();
  const diff: TerrainDiffEntry[] = [];

  const centerCol = Math.round(impactX);
  const start = Math.max(0, centerCol - Math.ceil(radius));
  const end = Math.min(heights.length - 1, centerCol + Math.ceil(radius));

  for (let x = start; x <= end; x++) {
    const dx = x - impactX;
    if (Math.abs(dx) > radius) continue;
    const depth = Math.sqrt(radius * radius - dx * dx);
    const oldHeight = newHeights[x];
    const newHeight = Math.max(0, oldHeight - depth);
    if (newHeight !== oldHeight) {
      newHeights[x] = newHeight;
      diff.push({ x, oldHeight, newHeight });
    }
  }

  return { heights: newHeights, diff };
}
