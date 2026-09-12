import {
  AIRSTRIKE_ALTITUDE_RATIO,
  AIRSTRIKE_MAX_BOMBS,
  AIRSTRIKE_MIN_BOMBS,
  AIRSTRIKE_MIN_RELEASE_GAP_TICKS,
  AIRSTRIKE_RELEASE_WINDOW_END,
  AIRSTRIKE_RELEASE_WINDOW_START,
  BOARD_HEIGHT,
  BOUNCE_FRICTION,
  BOUNCE_RESTITUTION,
  GRAVITY,
  MAX_SIM_TICKS,
  MIN_SPLIT_TICKS,
  POWER_TO_VELOCITY,
  SIM_DT,
  SPLIT_FRACTION,
  TANK_WIDTH,
  TRAJECTORY_SAMPLE_COUNT,
} from "./constants.js";
import { heightAt } from "./terrain.js";
import type { Point, ProjectileType, Terrain, WeaponDefinition } from "./types.js";

export interface ProjectileSimulationInput {
  startX: number;
  startY: number;
  angle: number; // degrees: 0 = flat toward +x, 90 = straight up, 180 = flat toward -x
  power: number; // 0-100
  wind: number; // signed horizontal acceleration
  terrain: Terrain;
  tankXs: number[]; // every tank's position, so a bounce weapon can detonate early on contact
  // Only meaningful for "airstrike" weapons — decided once per shot in combat.ts (so the same
  // values can also be recorded as TurnResolution.airstrikeFlight for the client's cosmetic
  // plane-pass rendering) rather than re-rolled independently here:
  airstrikeFromLeft?: boolean;
  airstrikeTotalTicks?: number;
  airstrikePlaneSpeed?: number;
}

export interface ProjectileSegment {
  impact: Point | null; // null if this segment left the board, or (a split's carrier) doesn't land at all
  path: Point[]; // full tick-by-tick path, used to derive a sampled trajectory
  startTick: number; // ticks into the overall shot's animation when this segment begins
}

interface TickLoopResult extends Omit<ProjectileSegment, "startTick"> {
  finalX: number;
  finalY: number;
  finalVx: number;
  finalVy: number;
  ticksRun: number; // equals maxTicks only if the loop completed without impact/leaving bounds
}

/**
 * Discrete-time ballistic simulation, stepped tick by tick (rather than a closed-form
 * solution) so collision against the heightmap is checked every tick and fast shots can't
 * tunnel through thin terrain features. Shared by the top-level parabolic simulator, a
 * split weapon's ascent-to-apex phase, and each of its fragments after the split.
 */
function runTickLoop(
  startX: number,
  startY: number,
  startVx: number,
  startVy: number,
  wind: number,
  terrain: Terrain,
  maxTicks: number,
  maxBounces = 0,
  tankXs: number[] = [],
): TickLoopResult {
  let x = startX;
  let y = startY;
  let vx = startVx;
  let vy = startVy;
  let bouncesUsed = 0;
  const path: Point[] = [{ x, y }];

  for (let tick = 0; tick < maxTicks; tick++) {
    vx += wind * SIM_DT;
    vy -= GRAVITY * SIM_DT;
    x += vx * SIM_DT;
    y += vy * SIM_DT;
    path.push({ x, y });

    if (x < 0 || x > terrain.width - 1) {
      return { impact: null, path, finalX: x, finalY: y, finalVx: vx, finalVy: vy, ticksRun: tick + 1 };
    }

    const groundHeight = heightAt(terrain, x);
    if (y <= groundHeight) {
      // A bounce that would otherwise skip past a tank detonates there instead — a shell
      // landing right on a tank shouldn't skip harmlessly over it just because bounces remain.
      const onTank = tankXs.some((tankX) => Math.abs(x - tankX) <= TANK_WIDTH / 2);
      if (bouncesUsed < maxBounces && !onTank) {
        // Reflect instead of stopping — snap to the surface first so repeated bounces don't
        // accumulate drift below ground, then lose some energy so it eventually settles.
        y = groundHeight;
        vy = -vy * BOUNCE_RESTITUTION;
        vx *= BOUNCE_FRICTION;
        path[path.length - 1] = { x, y };
        bouncesUsed++;
        continue;
      }
      const impact = { x, y: groundHeight };
      path[path.length - 1] = impact;
      return { impact, path, finalX: x, finalY: y, finalVx: vx, finalVy: vy, ticksRun: tick + 1 };
    }
  }

  return { impact: null, path, finalX: x, finalY: y, finalVx: vx, finalVy: vy, ticksRun: maxTicks };
}

export function simulateParabolic(input: ProjectileSimulationInput): ProjectileSegment[] {
  const angleRad = (input.angle * Math.PI) / 180;
  const speed = input.power * POWER_TO_VELOCITY;
  const result = runTickLoop(
    input.startX,
    input.startY,
    Math.cos(angleRad) * speed,
    Math.sin(angleRad) * speed,
    input.wind,
    input.terrain,
    MAX_SIM_TICKS,
  );
  return [{ impact: result.impact, path: result.path, startTick: 0 }];
}

/**
 * A shell that skips off terrain instead of detonating on first contact, losing some speed
 * each bounce (see BOUNCE_RESTITUTION/BOUNCE_FRICTION) until its bounce budget (`maxBounces`)
 * is used up, at which point the next terrain contact is a real impact. Still just one
 * continuous path with one final impact — the same shape `simulateParabolic` produces — so
 * nothing downstream (combat resolution, animation, replay) needs to know bouncing exists.
 */
export function simulateBounce(
  input: ProjectileSimulationInput,
  weapon: WeaponDefinition,
): ProjectileSegment[] {
  const angleRad = (input.angle * Math.PI) / 180;
  const speed = input.power * POWER_TO_VELOCITY;
  const result = runTickLoop(
    input.startX,
    input.startY,
    Math.cos(angleRad) * speed,
    Math.sin(angleRad) * speed,
    input.wind,
    input.terrain,
    MAX_SIM_TICKS,
    weapon.maxBounces ?? 2,
    input.tankXs,
  );
  return [{ impact: result.impact, path: result.path, startTick: 0 }];
}

/**
 * A weapon that splits mid-air into a pattern of independent fragments. Rather than splitting
 * at the trajectory's own physics apex (a point with no relation to where the shot is aimed —
 * for any real-distance shot it sits roughly above the midpoint between the two tanks, not
 * the target), the carrier first simulates its own undisturbed flight to learn how long it
 * would fly before hitting terrain or leaving the board, then splits shortly before that
 * (`SPLIT_FRACTION` of the way through) — so the burst always happens near wherever the shot
 * would have landed. Each point in the weapon's `splitPattern` becomes one fragment: we solve
 * for whatever initial velocity puts that fragment at its target (dx, dy) offset from the
 * split point at `splitRevealTicks` ticks later (continuous-kinematics approximation against
 * the discrete tick sim — close enough for the pattern to read correctly, not meant to be
 * pixel-exact), then let it fall normally from there. If the shot is short enough that
 * `MIN_SPLIT_TICKS` would exceed its natural flight (e.g. a point-blank shot), it never splits
 * at all — just a direct hit/miss, same as the underlying flight would have produced.
 */
export function simulateSplit(
  input: ProjectileSimulationInput,
  weapon: WeaponDefinition,
): ProjectileSegment[] {
  const angleRad = (input.angle * Math.PI) / 180;
  const speed = input.power * POWER_TO_VELOCITY;
  const vx0 = Math.cos(angleRad) * speed;
  const vy0 = Math.sin(angleRad) * speed;

  const naturalFlight = runTickLoop(input.startX, input.startY, vx0, vy0, input.wind, input.terrain, MAX_SIM_TICKS);
  const splitTick = Math.max(MIN_SPLIT_TICKS, Math.round(naturalFlight.ticksRun * SPLIT_FRACTION));
  const stopTick = Math.min(splitTick, MAX_SIM_TICKS);

  const ascent = runTickLoop(input.startX, input.startY, vx0, vy0, input.wind, input.terrain, stopTick);
  const carrierSegment: ProjectileSegment = { impact: ascent.impact, path: ascent.path, startTick: 0 };

  if (ascent.ticksRun < stopTick) {
    // The shot's natural flight was shorter than MIN_SPLIT_TICKS (e.g. point-blank) — no room
    // to split, so this is just the direct hit/miss the underlying flight would have produced.
    return [carrierSegment];
  }

  const pattern = weapon.splitPattern ?? [];
  const remainingTicks = MAX_SIM_TICKS - ascent.ticksRun;
  // "Positive pattern dx" means "continue the way the shell was already heading," not a
  // fixed screen direction — otherwise a leftward-fired shot would have fragments aimed at
  // fixed rightward points, which reads as flying backward.
  const directionSign = ascent.finalVx >= 0 ? 1 : -1;

  let fragments: ProjectileSegment[];
  if (weapon.splitMode === "drop") {
    // Spawn each fragment already at its target offset, at rest, and fall straight down —
    // deliberately unrealistic (wind ignored) so the whole pattern stays rigid while it falls.
    fragments = pattern.map((point): ProjectileSegment => {
      const result = runTickLoop(
        ascent.finalX + point.dx * directionSign,
        ascent.finalY + point.dy,
        0,
        0,
        0,
        input.terrain,
        remainingTicks,
      );
      return { impact: result.impact, path: result.path, startTick: ascent.ticksRun };
    });
  } else {
    const revealTicks = weapon.splitRevealTicks ?? 12;
    const tStar = revealTicks * SIM_DT;
    fragments = pattern.map((point): ProjectileSegment => {
      const fvx = (point.dx * directionSign - 0.5 * input.wind * tStar * tStar) / tStar;
      const fvy = (point.dy + 0.5 * GRAVITY * tStar * tStar) / tStar;
      const result = runTickLoop(ascent.finalX, ascent.finalY, fvx, fvy, input.wind, input.terrain, remainingTicks);
      return { impact: result.impact, path: result.path, startTick: ascent.ticksRun };
    });
  }

  return [carrierSegment, ...fragments];
}

/**
 * A self-cast weapon (heal/shield) never actually flies — it's applied directly to the
 * caster regardless of aim. Returns a degenerate segment landing right where the caster
 * stands: a 2-point identical path (so tickCount = 1, not 0, avoiding a 0/0 in the client's
 * per-tick animation-progress math) with an immediate impact.
 */
function simulateInstant(input: ProjectileSimulationInput): ProjectileSegment[] {
  const point = { x: input.startX, y: input.startY };
  return [{ impact: point, path: [point, point], startTick: 0 }];
}

/**
 * An unaimed strafing run: ignores angle/power/startX/startY entirely. fromLeft/totalTicks/
 * planeSpeed are decided once per shot by the caller (combat.ts) rather than rolled here, so
 * the same values can be recorded as cosmetic metadata for the client's plane-pass animation.
 * Drops a random number of bombs (AIRSTRIKE_MIN_BOMBS..AIRSTRIKE_MAX_BOMBS) one at a time,
 * each released at wherever the plane is at that moment (within the middle portion of its
 * pass, spaced apart by at least AIRSTRIKE_MIN_RELEASE_GAP_TICKS), then falls under real
 * gravity/wind while keeping the plane's own horizontal speed — a diagonal, physical drop,
 * not a rigid pattern spawned at rest.
 */
export function simulateAirstrike(input: ProjectileSimulationInput): ProjectileSegment[] {
  const fromLeft = input.airstrikeFromLeft ?? true;
  const planeSpeed = input.airstrikePlaneSpeed ?? 0;
  const totalTicks = input.airstrikeTotalTicks ?? 0;
  const directionSign = fromLeft ? 1 : -1;
  const edgeX = fromLeft ? 0 : input.terrain.width - 1;
  const altitude = AIRSTRIKE_ALTITUDE_RATIO * BOARD_HEIGHT;

  const bombCount =
    AIRSTRIKE_MIN_BOMBS + Math.floor(Math.random() * (AIRSTRIKE_MAX_BOMBS - AIRSTRIKE_MIN_BOMBS + 1));
  const windowStart = Math.round(totalTicks * AIRSTRIKE_RELEASE_WINDOW_START);
  const windowEnd = Math.round(totalTicks * AIRSTRIKE_RELEASE_WINDOW_END);

  const releaseTicks: number[] = [];
  let cursor = windowStart;
  for (let i = 0; i < bombCount && cursor <= windowEnd; i++) {
    releaseTicks.push(cursor);
    cursor += AIRSTRIKE_MIN_RELEASE_GAP_TICKS + Math.floor(Math.random() * AIRSTRIKE_MIN_RELEASE_GAP_TICKS);
  }

  return releaseTicks.map((releaseTick): ProjectileSegment => {
    const releaseX = edgeX + directionSign * planeSpeed * (releaseTick * SIM_DT);
    const vx = directionSign * planeSpeed;
    const result = runTickLoop(releaseX, altitude, vx, 0, input.wind, input.terrain, MAX_SIM_TICKS);
    return { impact: result.impact, path: result.path, startTick: releaseTick };
  });
}

const projectileSimulators: Record<
  ProjectileType,
  (input: ProjectileSimulationInput, weapon: WeaponDefinition) => ProjectileSegment[]
> = {
  parabolic: simulateParabolic,
  split: simulateSplit,
  bounce: simulateBounce,
  instant: simulateInstant,
  airstrike: simulateAirstrike,
};

export function simulateProjectile(
  weapon: WeaponDefinition,
  input: ProjectileSimulationInput,
): ProjectileSegment[] {
  const simulator = projectileSimulators[weapon.projectile];
  if (!simulator) {
    throw new Error(`No simulator registered for projectile type: ${weapon.projectile}`);
  }
  return simulator(input, weapon);
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
