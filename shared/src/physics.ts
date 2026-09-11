import {
  GRAVITY,
  MAX_SIM_TICKS,
  POWER_TO_VELOCITY,
  SIM_DT,
  TRAJECTORY_SAMPLE_COUNT,
} from "./constants.js";
import { heightAt } from "./terrain.js";
import type { Point, ProjectileType, Terrain } from "./types.js";

export interface ProjectileSimulationInput {
  startX: number;
  startY: number;
  angle: number; // degrees: 0 = flat toward +x, 90 = straight up, 180 = flat toward -x
  power: number; // 0-100
  wind: number; // signed horizontal acceleration
  terrain: Terrain;
}

export interface ProjectileSimulationResult {
  impact: Point | null; // null if the projectile left the board without hitting terrain
  path: Point[]; // full tick-by-tick path, used to derive a sampled trajectory
}

/**
 * Discrete-time parabolic simulation, stepped tick by tick (rather than a closed-form
 * solution) so collision against the heightmap is checked every tick and fast shots can't
 * tunnel through thin terrain features, and so future non-parabolic weapons can reuse the
 * same tick-loop shape.
 */
export function simulateParabolic(
  input: ProjectileSimulationInput,
): ProjectileSimulationResult {
  const angleRad = (input.angle * Math.PI) / 180;
  const speed = input.power * POWER_TO_VELOCITY;

  let x = input.startX;
  let y = input.startY;
  let vx = Math.cos(angleRad) * speed;
  let vy = Math.sin(angleRad) * speed;

  const path: Point[] = [{ x, y }];

  for (let tick = 0; tick < MAX_SIM_TICKS; tick++) {
    vx += input.wind * SIM_DT;
    vy -= GRAVITY * SIM_DT;
    x += vx * SIM_DT;
    y += vy * SIM_DT;
    path.push({ x, y });

    if (x < 0 || x > input.terrain.width - 1) {
      return { impact: null, path };
    }

    const groundHeight = heightAt(input.terrain, x);
    if (y <= groundHeight) {
      const impact = { x, y: groundHeight };
      path[path.length - 1] = impact;
      return { impact, path };
    }
  }

  // Safety cap reached without impact; treat as a lost shot.
  return { impact: null, path };
}

const projectileSimulators: Record<
  ProjectileType,
  (input: ProjectileSimulationInput) => ProjectileSimulationResult
> = {
  parabolic: simulateParabolic,
};

export function simulateProjectile(
  projectile: ProjectileType,
  input: ProjectileSimulationInput,
): ProjectileSimulationResult {
  const simulator = projectileSimulators[projectile];
  if (!simulator) {
    throw new Error(`No simulator registered for projectile type: ${projectile}`);
  }
  return simulator(input);
}

/**
 * Reduces a full tick-by-tick path down to an evenly-spaced sample for storage/replay,
 * always keeping the first and last (impact) point.
 */
export function sampleTrajectory(
  path: Point[],
  count: number = TRAJECTORY_SAMPLE_COUNT,
): Point[] {
  if (path.length <= count) return path;
  const sampled: Point[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (path.length - 1));
    sampled.push(path[idx]);
  }
  return sampled;
}
