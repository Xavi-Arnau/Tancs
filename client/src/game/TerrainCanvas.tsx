import {
  BARREL_LAUNCH_HEIGHT,
  BOARD_HEIGHT,
  heightAt,
  TANK_WIDTH,
  type HazardZone,
  type PlayerState,
  type Point,
  type Terrain,
  type TerrainDiffEntry,
} from "@tancs/shared";
import { useEffect, useRef } from "react";

const PLAYER_COLORS: [string, string] = ["#e5484d", "#3b82f6"]; // slot 0 red, slot 1 blue
const MS_PER_TICK = 1000 / 60; // real-time-ish playback speed, independent of the physics tick rate
const BURST_FADE_MS = 350;
const POPUP_DURATION_MS = 900;

export interface ActiveShotProjectile {
  trajectory: Point[];
  tickCount: number;
  startTick: number;
  impact: Point | null;
  terrainDiff: TerrainDiffEntry[];
}

export interface DamagePopup {
  slot: 0 | 1;
  amount: number;
  triggerTick: number;
  source: "hazard" | "shot";
}

export interface ActiveShot {
  preImpactTerrain: Terrain;
  projectiles: ActiveShotProjectile[];
  actingSlot: 0 | 1;
  angle: number;
  projectileStyle?: string; // e.g. "flame" — one value for the whole shot, same weapon throughout
  damagePopups?: DamagePopup[];
  onComplete: () => void;
}

interface Props {
  terrain: Terrain;
  players: PlayerState[];
  hazards?: HazardZone[];
  aim?: { slot: 0 | 1; angle: number } | null;
  activeShot?: ActiveShot | null;
}

function toScreenY(y: number): number {
  return BOARD_HEIGHT - y;
}

function drawTerrain(ctx: CanvasRenderingContext2D, terrain: Terrain) {
  const { width, heights } = terrain;
  ctx.beginPath();
  ctx.moveTo(0, BOARD_HEIGHT);
  for (let x = 0; x < width; x++) {
    ctx.lineTo(x, toScreenY(heights[x]));
  }
  ctx.lineTo(width - 1, BOARD_HEIGHT);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, toScreenY(BOARD_HEIGHT * 0.6), 0, BOARD_HEIGHT);
  gradient.addColorStop(0, "#8a6a3f");
  gradient.addColorStop(1, "#5c4426");
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, toScreenY(heights[0]));
  for (let x = 1; x < width; x++) {
    ctx.lineTo(x, toScreenY(heights[x]));
  }
  ctx.strokeStyle = "#3f7d3a";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawHazards(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  hazards: HazardZone[],
  elapsedMs: number,
) {
  for (const zone of hazards) {
    const startCol = Math.max(0, Math.min(terrain.width - 1, Math.round(zone.startX)));
    const endCol = Math.max(0, Math.min(terrain.width - 1, Math.round(zone.endX)));
    if (endCol <= startCol) continue;
    const pulse = 0.55 + 0.25 * Math.sin(elapsedMs * 0.004 + zone.startX);

    ctx.beginPath();
    ctx.moveTo(startCol, toScreenY(terrain.heights[startCol]) + 5);
    for (let x = startCol; x <= endCol; x++) {
      ctx.lineTo(x, toScreenY(terrain.heights[x]));
    }
    ctx.lineTo(endCol, toScreenY(terrain.heights[endCol]) + 5);
    ctx.closePath();
    const grad = ctx.createLinearGradient(
      0,
      toScreenY(terrain.heights[startCol]),
      0,
      toScreenY(terrain.heights[startCol]) + 5,
    );
    grad.addColorStop(0, `rgba(255,150,30,${pulse})`);
    grad.addColorStop(1, `rgba(170,30,10,${pulse * 0.8})`);
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  player: PlayerState,
  color: string,
  barrelAngleDeg: number | null,
) {
  const groundY = heightAt(terrain, player.tankX);
  const [sx, sy] = [player.tankX, toScreenY(groundY)];
  const bodyW = TANK_WIDTH;
  const bodyH = 12;

  ctx.fillStyle = color;
  const bodyX = sx - bodyW / 2;
  const bodyY = sy - bodyH;
  const r = 3;
  ctx.beginPath();
  ctx.moveTo(bodyX + r, bodyY);
  ctx.arcTo(bodyX + bodyW, bodyY, bodyX + bodyW, bodyY + bodyH, r);
  ctx.arcTo(bodyX + bodyW, bodyY + bodyH, bodyX, bodyY + bodyH, r);
  ctx.arcTo(bodyX, bodyY + bodyH, bodyX, bodyY, r);
  ctx.arcTo(bodyX, bodyY, bodyX + bodyW, bodyY, r);
  ctx.closePath();
  ctx.fill();

  const turretY = groundY + BARREL_LAUNCH_HEIGHT;
  ctx.beginPath();
  ctx.arc(sx, toScreenY(turretY), 6, 0, Math.PI * 2);
  ctx.fill();

  const angle = barrelAngleDeg ?? 90;
  const angleRad = (angle * Math.PI) / 180;
  const barrelLength = 18;
  const tipX = sx + Math.cos(angleRad) * barrelLength;
  const tipY = turretY + Math.sin(angleRad) * barrelLength;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, toScreenY(turretY));
  ctx.lineTo(tipX, toScreenY(tipY));
  ctx.stroke();

  ctx.fillStyle = "#111";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.max(0, Math.round(player.hp))} HP`, sx, sy + 16);
}

function drawDamagePopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  amount: number,
  progress: number,
  source: "hazard" | "shot",
) {
  const alpha = 1 - progress;
  const y = toScreenY(groundY + 26 + progress * 20);
  const [r, g, b] = source === "hazard" ? [234, 88, 12] : [220, 38, 38]; // ember orange vs shot red
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.strokeText(`-${amount}`, x, y);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillText(`-${amount}`, x, y);
}

function pointAtProgress(trajectory: Point[], progress: number): Point {
  const idx = progress * (trajectory.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(trajectory.length - 1, lo + 1);
  const t = idx - lo;
  const a = trajectory[lo];
  const b = trajectory[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, elapsedMs: number, alpha = 1) {
  const flicker = 1 + Math.sin(elapsedMs * 0.03 + x) * 0.15;
  const r = 6 * flicker;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(255,247,214,${alpha})`);
  grad.addColorStop(0.45, `rgba(251,191,36,${0.9 * alpha})`);
  grad.addColorStop(0.8, `rgba(249,115,22,${0.6 * alpha})`);
  grad.addColorStop(1, "rgba(239,68,68,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y - r * 0.3, r * 0.7, r, 0, 0, Math.PI * 2);
  ctx.fill();
}

function terrainWithDiffs(base: Terrain, diffLists: TerrainDiffEntry[][]): Terrain {
  const heights = base.heights.slice();
  for (const diffs of diffLists) {
    for (const d of diffs) heights[d.x] = d.newHeight;
  }
  return { width: base.width, heights };
}

export default function TerrainCanvas({ terrain, players, hazards, aim, activeShot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest props, readable from inside the animation loop without being its effect
  // dependencies — a shot's rAF loop should only start/stop when the shot itself
  // changes, not restart every time an unrelated background poll hands us a new
  // (but equivalent) terrain/players object reference mid-flight.
  const terrainRef = useRef(terrain);
  const playersRef = useRef(players);
  const hazardsRef = useRef(hazards);
  const aimRef = useRef(aim);
  terrainRef.current = terrain;
  playersRef.current = players;
  hazardsRef.current = hazards;
  aimRef.current = aim;

  function renderScene(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    elapsedMs: number,
    shot: ActiveShot | null | undefined,
  ) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#bfe3f5");
    sky.addColorStop(1, "#eaf6fb");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const elapsedTicks = elapsedMs / MS_PER_TICK;

    const landedDiffs: TerrainDiffEntry[][] = [];
    if (shot) {
      for (const p of shot.projectiles) {
        const endTick = p.startTick + p.tickCount;
        if (elapsedTicks >= endTick && p.impact) landedDiffs.push(p.terrainDiff);
      }
    }
    const renderTerrain = shot ? terrainWithDiffs(shot.preImpactTerrain, landedDiffs) : terrainRef.current;
    drawTerrain(ctx, renderTerrain);
    if (hazardsRef.current?.length) drawHazards(ctx, renderTerrain, hazardsRef.current, elapsedMs);

    for (const player of playersRef.current) {
      const isActingTank = shot?.actingSlot === player.slot;
      const isAiming = aimRef.current?.slot === player.slot;
      const barrelAngle = isActingTank
        ? shot!.angle
        : isAiming
          ? aimRef.current!.angle
          : player.lastAngle;
      drawTank(ctx, renderTerrain, player, PLAYER_COLORS[player.slot], barrelAngle);
    }

    if (shot) {
      for (const p of shot.projectiles) {
        const endTick = p.startTick + p.tickCount;
        if (elapsedTicks < p.startTick) continue; // hasn't launched yet

        const localProgress = Math.min(1, (elapsedTicks - p.startTick) / p.tickCount);
        const point = pointAtProgress(p.trajectory, localProgress);

        if (localProgress < 1) {
          const screenX = point.x;
          const screenY = toScreenY(point.y);

          if (shot.projectileStyle === "flame") {
            for (let i = 4; i >= 1; i--) {
              const trailProgress = Math.max(0, localProgress - i * 0.025);
              const tp = pointAtProgress(p.trajectory, trailProgress);
              drawFlame(ctx, tp.x, toScreenY(tp.y), elapsedMs, 1 - i * 0.2);
            }
            drawFlame(ctx, screenX, screenY, elapsedMs);
          } else {
            ctx.beginPath();
            ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#1a1a1a";
            ctx.fill();

            for (let i = 1; i <= 4; i++) {
              const trailProgress = Math.max(0, localProgress - i * 0.02);
              const tp = pointAtProgress(p.trajectory, trailProgress);
              ctx.beginPath();
              ctx.arc(tp.x, toScreenY(tp.y), 3 - i * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(26,26,26,${0.4 - i * 0.08})`;
              ctx.fill();
            }
          }
        } else if (p.impact) {
          const msSinceLanding = elapsedMs - endTick * MS_PER_TICK;
          if (msSinceLanding < BURST_FADE_MS) {
            const alpha = 0.9 * (1 - msSinceLanding / BURST_FADE_MS);
            const [ix, iy] = [point.x, toScreenY(point.y)];
            const burst = ctx.createRadialGradient(ix, iy, 0, ix, iy, 20);
            burst.addColorStop(0, `rgba(255,200,80,${alpha})`);
            burst.addColorStop(1, "rgba(255,200,80,0)");
            ctx.fillStyle = burst;
            ctx.beginPath();
            ctx.arc(ix, iy, 20, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      for (const popup of shot.damagePopups ?? []) {
        if (elapsedTicks < popup.triggerTick) continue;
        const msSinceTrigger = elapsedMs - popup.triggerTick * MS_PER_TICK;
        if (msSinceTrigger >= POPUP_DURATION_MS) continue;
        const player = playersRef.current.find((p) => p.slot === popup.slot);
        if (!player) continue;
        const groundY = heightAt(renderTerrain, player.tankX);
        drawDamagePopup(
          ctx,
          player.tankX,
          groundY,
          popup.amount,
          msSinceTrigger / POPUP_DURATION_MS,
          popup.source,
        );
      }
    }
  }

  // Owns the shot animation loop. Depends only on `activeShot`'s identity, so it starts
  // exactly once per shot and runs to completion undisturbed by unrelated prop updates
  // (e.g. a background poll refreshing `terrain`/`players` mid-flight).
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (!activeShot) {
      renderScene(ctx, canvas, 0, null);
      return;
    }

    const maxEndTick = Math.max(
      ...activeShot.projectiles.map((p) => p.startTick + p.tickCount),
      ...(activeShot.damagePopups ?? []).map(
        (p) => p.triggerTick + POPUP_DURATION_MS / MS_PER_TICK,
      ),
    );
    let rafId: number;
    let startTime: number | null = null;

    function tick(now: number) {
      if (!canvas || !ctx) return;
      if (startTime === null) startTime = now;
      const elapsedMs = now - startTime;
      renderScene(ctx, canvas, elapsedMs, activeShot);
      if (elapsedMs / MS_PER_TICK < maxEndTick) {
        rafId = requestAnimationFrame(tick);
      } else {
        activeShot!.onComplete();
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeShot]);

  // Idle-state redraw (e.g. live aim-preview angle changes) — only paints while no shot
  // is animating; the effect above owns painting during an active shot.
  useEffect(() => {
    if (activeShot) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    renderScene(ctx, canvas, 0, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, players, hazards, aim, activeShot]);

  return (
    <canvas
      ref={canvasRef}
      width={terrain.width}
      height={BOARD_HEIGHT}
      className="w-full rounded-lg border shadow-sm"
      style={{ aspectRatio: `${terrain.width} / ${BOARD_HEIGHT}` }}
    />
  );
}
