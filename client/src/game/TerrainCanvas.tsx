import {
  AIRSTRIKE_ALTITUDE_RATIO,
  BOARD_HEIGHT,
  heightAt,
  type HazardZone,
  type PlayerState,
  type Point,
  type StatusInflictedEntry,
  type Terrain,
  type TerrainDiffEntry,
  type TurnResolution,
} from "@tancs/shared";
import { useEffect, useRef } from "react";
import type { SoundCue } from "./shotAnimation";
import {
  playAcidForm,
  playBalloonLand,
  playBalloonLaunch,
  playBombImpact,
  playBombRelease,
  playCorrodeHiss,
  playCrackle,
  playEngineDrone,
  playHeartBloom,
  playIgnite,
  playImpact,
  playLaunch,
  playLavaForm,
  playSizzle,
} from "./sfx";
import { drawTankBody, getTankVisual } from "./tankVisuals";

function playSoundCue(kind: SoundCue["kind"]): void {
  switch (kind) {
    case "burnTick":
      playCrackle();
      break;
    case "hazardTick":
      playSizzle();
      break;
    case "hazardFormedLava":
      playLavaForm();
      break;
    case "hazardFormedAcid":
      playAcidForm();
      break;
    case "burningInflicted":
      playIgnite();
      break;
    case "corrodedInflicted":
      playCorrodeHiss();
      break;
    case "heartBloom":
      playHeartBloom();
      break;
    case "balloonLaunch":
      playBalloonLaunch();
      break;
    case "balloonLand":
      playBalloonLand();
      break;
  }
}

const PLAYER_COLORS: [string, string] = ["#e5484d", "#3b82f6"]; // slot 0 red, slot 1 blue
const MS_PER_TICK = 1000 / 60; // real-time-ish playback speed, independent of the physics tick rate
const BURST_FADE_MS = 350;
const POPUP_DURATION_MS = 900;
const CAPTION_DURATION_MS = 1300;
// A projectile-less shot (the start-of-turn tick preview) has nothing to time its length off
// of, so it gets this minimum duration instead — long enough for its captions to be readable.
const MIN_TICK_ONLY_DURATION_TICKS = 70;
// How high (board units) a Balloon-lifted tank rises above its ground position at the peak of
// its drift — comfortably clear of typical terrain relief, tuned live like everything else.
const BALLOON_LIFT_HEIGHT = 130;

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
  source: "hazard" | "shot" | "heal";
}

export interface Caption {
  triggerTick: number;
  text: string;
}

export interface ActiveShot {
  preImpactTerrain: Terrain;
  projectiles: ActiveShotProjectile[];
  actingSlot: 0 | 1;
  angle: number;
  // A start-of-turn tick preview (see BattleView): no projectile ever flies, and
  // preImpactTerrain/preImpactHazards/preImpactPlayers are already the tick's own FINAL output
  // (there's nothing further to reveal mid-animation, unlike a fired shot's reveal-until-landed
  // hazard zone/status) — rendered as-is for the whole preview instead of being decayed/gated.
  isTickOnly?: boolean;
  projectileStyle?: string; // e.g. "flame" — one value for the whole shot, same weapon throughout
  projectileColor?: string; // hex tint for the dot+trail while in flight (non-flame styles only)
  damagePopups?: DamagePopup[];
  captions?: Caption[];
  preImpactHazards?: HazardZone[];
  hazardZoneCreated?: HazardZone | null;
  preImpactPlayers?: PlayerState[];
  selfEffect?: TurnResolution["selfEffect"];
  statusInflicted?: StatusInflictedEntry[];
  soundCues?: SoundCue[];
  // Cosmetic mid-shot horizontal reposition for a "Balloon"-type self-effect — no other
  // mechanism in this file animates a tank's X, so renderScene/drawTank must explicitly
  // consult this (via resolveSelfMove) instead of the player's own fixed pre/post-shot tankX.
  selfMove?: { playerId: string; fromX: number; toX: number; startTick: number; tickCount: number } | null;
  // Cosmetic full-map plane pass for an "airstrike" weapon — independent of any individual
  // bomb's own trajectory/timing (see drawAirplane's call site in renderScene).
  airstrikeFlight?: { fromLeft: boolean; totalTicks: number; startTick: number } | null;
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

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mixToward(rgb: [number, number, number], target: [number, number, number], t: number): [number, number, number] {
  return [rgb[0] + (target[0] - rgb[0]) * t, rgb[1] + (target[1] - rgb[1]) * t, rgb[2] + (target[2] - rgb[2]) * t];
}

// A persistent hazard is rendered as a coating on the CURRENT ground, not a simulated liquid
// with volume — it only ever depends on the terrain height directly beneath it, so it can
// never balloon in size regardless of terrain shape, and growth (Vat of Acid) needs no special
// handling: it's just a wider span of the same coating. It's drawn as a STROKED ribbon along
// the terrain's own contour (not a filled vertical band): a canvas stroke's lineWidth applies
// perpendicular to the path's local direction rather than vertically, so the coating keeps a
// constant visual thickness even where the ground itself is steep or near-vertical (a crater
// wall, a jagged peak) — a vertical-offset fill would stretch into a long thin sliver there.
const HAZARD_COATING_THICKNESS = 14;

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
    const pulse = 0.75 + 0.15 * Math.sin(elapsedMs * 0.004 + zone.startX);
    // Derived from the creating weapon's own color, so each hazard type (lava, acid, ...)
    // renders distinctly without any per-weapon special-casing here.
    const baseRgb = hexToRgb(zone.color ?? "#c2410c");
    const rgbFill = mixToward(baseRgb, [0, 0, 0], 0.15);
    const rgbSheen = mixToward(baseRgb, [255, 255, 255], 0.5);

    // A slight animated ripple along the ground contour so it reads as a viscous/molten
    // surface rather than a rigid painted line.
    const surfaceHeightAt = (x: number) =>
      terrain.heights[x] + Math.sin(x * 0.15 + elapsedMs * 0.002 + zone.startX) * 2;

    ctx.beginPath();
    ctx.moveTo(startCol, toScreenY(surfaceHeightAt(startCol)));
    for (let x = startCol; x <= endCol; x++) ctx.lineTo(x, toScreenY(surfaceHeightAt(x)));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.strokeStyle = `rgba(${rgbFill[0]},${rgbFill[1]},${rgbFill[2]},${pulse * 0.85})`;
    ctx.lineWidth = HAZARD_COATING_THICKNESS;
    ctx.stroke();

    // A thinner, brighter sheen stroked on top of the same path for a bit of shine.
    ctx.strokeStyle = `rgba(${rgbSheen[0]},${rgbSheen[1]},${rgbSheen[2]},${pulse * 0.8})`;
    ctx.lineWidth = HAZARD_COATING_THICKNESS * 0.35;
    ctx.stroke();
  }
}

/** A pulsing force-field bubble around the whole tank — drawn last, on top, translucent, so
 * the tank reads as "inside" it rather than just glowing. */
function drawShieldBubble(ctx: CanvasRenderingContext2D, sx: number, centerY: number, elapsedMs: number) {
  const pulse = 0.7 + 0.15 * Math.sin(elapsedMs * 0.006 + sx);
  const r = 24;
  ctx.beginPath();
  ctx.arc(sx, centerY, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(56,189,248,${0.18 * pulse})`;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(125,211,252,${0.8 * pulse})`;
  ctx.stroke();
  // A small glassy highlight so it reads as a bubble, not a flat disc.
  ctx.beginPath();
  ctx.arc(sx - r * 0.35, centerY - r * 0.4, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.3 * pulse})`;
  ctx.fill();
}

/** A static angular ice crystal encasing the whole tank — visually distinct in shape (angular,
 * not round) and color from the shield bubble. */
function drawIceCrystal(ctx: CanvasRenderingContext2D, sx: number, centerY: number) {
  const rx = 20;
  const ry = 27;
  const points = [
    { x: sx, y: centerY - ry },
    { x: sx + rx, y: centerY - ry * 0.3 },
    { x: sx + rx * 0.65, y: centerY + ry * 0.65 },
    { x: sx, y: centerY + ry },
    { x: sx - rx * 0.65, y: centerY + ry * 0.65 },
    { x: sx - rx, y: centerY - ry * 0.3 },
  ];
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(191,238,254,0.3)";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(224,242,254,0.9)";
  ctx.stroke();

  // Thin facet lines from the center to each vertex, for a crystalline look.
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(224,242,254,0.55)";
  ctx.beginPath();
  for (const p of points) {
    ctx.moveTo(sx, centerY);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

/** A ring of small flames engulfing the whole tank — same "surrounding the tank" language as
 * the shield bubble and ice crystal, reusing the existing drawFlame helper (built for Love Is
 * Pain's own projectile trail) at several points around the body, each phase-offset so they
 * flicker independently instead of pulsing in lockstep. */
function drawBurningAura(ctx: CanvasRenderingContext2D, sx: number, centerY: number, elapsedMs: number) {
  const positions = [
    { dx: 0, dy: -22 },
    { dx: 17, dy: -8 },
    { dx: -17, dy: -8 },
    { dx: 11, dy: 15 },
    { dx: -11, dy: 15 },
  ];
  positions.forEach((p, i) => {
    drawFlame(ctx, sx + p.dx, centerY + p.dy, elapsedMs + i * 130, 0.85);
  });
}

/** A handful of small fizzing bubbles rising around the tank — same "surrounding the tank"
 * language as the shield bubble/ice crystal/burning aura, but bubble-shaped and in a sickly
 * green distinct from Vat of Acid's own pool color, so it reads as a status effect on the tank
 * rather than more of the terrain coating. */
function drawCorrosion(ctx: CanvasRenderingContext2D, sx: number, centerY: number, elapsedMs: number) {
  const positions = [
    { dx: -14, dy: 6, phase: 0 },
    { dx: 13, dy: 10, phase: 240 },
    { dx: -6, dy: -18, phase: 480 },
    { dx: 9, dy: -14, phase: 720 },
  ];
  for (const p of positions) {
    // Each bubble rises and fades on its own ~1.6s cycle, staggered by phase.
    const t = ((elapsedMs + p.phase) % 1600) / 1600;
    const rise = t * 22;
    const alpha = Math.sin(t * Math.PI) * 0.7;
    const r = 2 + t * 2.5;
    ctx.beginPath();
    ctx.arc(sx + p.dx, centerY + p.dy - rise, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(163,230,53,${alpha})`;
    ctx.fill();
  }
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  player: PlayerState,
  color: string,
  barrelAngleDeg: number | null,
  elapsedMs: number,
  tankX: number = player.tankX,
  lift = 0, // board units added to ground height — a Balloon-lifted tank rides above its actual ground contact point
) {
  const groundY = heightAt(terrain, tankX) + lift;
  const [sx, sy] = [tankX, toScreenY(groundY)];

  drawTankBody(ctx, sx, sy, player.tankClass, color, barrelAngleDeg ?? 90, player.slot === 0);

  ctx.fillStyle = "#111";
  ctx.font = "bold 10px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.max(0, Math.round(player.hp))} HP`, sx, sy + 16);

  // Drawn last, on top, translucent — so the tank reads as "inside" the effect.
  const bodyY = sy - getTankVisual(player.tankClass).bodyHeight;
  const centerY = bodyY + 2;
  if (player.shield) drawShieldBubble(ctx, sx, centerY, elapsedMs);
  if (player.frozen) drawIceCrystal(ctx, sx, centerY);
  if (player.burning) drawBurningAura(ctx, sx, centerY, elapsedMs);
  if (player.corroded) drawCorrosion(ctx, sx, centerY, elapsedMs);
}

function drawDamagePopup(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  amount: number,
  progress: number,
  source: "hazard" | "shot" | "heal",
) {
  const alpha = 1 - progress;
  const y = toScreenY(groundY + 26 + progress * 20);
  const [r, g, b] =
    source === "hazard" ? [234, 88, 12] : source === "heal" ? [34, 197, 94] : [220, 38, 38]; // ember orange / green / shot red
  const text = source === "heal" ? `+${amount}` : `-${amount}`;
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  ctx.fillText(text, x, y);
}

/** A small narration banner across the top of the canvas — shows whichever caption is
 * currently "active" (the last one whose triggerTick has passed), fading in/out over its
 * own window so quick successive captions (e.g. multiple splash hits) don't overlap. */
function drawCaption(ctx: CanvasRenderingContext2D, canvasWidth: number, text: string, progress: number) {
  const fadeIn = Math.min(1, progress / 0.15);
  const fadeOut = Math.min(1, (1 - progress) / 0.15);
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;

  ctx.font = "bold 14px system-ui";
  ctx.textAlign = "center";
  const paddingX = 14;
  const textWidth = ctx.measureText(text).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 30;
  const x = canvasWidth / 2;
  const y = 14;

  ctx.fillStyle = `rgba(17,17,17,${0.72 * alpha})`;
  const r = 6;
  const left = x - boxWidth / 2;
  ctx.beginPath();
  ctx.moveTo(left + r, y);
  ctx.arcTo(left + boxWidth, y, left + boxWidth, y + boxHeight, r);
  ctx.arcTo(left + boxWidth, y + boxHeight, left, y + boxHeight, r);
  ctx.arcTo(left, y + boxHeight, left, y, r);
  ctx.arcTo(left, y, left + boxWidth, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + boxHeight / 2 + 1);
  ctx.textBaseline = "alphabetic";
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

/** A small procedurally-drawn plane silhouette (same style as the rest of this file's canvas
 * art — flames, ice crystal, shield bubble — no image assets), facing the direction it's
 * flying. Used for Air Strike's shot-level cosmetic full-map pass. */
function drawAirplane(ctx: CanvasRenderingContext2D, x: number, y: number, facingRight: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facingRight ? 1 : -1, 1);
  ctx.fillStyle = "#1f2937";
  // Fuselage, nose pointing toward +x (the direction of travel after the scale() above).
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-9, -3);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-9, 3);
  ctx.closePath();
  ctx.fill();
  // Wings, swept slightly back.
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(-3, -10);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(-3, 10);
  ctx.lineTo(-6, 9);
  ctx.lineTo(-2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A small procedurally-drawn balloon envelope + basket, connected to the lifted tank by two
 * thin lines — Balloon's shot-level cosmetic overlay while a tank is mid-repositioning, same
 * procedural style (no image assets) as drawAirplane/drawBomb. `tankTopScreenY` is the screen Y
 * of the (already-lifted) tank's own top, so the balloon always sits directly above it. */
function drawBalloon(ctx: CanvasRenderingContext2D, x: number, tankTopScreenY: number, elapsedMs: number) {
  const sway = Math.sin(elapsedMs * 0.003) * 3;
  const envelopeRx = 14;
  const envelopeRy = 18;
  const basketY = tankTopScreenY - 30;
  const envelopeCenterX = x + sway;
  const envelopeCenterY = basketY - envelopeRy - 10;

  ctx.strokeStyle = "#5c4426";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 6, tankTopScreenY);
  ctx.lineTo(envelopeCenterX - 5, basketY + 6);
  ctx.moveTo(x + 6, tankTopScreenY);
  ctx.lineTo(envelopeCenterX + 5, basketY + 6);
  ctx.stroke();

  ctx.fillStyle = "#92795a";
  ctx.fillRect(envelopeCenterX - 8, basketY - 6, 16, 12);

  ctx.beginPath();
  ctx.moveTo(envelopeCenterX - 6, basketY - 6);
  ctx.lineTo(envelopeCenterX - 5, envelopeCenterY + envelopeRy - 3);
  ctx.moveTo(envelopeCenterX + 6, basketY - 6);
  ctx.lineTo(envelopeCenterX + 5, envelopeCenterY + envelopeRy - 3);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(envelopeCenterX, envelopeCenterY, envelopeRx, envelopeRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
  ctx.strokeStyle = "rgba(146,105,10,0.5)";
  ctx.lineWidth = 1;
  for (const dx of [-7, 0, 7]) {
    ctx.beginPath();
    ctx.moveTo(envelopeCenterX + dx * 0.6, envelopeCenterY - envelopeRy);
    ctx.quadraticCurveTo(envelopeCenterX + dx, envelopeCenterY, envelopeCenterX + dx * 0.6, envelopeCenterY + envelopeRy);
    ctx.stroke();
  }
}

/** A small procedurally-drawn WW2-style "iron bomb" silhouette — an olive-drab capsule body
 * with a rounded nose and a couple of tail-fin strokes at the back — rotated to `angleRad` so
 * the nose always points in the bomb's current direction of travel. Used for Air Strike's
 * individual bombs instead of the usual dot+trail. */
function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, angleRad: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  // Body: nose at +x (the direction of travel after the rotate() above).
  ctx.fillStyle = "#4b5320";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail fins, a small X just behind the body.
  ctx.strokeStyle = "#2f3318";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(-9, -3.5);
  ctx.moveTo(-5, 0);
  ctx.lineTo(-9, 3.5);
  ctx.stroke();
  ctx.restore();
}

function terrainWithDiffs(base: Terrain, diffLists: TerrainDiffEntry[][]): Terrain {
  const heights = base.heights.slice();
  for (const diffs of diffLists) {
    for (const d of diffs) heights[d.x] = d.newHeight;
  }
  return { width: base.width, heights };
}

/**
 * Computes the hazard zones to draw purely from the shot's own frozen data + elapsed ticks —
 * never from the live `hazards` prop — so a background poll that's already further ahead
 * (e.g. a vs-CPU reply already resolved) can't make the lava pool flash in/out of sync with
 * what's actually animating. Existing zones tick down from tick 0 (matching the hazard-tick
 * damage popup, which also appears at triggerTick 0 — the tick conceptually happens at the
 * start of the turn); a zone this shot creates only appears once the whole shot has landed.
 */
function hazardsForShot(shot: ActiveShot, elapsedTicks: number): HazardZone[] {
  if (shot.isTickOnly) return shot.preImpactHazards ?? [];
  const ticked = (shot.preImpactHazards ?? [])
    .map((z) => ({ ...z, turnsRemaining: z.turnsRemaining - 1 }))
    .filter((z) => z.turnsRemaining > 0);
  if (shot.hazardZoneCreated) {
    const shotEndTick = Math.max(0, ...shot.projectiles.map((p) => p.startTick + p.tickCount));
    if (elapsedTicks >= shotEndTick) ticked.push(shot.hazardZoneCreated);
  }
  return ticked;
}

/**
 * Same principle as hazardsForShot, one level down to per-player status: a shield being cast
 * or a freeze being inflicted shouldn't visually appear until the shot actually lands, even
 * though the live `players` data (a background poll, or a replay step's already-resolved
 * "after" state) may already reflect it. A status that already existed before this turn is
 * still shown immediately, decayed from tick 0, exactly like hazard zones.
 *
 * Corrosion is a special case: it's inflicted by the hazard-zone tick, which — like hazard
 * damage popups — conceptually happens at the START of the turn, not on impact, so it's
 * revealed from tick 0 rather than gated behind the shot landing.
 */
function playerStatusForShot(
  shot: ActiveShot,
  playerId: string,
  elapsedTicks: number,
): {
  shield: PlayerState["shield"];
  frozen: PlayerState["frozen"];
  burning: PlayerState["burning"];
  corroded: PlayerState["corroded"];
} {
  const pre = shot.preImpactPlayers?.find((p) => p.playerId === playerId);
  if (shot.isTickOnly) {
    return {
      shield: pre?.shield ?? null,
      frozen: pre?.frozen ?? null,
      burning: pre?.burning ?? null,
      corroded: pre?.corroded ?? null,
    };
  }
  let shield = pre?.shield ?? null;
  if (shield) {
    const turnsRemaining = shield.turnsRemaining - 1;
    shield = turnsRemaining > 0 ? { ...shield, turnsRemaining } : null;
  }
  let frozen = pre?.frozen ?? null;
  if (frozen) {
    const turnsRemaining = frozen.turnsRemaining - 1;
    frozen = turnsRemaining > 0 ? { turnsRemaining } : null;
  }
  let burning = pre?.burning ?? null;
  if (burning) {
    const turnsRemaining = burning.turnsRemaining - 1;
    burning = turnsRemaining > 0 ? { ...burning, turnsRemaining } : null;
  }
  let corroded = pre?.corroded ?? null;
  if (corroded) {
    const turnsRemaining = corroded.turnsRemaining - 1;
    corroded = turnsRemaining > 0 ? { ...corroded, turnsRemaining } : null;
  }
  const inflictedCorroded = shot.statusInflicted?.find((s) => s.type === "corroded" && s.playerId === playerId);
  if (inflictedCorroded && inflictedCorroded.type === "corroded") {
    corroded = { amplify: inflictedCorroded.amplify, turnsRemaining: inflictedCorroded.turns };
  }

  const shotEndTick = Math.max(0, ...shot.projectiles.map((p) => p.startTick + p.tickCount));
  if (elapsedTicks >= shotEndTick) {
    if (shot.selfEffect?.type === "shield" && shot.selfEffect.playerId === playerId) {
      shield = { reduction: shot.selfEffect.reduction, turnsRemaining: shot.selfEffect.turns };
    }
    const inflictedFrozen = shot.statusInflicted?.find((s) => s.type === "frozen" && s.playerId === playerId);
    if (inflictedFrozen) frozen = { turnsRemaining: inflictedFrozen.turns };
    const inflictedBurning = shot.statusInflicted?.find((s) => s.type === "burning" && s.playerId === playerId);
    if (inflictedBurning && inflictedBurning.type === "burning") {
      burning = { damagePerTurn: inflictedBurning.damagePerTurn, turnsRemaining: inflictedBurning.turns };
    }
  }

  return { shield, frozen, burning, corroded };
}

/**
 * Resolves a player's rendered position for the current frame — normally just their own
 * `tankX` with no lift, but during an in-flight Balloon `selfMove` for this player,
 * interpolates the x (smoothstep, for a floaty drift feel) between the pre-flight and landing
 * position and adds a sinusoidal vertical lift (board units, peaking at the midpoint) instead.
 * No other mechanism in this file animates a tank's position — falls are vertical-only, at a
 * fixed x. Used by both the per-player draw loop and the damage-popup loop, which otherwise
 * would place a landing popup at the tank's pre-flight position while the tank itself has
 * already visually drifted away.
 */
function resolveSelfMove(
  shot: ActiveShot | null | undefined,
  player: PlayerState,
  elapsedTicks: number,
): { x: number; lift: number } {
  // Baseline is always the shot's own FROZEN pre-turn snapshot, never the live `players` prop
  // — same principle as hazardsForShot/preImpactTerrain: a background poll (or, for vs-CPU,
  // the opponent's reply already being resolved server-side before this shot's own animation
  // finishes) can otherwise reveal a Balloon reposition before its own turn is ever animated,
  // only to "snap back" once that turn's own replay correctly starts from the true pre-turn x.
  const baseX = shot?.preImpactPlayers?.find((p) => p.playerId === player.playerId)?.tankX ?? player.tankX;
  const move = shot?.selfMove;
  if (!move || move.playerId !== player.playerId) return { x: baseX, lift: 0 };
  const progress = Math.max(0, Math.min(1, (elapsedTicks - move.startTick) / move.tickCount));
  const eased = progress * progress * (3 - 2 * progress);
  const x = move.fromX + (move.toX - move.fromX) * eased;
  const lift = Math.sin(Math.PI * progress) * BALLOON_LIFT_HEIGHT;
  return { x, lift };
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
    const renderHazards = shot ? hazardsForShot(shot, elapsedTicks) : hazardsRef.current;
    if (renderHazards?.length) drawHazards(ctx, renderTerrain, renderHazards, elapsedMs);

    for (const player of playersRef.current) {
      const isActingTank = shot?.actingSlot === player.slot;
      const isAiming = aimRef.current?.slot === player.slot;
      const barrelAngle = isActingTank
        ? shot!.angle
        : isAiming
          ? aimRef.current!.angle
          : player.lastAngle;
      const renderPlayer = shot ? { ...player, ...playerStatusForShot(shot, player.playerId, elapsedTicks) } : player;
      const { x: resolvedX, lift } = resolveSelfMove(shot, player, elapsedTicks);
      drawTank(ctx, renderTerrain, renderPlayer, PLAYER_COLORS[player.slot], barrelAngle, elapsedMs, resolvedX, lift);
    }

    if (shot?.selfMove) {
      const move = shot.selfMove;
      const progress = (elapsedTicks - move.startTick) / move.tickCount;
      if (progress > 0 && progress < 1) {
        const player = playersRef.current.find((p) => p.playerId === move.playerId);
        if (player) {
          const { x, lift } = resolveSelfMove(shot, player, elapsedTicks);
          const tankTopY = heightAt(renderTerrain, x) + lift + getTankVisual(player.tankClass).bodyHeight;
          drawBalloon(ctx, x, toScreenY(tankTopY), elapsedMs);
        }
      }
    }

    if (shot) {
      // Balloon's degenerate 1-tick pseudo-projectile (from simulateInstant) has no visual of
      // its own — selfMove/drawBalloon above own this shot's visuals instead.
      for (const p of shot.projectileStyle === "balloon" ? [] : shot.projectiles) {
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
          } else if (shot.projectileStyle === "bomb") {
            // Heading from a slightly earlier point on the same trajectory, in screen space,
            // so the bomb's nose always points along its actual current direction of travel
            // (diagonal while falling, not just straight down).
            const headingProgress = Math.max(0, localProgress - 0.02);
            const hp = pointAtProgress(p.trajectory, headingProgress);
            const angle = Math.atan2(screenY - toScreenY(hp.y), screenX - hp.x);
            drawBomb(ctx, screenX, screenY, angle);
          } else {
            const [pr, pg, pb] = shot.projectileColor ? hexToRgb(shot.projectileColor) : [26, 26, 26];
            ctx.beginPath();
            ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
            ctx.fillStyle = shot.projectileColor ?? "#1a1a1a";
            ctx.fill();

            for (let i = 1; i <= 4; i++) {
              const trailProgress = Math.max(0, localProgress - i * 0.02);
              const tp = pointAtProgress(p.trajectory, trailProgress);
              ctx.beginPath();
              ctx.arc(tp.x, toScreenY(tp.y), 3 - i * 0.5, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${pr},${pg},${pb},${0.4 - i * 0.08})`;
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

      // The airstrike plane is a shot-level cosmetic overlay, independent of any individual
      // bomb's own trajectory/timing: always a full pass, entering one edge of the map and
      // exiting the other, regardless of where/when bombs happen to release along the way.
      if (shot.airstrikeFlight) {
        const { fromLeft, totalTicks, startTick } = shot.airstrikeFlight;
        const passTicks = elapsedTicks - startTick;
        if (passTicks >= 0 && passTicks <= totalTicks) {
          const progress = passTicks / totalTicks;
          const planeX = fromLeft ? progress * (renderTerrain.width - 1) : (renderTerrain.width - 1) * (1 - progress);
          const planeY = toScreenY(AIRSTRIKE_ALTITUDE_RATIO * BOARD_HEIGHT);
          drawAirplane(ctx, planeX, planeY, fromLeft);
        }
      }

      for (const popup of shot.damagePopups ?? []) {
        if (elapsedTicks < popup.triggerTick) continue;
        const msSinceTrigger = elapsedMs - popup.triggerTick * MS_PER_TICK;
        if (msSinceTrigger >= POPUP_DURATION_MS) continue;
        const player = playersRef.current.find((p) => p.slot === popup.slot);
        if (!player) continue;
        const { x: popupX, lift: popupLift } = resolveSelfMove(shot, player, elapsedTicks);
        const groundY = heightAt(renderTerrain, popupX) + popupLift;
        drawDamagePopup(
          ctx,
          popupX,
          groundY,
          popup.amount,
          msSinceTrigger / POPUP_DURATION_MS,
          popup.source,
        );
      }

      const activeCaption = (shot.captions ?? []).filter((c) => elapsedTicks >= c.triggerTick).at(-1);
      if (activeCaption) {
        const msSinceTrigger = elapsedMs - activeCaption.triggerTick * MS_PER_TICK;
        if (msSinceTrigger < CAPTION_DURATION_MS) {
          drawCaption(ctx, canvas.width, activeCaption.text, msSinceTrigger / CAPTION_DURATION_MS);
        }
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

    const airstrikeFlight = activeShot.airstrikeFlight;
    const selfMove = activeShot.selfMove;
    const computedEndTick = Math.max(
      0,
      ...activeShot.projectiles.map((p) => p.startTick + p.tickCount),
      ...(activeShot.damagePopups ?? []).map(
        (p) => p.triggerTick + POPUP_DURATION_MS / MS_PER_TICK,
      ),
      ...(activeShot.captions ?? []).map((c) => c.triggerTick + CAPTION_DURATION_MS / MS_PER_TICK),
      airstrikeFlight ? airstrikeFlight.startTick + airstrikeFlight.totalTicks : 0,
      selfMove ? selfMove.startTick + selfMove.tickCount : 0,
    );
    // A tick-only preview has no projectile flight to time its length off of — give it a floor
    // so its captions stay on screen long enough to read.
    const maxEndTick = activeShot.isTickOnly ? Math.max(computedEndTick, MIN_TICK_ONLY_DURATION_TICKS) : computedEndTick;
    let rafId: number;
    let startTime: number | null = null;
    // Local to this shot's own effect instance, so each new shot starts fresh — tracks which
    // projectiles have already had their launch/impact sound played, since tick() runs every
    // animation frame and a sound must fire exactly once, not on every frame the threshold
    // stays crossed.
    const launchedIndices = new Set<number>();
    const impactedIndices = new Set<number>();
    const releasedIndices = new Set<number>();
    const playedCueIndices = new Set<number>();
    const isBombStyle = activeShot.projectileStyle === "bomb";
    // Balloon's degenerate 1-tick pseudo-projectile has no meaningful launch/impact of its
    // own — its own soundCues (balloonLaunch/balloonLand) replace the generic pew/thud instead.
    const isBalloonStyle = activeShot.projectileStyle === "balloon";
    let engineStarted = false;

    function tick(now: number) {
      if (!canvas || !ctx) return;
      if (startTime === null) startTime = now;
      const elapsedMs = now - startTime;
      const elapsedTicks = elapsedMs / MS_PER_TICK;
      activeShot!.projectiles.forEach((p, i) => {
        // A generic launch "pew" doesn't fit a bomb dropping from a plane — the engine drone
        // below gives Air Strike its own opening audio cue instead.
        if (i === 0 && elapsedTicks >= p.startTick && !launchedIndices.has(i)) {
          launchedIndices.add(i);
          if (!isBombStyle && !isBalloonStyle) playLaunch();
        }
        // Every bomb gets its own quiet release blip as it leaves the plane, not just the first.
        if (isBombStyle && elapsedTicks >= p.startTick && !releasedIndices.has(i)) {
          releasedIndices.add(i);
          playBombRelease();
        }
        const endTick = p.startTick + p.tickCount;
        if (p.impact && elapsedTicks >= endTick && !impactedIndices.has(i)) {
          impactedIndices.add(i);
          if (isBombStyle) playBombImpact();
          else if (!isBalloonStyle) playImpact();
        }
      });
      activeShot!.soundCues?.forEach((cue, i) => {
        if (elapsedTicks >= cue.triggerTick && !playedCueIndices.has(i)) {
          playedCueIndices.add(i);
          playSoundCue(cue.kind);
        }
      });
      const airstrikeFlight = activeShot!.airstrikeFlight;
      if (airstrikeFlight && !engineStarted && elapsedTicks >= airstrikeFlight.startTick) {
        engineStarted = true;
        playEngineDrone((airstrikeFlight.totalTicks * MS_PER_TICK) / 1000);
      }
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
