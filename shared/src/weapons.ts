import type { SplitPatternPoint, WeaponDefinition } from "./types.js";

const BASE_DAMAGE = 40;

/**
 * Samples the classic parametric heart curve into `count` points, scaled to board units.
 * Used as a "split" weapon's fragment pattern — each point is a target (dx, dy) offset from
 * the split point that a fragment is launched to reach, so the fragments visibly bloom into
 * a heart shape mid-air before falling to their own individual impacts.
 */
function generateHeartPattern(count: number, scale: number): SplitPatternPoint[] {
  const points: SplitPatternPoint[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    const dx = 16 * Math.sin(theta) ** 3;
    const dy =
      13 * Math.cos(theta) -
      5 * Math.cos(2 * theta) -
      2 * Math.cos(3 * theta) -
      Math.cos(4 * theta);
    points.push({ dx: dx * scale, dy: dy * scale });
  }
  return points;
}

export const WEAPONS: Record<string, WeaponDefinition> = {
  basic_shell: {
    id: "basic_shell",
    name: "Basic Shell",
    description: "Standard-issue shell. Unlimited ammo.",
    cost: 0,
    damage: BASE_DAMAGE,
    splashRadius: 35,
    projectile: "parabolic",
    defaultAmmo: "infinite",
    purchasable: false,
    color: "#64748b",
    icon: "shell",
  },
  heavy_shell: {
    id: "heavy_shell",
    name: "Heavy Shell",
    description: "Deals double damage with a much bigger blast. Must be bought before battle.",
    cost: 60,
    damage: BASE_DAMAGE * 2,
    splashRadius: 60,
    projectile: "parabolic",
    defaultAmmo: 0,
    purchasable: true,
    color: "#f97316",
    icon: "bomb",
  },
  cluster_bomb: {
    id: "cluster_bomb",
    name: "Cluster Bomb",
    description: "Splits mid-air into 4 bomblets that scatter across the battlefield.",
    cost: 75,
    damage: 24,
    splashRadius: 22,
    projectile: "split",
    // All dx > 0: every fragment continues further in whatever direction the shell was
    // already heading (mirrored by simulateSplit for a leftward shot) — a fan that always
    // fans "onward," never back toward the shooter. Kept small relative to a fairly long
    // splitRevealTicks: since a fragment keeps flying at roughly its reveal-time velocity
    // for the rest of its (potentially multi-second) fall, a small dx over a longer reveal
    // window means gentler ongoing horizontal speed — the actual landing spread ends up
    // wider than these numbers alone suggest, without overshooting the board.
    splitPattern: [
      { dx: 8, dy: -6 },
      { dx: 16, dy: 6 },
      { dx: 24, dy: -6 },
      { dx: 32, dy: 6 },
    ],
    splitRevealTicks: 45,
    defaultAmmo: 0,
    purchasable: true,
    color: "#a855f7",
    icon: "cluster",
  },
  love_is_pain: {
    id: "love_is_pain",
    name: "Love Is Pain",
    description: "Blooms into a heart of flame just before impact, then drops straight down.",
    cost: 90,
    damage: 13,
    splashRadius: 15,
    projectile: "split",
    splitPattern: generateHeartPattern(10, 2.2),
    splitMode: "drop",
    defaultAmmo: 0,
    purchasable: true,
    color: "#e11d48",
    icon: "heart",
    projectileStyle: "flame",
  },
  magma_strike: {
    id: "magma_strike",
    name: "Magma Strike",
    description: "Fills the crater with lava that burns anyone standing in it for 4 turns.",
    cost: 80,
    damage: 20,
    splashRadius: 45,
    projectile: "parabolic",
    hazard: { damagePerTurn: 15, turns: 4 },
    defaultAmmo: 0,
    purchasable: true,
    color: "#c2410c",
    icon: "magma",
  },
  bouncing_betty: {
    id: "bouncing_betty",
    name: "Bouncing Betty",
    description: "Skips twice off the terrain before detonating on its third impact.",
    cost: 65,
    damage: 45,
    splashRadius: 40,
    projectile: "bounce",
    maxBounces: 2,
    defaultAmmo: 0,
    purchasable: true,
    color: "#0891b2",
    icon: "bounce",
  },
};

export function getWeapon(weaponId: string): WeaponDefinition {
  const weapon = WEAPONS[weaponId];
  if (!weapon) {
    throw new Error(`Unknown weapon id: ${weaponId}`);
  }
  return weapon;
}

export function listPurchasableWeapons(): WeaponDefinition[] {
  return Object.values(WEAPONS).filter((w) => w.purchasable);
}

export function defaultInventory(): { weaponId: string; quantity: number }[] {
  return Object.values(WEAPONS)
    .filter((w) => w.defaultAmmo !== "infinite")
    .map((w) => ({ weaponId: w.id, quantity: w.defaultAmmo as number }));
}
