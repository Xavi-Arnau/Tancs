export interface TankVisual {
  bodyWidth: number;
  bodyHeight: number;
  cornerRadius: number;
  // 0 = plain rounded rear/front (Standard); >0 = the whole front tapers to a point over this
  // many pixels, a full-height wedge nose (Glass Cannon) rather than just a shaved corner.
  frontSlope: number;
  // Juggernaut only: an extra, wider band drawn across the lower half of the hull, like a
  // visible side-armor skirt, instead of just a bigger version of the same rounded rect.
  skirt: boolean;
  turretRadius: number;
  barrelLength: number;
  barrelWidth: number;
}

export const TANK_VISUALS: Record<string, TankVisual> = {
  standard: { bodyWidth: 24, bodyHeight: 12, cornerRadius: 3, frontSlope: 0, skirt: false, turretRadius: 6, barrelLength: 18, barrelWidth: 4 },
  glass_cannon: { bodyWidth: 28, bodyHeight: 8, cornerRadius: 2, frontSlope: 10, skirt: false, turretRadius: 5, barrelLength: 20, barrelWidth: 3 },
  juggernaut: { bodyWidth: 30, bodyHeight: 13, cornerRadius: 2, frontSlope: 0, skirt: true, turretRadius: 8, barrelLength: 16, barrelWidth: 6 },
};

export function getTankVisual(tankClass: string): TankVisual {
  return TANK_VISUALS[tankClass] ?? TANK_VISUALS.standard;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixToward(rgb: [number, number, number], target: [number, number, number], t: number): [number, number, number] {
  return [rgb[0] + (target[0] - rgb[0]) * t, rgb[1] + (target[1] - rgb[1]) * t, rgb[2] + (target[2] - rgb[2]) * t];
}

function rgbStr([r, g, b]: [number, number, number], alpha = 1): string {
  return `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},${alpha})`;
}

/** Traces the hull silhouette path (rear rounded, front either rounded-square or a tapered
 * wedge nose) — shared by the fill and by callers that need the outline. Local, "facing right"
 * coordinates; the caller handles mirroring for facing. */
function traceHullPath(ctx: CanvasRenderingContext2D, bodyX: number, bodyY: number, v: TankVisual) {
  const r = v.cornerRadius;
  ctx.beginPath();
  if (v.frontSlope > 0) {
    ctx.moveTo(bodyX + r, bodyY);
    ctx.lineTo(bodyX + v.bodyWidth - v.frontSlope, bodyY);
    ctx.lineTo(bodyX + v.bodyWidth, bodyY + v.bodyHeight / 2);
    ctx.lineTo(bodyX + v.bodyWidth - v.frontSlope, bodyY + v.bodyHeight);
    ctx.lineTo(bodyX + r, bodyY + v.bodyHeight);
    ctx.arcTo(bodyX, bodyY + v.bodyHeight, bodyX, bodyY, r);
    ctx.arcTo(bodyX, bodyY, bodyX + r, bodyY, r);
  } else {
    ctx.moveTo(bodyX + r, bodyY);
    ctx.arcTo(bodyX + v.bodyWidth, bodyY, bodyX + v.bodyWidth, bodyY + v.bodyHeight, r);
    ctx.arcTo(bodyX + v.bodyWidth, bodyY + v.bodyHeight, bodyX, bodyY + v.bodyHeight, r);
    ctx.arcTo(bodyX, bodyY + v.bodyHeight, bodyX, bodyY, r);
    ctx.arcTo(bodyX, bodyY, bodyX + v.bodyWidth, bodyY, r);
  }
  ctx.closePath();
}

/** The dark track band along the bottom of the hull, sticking out slightly past the body on
 * each side, with a few small road-wheel dots — the single biggest visual cue that reads as
 * "tank" instead of "rounded box." */
function drawTracks(ctx: CanvasRenderingContext2D, bodyX: number, bodyY: number, v: TankVisual) {
  const overhang = 3;
  const trackHeight = 4;
  const trackY = bodyY + v.bodyHeight - 2;
  const trackX = bodyX - overhang;
  const trackWidth = v.bodyWidth + overhang * 2;

  ctx.fillStyle = "#20242c";
  ctx.beginPath();
  ctx.roundRect(trackX, trackY, trackWidth, trackHeight, 1.5);
  ctx.fill();

  ctx.fillStyle = "#3a4150";
  const wheelCount = Math.max(3, Math.round(v.bodyWidth / 8));
  for (let i = 0; i < wheelCount; i++) {
    const wx = trackX + 3 + (i * (trackWidth - 6)) / (wheelCount - 1 || 1);
    ctx.beginPath();
    ctx.arc(wx, trackY + trackHeight / 2, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws a tank's body+turret+barrel in plain screen-pixel space — no board-height/terrain
 * knowledge, so it works at any canvas scale. `groundScreenY` is just "the pixel row this
 * tank's belly sits on" in whatever canvas the caller set up: `TerrainCanvas` passes the real
 * toScreenY(groundHeight), while the buy-phase class preview just picks a fixed row near the
 * bottom of its small canvas. Shared by both so they're guaranteed to look identical — one
 * source of truth for each class's silhouette, not two hand-maintained drawings.
 *
 * `facingRight` mirrors the hull's asymmetric features (currently just the wedge nose) so it
 * always points toward the enemy side rather than a fixed screen direction — it does NOT affect
 * the barrel, which always points at the real `barrelAngleDeg` regardless of hull facing.
 */
export function drawTankBody(
  ctx: CanvasRenderingContext2D,
  sx: number,
  groundScreenY: number,
  tankClass: string,
  color: string,
  barrelAngleDeg: number,
  facingRight = true,
): void {
  const v = getTankVisual(tankClass);
  const bodyY = groundScreenY - v.bodyHeight;
  const bodyX = sx - v.bodyWidth / 2;
  const baseRgb = hexToRgb(color);
  const lightRgb = mixToward(baseRgb, [255, 255, 255], 0.28);
  const darkRgb = mixToward(baseRgb, [0, 0, 0], 0.32);

  ctx.save();
  ctx.translate(sx, 0);
  ctx.scale(facingRight ? 1 : -1, 1);
  ctx.translate(-sx, 0);

  drawTracks(ctx, bodyX, bodyY, v);

  if (v.skirt) {
    // A wider, shorter band across the lower half of the hull — a visible side-armor skirt,
    // rather than just a bigger version of the same shape.
    const skirtHeight = v.bodyHeight * 0.55;
    const skirtY = bodyY + v.bodyHeight - skirtHeight;
    const skirtOverhang = 3;
    ctx.fillStyle = rgbStr(darkRgb);
    ctx.beginPath();
    ctx.roundRect(bodyX - skirtOverhang, skirtY, v.bodyWidth + skirtOverhang * 2, skirtHeight, 1.5);
    ctx.fill();
  }

  const gradient = ctx.createLinearGradient(0, bodyY, 0, bodyY + v.bodyHeight);
  gradient.addColorStop(0, rgbStr(lightRgb));
  gradient.addColorStop(1, rgbStr(darkRgb));
  traceHullPath(ctx, bodyX, bodyY, v);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = rgbStr(darkRgb, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();

  // Turret sits a proportional amount above this class's OWN body top — not a fixed absolute
  // height — so it always looks perched on the hull instead of floating above a short body or
  // sinking into a tall one. Drawn in true (unmirrored) coordinates: a turret is round, facing
  // doesn't matter, and the barrel below it must stay at its real screen-space angle.
  const turretScreenY = bodyY - v.turretRadius / 3;
  const turretGradient = ctx.createRadialGradient(
    sx - v.turretRadius * 0.3,
    turretScreenY - v.turretRadius * 0.3,
    0,
    sx,
    turretScreenY,
    v.turretRadius,
  );
  turretGradient.addColorStop(0, rgbStr(lightRgb));
  turretGradient.addColorStop(1, rgbStr(baseRgb));
  ctx.beginPath();
  ctx.arc(sx, turretScreenY, v.turretRadius, 0, Math.PI * 2);
  ctx.fillStyle = turretGradient;
  ctx.fill();
  ctx.strokeStyle = rgbStr(darkRgb, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();

  const angleRad = (barrelAngleDeg * Math.PI) / 180;
  const tipX = sx + Math.cos(angleRad) * v.barrelLength;
  const tipY = turretScreenY - Math.sin(angleRad) * v.barrelLength;
  ctx.strokeStyle = rgbStr(baseRgb);
  ctx.lineWidth = v.barrelWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, turretScreenY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Small darker muzzle cap at the tip, for a touch of detail.
  ctx.beginPath();
  ctx.arc(tipX, tipY, v.barrelWidth * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = rgbStr(darkRgb);
  ctx.fill();
}
