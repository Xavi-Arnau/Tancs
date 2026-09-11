import {
  BARREL_LAUNCH_HEIGHT,
  MAX_ANGLE,
  MAX_POWER,
  MIN_ANGLE,
  MIN_POWER,
} from "./constants.js";
import { simulateProjectile } from "./physics.js";
import { heightAt } from "./terrain.js";
import type { InventoryEntry, PlayerState, Terrain, TurnAction } from "./types.js";
import { getWeapon, WEAPONS } from "./weapons.js";

export const CPU_AMMO_PER_WEAPON = 5;

const ANGLE_JITTER = 4;
const POWER_JITTER = 5;
const COARSE_ANGLE_STEP = 10;
const COARSE_POWER_STEP = 10;
const FINE_STEP = 1;

/** A CPU opponent's starting arsenal: a modest stock of every purchasable weapon, so a human
 * playing against it can experience being hit by each weapon type over a session, without
 * the CPU ever needing to go through a real buy phase. */
export function cpuLoadout(): InventoryEntry[] {
  return Object.values(WEAPONS)
    .filter((w) => w.purchasable)
    .map((w) => ({ weaponId: w.id, quantity: CPU_AMMO_PER_WEAPON }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface DecideCpuActionParams {
  terrain: Terrain;
  players: PlayerState[];
  wind: number;
  cpuSlot: 0 | 1;
  rng?: () => number;
}

/**
 * Picks a weapon and aim for the CPU's turn: grid-searches candidate (angle, power) pairs by
 * actually simulating each one, picks whichever lands closest to the opponent's tank, then
 * jitters the result so the CPU is a genuine-but-beatable opponent rather than a perfect
 * aimbot or pure noise.
 */
export function decideCpuAction(params: DecideCpuActionParams): TurnAction {
  const { terrain, players, wind, cpuSlot, rng = Math.random } = params;
  const cpu = players[cpuSlot];
  const opponent = players[cpuSlot === 0 ? 1 : 0];

  const candidates = cpu.inventory.filter((e) => e.quantity > 0).map((e) => e.weaponId);
  candidates.push("basic_shell");
  const weaponId = candidates[Math.floor(rng() * candidates.length)];
  const weapon = getWeapon(weaponId);

  const startX = cpu.tankX;
  const startY = heightAt(terrain, startX) + BARREL_LAUNCH_HEIGHT;

  function bestOf(
    angleRange: [number, number],
    angleStep: number,
    powerRange: [number, number],
    powerStep: number,
  ): { angle: number; power: number; distance: number } {
    let bestAngle = angleRange[0];
    let bestPower = powerRange[0];
    let bestDistance = Infinity;
    for (let angle = angleRange[0]; angle <= angleRange[1]; angle += angleStep) {
      for (let power = powerRange[0]; power <= powerRange[1]; power += powerStep) {
        const segments = simulateProjectile(weapon, { startX, startY, angle, power, wind, terrain });
        const impact = segments[segments.length - 1].impact;
        if (!impact) continue;
        const distance = Math.abs(impact.x - opponent.tankX);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestAngle = angle;
          bestPower = power;
        }
      }
    }
    return { angle: bestAngle, power: bestPower, distance: bestDistance };
  }

  // Coarse grid search over the full range, then a fine refinement pass around the coarse
  // winner — a single 10-degree/10-power grid alone can leave enough error that the fired
  // shot lands outside the weapon's splash radius even before any intentional jitter.
  const coarse = bestOf(
    [MIN_ANGLE, MAX_ANGLE],
    COARSE_ANGLE_STEP,
    [MIN_POWER, MAX_POWER],
    COARSE_POWER_STEP,
  );
  const fine = bestOf(
    [clamp(coarse.angle - COARSE_ANGLE_STEP, MIN_ANGLE, MAX_ANGLE), clamp(coarse.angle + COARSE_ANGLE_STEP, MIN_ANGLE, MAX_ANGLE)],
    FINE_STEP,
    [clamp(coarse.power - COARSE_POWER_STEP, MIN_POWER, MAX_POWER), clamp(coarse.power + COARSE_POWER_STEP, MIN_POWER, MAX_POWER)],
    FINE_STEP,
  );

  const angle = clamp(fine.angle + (rng() * 2 - 1) * ANGLE_JITTER, MIN_ANGLE, MAX_ANGLE);
  const power = clamp(fine.power + (rng() * 2 - 1) * POWER_JITTER, MIN_POWER, MAX_POWER);

  return { weaponId, angle, power };
}
