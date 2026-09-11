import {
  BARREL_LAUNCH_HEIGHT,
  BOARD_HEIGHT,
  heightAt,
  TANK_WIDTH,
  type PlayerState,
  type Point,
  type Terrain,
} from "@tancs/shared";
import { useEffect, useRef } from "react";

const PLAYER_COLORS: [string, string] = ["#e5484d", "#3b82f6"]; // slot 0 red, slot 1 blue
const SHOT_DURATION_MS = 1400;

export interface ActiveShot {
  preImpactTerrain: Terrain;
  trajectory: Point[];
  actingSlot: 0 | 1;
  angle: number;
  onComplete: () => void;
}

interface Props {
  terrain: Terrain;
  players: PlayerState[];
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

function pointAtProgress(trajectory: Point[], progress: number): Point {
  const idx = progress * (trajectory.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(trajectory.length - 1, lo + 1);
  const t = idx - lo;
  const a = trajectory[lo];
  const b = trajectory[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export default function TerrainCanvas({ terrain, players, aim, activeShot }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest props, readable from inside the animation loop without being its effect
  // dependencies — a shot's rAF loop should only start/stop when the shot itself
  // changes, not restart every time an unrelated background poll hands us a new
  // (but equivalent) terrain/players object reference mid-flight.
  const terrainRef = useRef(terrain);
  const playersRef = useRef(players);
  const aimRef = useRef(aim);
  terrainRef.current = terrain;
  playersRef.current = players;
  aimRef.current = aim;

  function renderScene(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    progress: number,
    shot: ActiveShot | null | undefined,
  ) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#bfe3f5");
    sky.addColorStop(1, "#eaf6fb");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderTerrain = shot && progress < 1 ? shot.preImpactTerrain : terrainRef.current;
    drawTerrain(ctx, renderTerrain);

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
      const p = pointAtProgress(shot.trajectory, progress);
      ctx.beginPath();
      ctx.arc(p.x, toScreenY(p.y), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a1a";
      ctx.fill();

      for (let i = 1; i <= 4; i++) {
        const trailProgress = Math.max(0, progress - i * 0.02);
        const tp = pointAtProgress(shot.trajectory, trailProgress);
        ctx.beginPath();
        ctx.arc(tp.x, toScreenY(tp.y), 3 - i * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(26,26,26,${0.4 - i * 0.08})`;
        ctx.fill();
      }

      if (progress >= 1) {
        const [ix, iy] = [p.x, toScreenY(p.y)];
        const burst = ctx.createRadialGradient(ix, iy, 0, ix, iy, 20);
        burst.addColorStop(0, "rgba(255,200,80,0.9)");
        burst.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = burst;
        ctx.beginPath();
        ctx.arc(ix, iy, 20, 0, Math.PI * 2);
        ctx.fill();
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
      renderScene(ctx, canvas, 1, null);
      return;
    }

    let rafId: number;
    let startTime: number | null = null;

    function tick(now: number) {
      if (!canvas || !ctx) return;
      if (startTime === null) startTime = now;
      const progress = Math.min(1, (now - startTime) / SHOT_DURATION_MS);
      renderScene(ctx, canvas, progress, activeShot);
      if (progress < 1) {
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
    renderScene(ctx, canvas, 1, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, players, aim, activeShot]);

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
