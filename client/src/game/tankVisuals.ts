import { BARREL_LAUNCH_HEIGHT } from "@tancs/shared";

export interface TankVisual {
  bodyWidth: number;
  bodyHeight: number;
  cornerRadius: number;
  // 0 = square-ish corner (the original shape); >0 slices the front-top corner into a short
  // diagonal before rounding, for a sleeker/"slick" silhouette.
  frontSlope: number;
  turretRadius: number;
  barrelLength: number;
  barrelWidth: number;
}

// bodyHeight is deliberately kept below BARREL_LAUNCH_HEIGHT (14) for every class: the turret
// sits at a fixed height above the ground (matching where shots actually originate — see
// combat.ts's use of the same constant), so a body taller than that would swallow the turret
// into its own silhouette instead of the turret sitting on top of it. "Chunky" is conveyed via
// extra width/turret size/barrel thickness instead of extra height.
export const TANK_VISUALS: Record<string, TankVisual> = {
  standard: { bodyWidth: 24, bodyHeight: 12, cornerRadius: 3, frontSlope: 0, turretRadius: 6, barrelLength: 18, barrelWidth: 4 },
  glass_cannon: { bodyWidth: 26, bodyHeight: 8, cornerRadius: 2, frontSlope: 5, turretRadius: 5, barrelLength: 20, barrelWidth: 3 },
  juggernaut: { bodyWidth: 31, bodyHeight: 13, cornerRadius: 1, frontSlope: 0, turretRadius: 9, barrelLength: 16, barrelWidth: 6 },
};

export function getTankVisual(tankClass: string): TankVisual {
  return TANK_VISUALS[tankClass] ?? TANK_VISUALS.standard;
}

/**
 * Draws a tank's body+turret+barrel in plain screen-pixel space — no board-height/terrain
 * knowledge, so it works at any canvas scale. `groundScreenY` is just "the pixel row this
 * tank's belly sits on" in whatever canvas the caller set up: `TerrainCanvas` passes the real
 * toScreenY(groundHeight), while the buy-phase class preview just picks a fixed row near the
 * bottom of its small canvas. Shared by both so they're guaranteed to look identical — one
 * source of truth for each class's silhouette, not two hand-maintained drawings.
 */
export function drawTankBody(
  ctx: CanvasRenderingContext2D,
  sx: number,
  groundScreenY: number,
  tankClass: string,
  color: string,
  barrelAngleDeg: number,
): void {
  const v = getTankVisual(tankClass);
  const bodyY = groundScreenY - v.bodyHeight;
  const bodyX = sx - v.bodyWidth / 2;
  const r = v.cornerRadius;

  ctx.fillStyle = color;
  ctx.beginPath();
  if (v.frontSlope > 0) {
    // Front-top corner sliced into a short diagonal before the usual rounding, for a sleeker
    // wedge-nosed silhouette.
    ctx.moveTo(bodyX + r, bodyY);
    ctx.lineTo(bodyX + v.bodyWidth - v.frontSlope, bodyY);
    ctx.lineTo(bodyX + v.bodyWidth, bodyY + v.frontSlope);
    ctx.arcTo(bodyX + v.bodyWidth, bodyY + v.bodyHeight, bodyX, bodyY + v.bodyHeight, r);
    ctx.arcTo(bodyX, bodyY + v.bodyHeight, bodyX, bodyY, r);
    ctx.arcTo(bodyX, bodyY, bodyX + v.bodyWidth, bodyY, r);
  } else {
    ctx.moveTo(bodyX + r, bodyY);
    ctx.arcTo(bodyX + v.bodyWidth, bodyY, bodyX + v.bodyWidth, bodyY + v.bodyHeight, r);
    ctx.arcTo(bodyX + v.bodyWidth, bodyY + v.bodyHeight, bodyX, bodyY + v.bodyHeight, r);
    ctx.arcTo(bodyX, bodyY + v.bodyHeight, bodyX, bodyY, r);
    ctx.arcTo(bodyX, bodyY, bodyX + v.bodyWidth, bodyY, r);
  }
  ctx.closePath();
  ctx.fill();

  // Turret sits BARREL_LAUNCH_HEIGHT pixels above the ground row — reused as a plain pixel
  // offset (valid at any scale, since the game has no zoom: 1 board unit = 1 canvas pixel).
  const turretScreenY = groundScreenY - BARREL_LAUNCH_HEIGHT;
  ctx.beginPath();
  ctx.arc(sx, turretScreenY, v.turretRadius, 0, Math.PI * 2);
  ctx.fill();

  const angleRad = (barrelAngleDeg * Math.PI) / 180;
  const tipX = sx + Math.cos(angleRad) * v.barrelLength;
  const tipY = turretScreenY - Math.sin(angleRad) * v.barrelLength;
  ctx.strokeStyle = color;
  ctx.lineWidth = v.barrelWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, turretScreenY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
}
