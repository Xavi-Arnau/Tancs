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
    description: "Splits mid-air into 6 bomblets that scatter across the battlefield.",
    cost: 75,
    damage: 16,
    splashRadius: 22,
    projectile: "split",
    // All dx > 0: every fragment continues further in whatever direction the shell was
    // already heading (mirrored by simulateSplit for a leftward shot) — a fan that always
    // fans "onward," never back toward the shooter. Kept small relative to a fairly long
    // splitRevealTicks: since a fragment keeps flying at roughly its reveal-time velocity
    // for the rest of its (potentially multi-second) fall, a small dx over a longer reveal
    // window means gentler ongoing horizontal speed — the actual landing spread ends up
    // wider than these numbers alone suggest, without overshooting the board. 6 fragments at
    // a tighter dx spacing than before (was 4 fragments, 8 apart) — more, individually
    // weaker impacts covering a similar-ish spread, same 96 theoretical max total damage.
    splitPattern: [
      { dx: 8, dy: -6 },
      { dx: 14, dy: 6 },
      { dx: 20, dy: -6 },
      { dx: 26, dy: 6 },
      { dx: 32, dy: -6 },
      { dx: 38, dy: 6 },
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
    description: "Blooms into a heart of flame just before impact, then drops straight down. Leaves anyone it hits smoldering for a few turns.",
    cost: 90,
    damage: 13,
    splashRadius: 15,
    projectile: "split",
    splitPattern: generateHeartPattern(10, 2.2),
    splitMode: "drop",
    burn: { damagePerTurn: 4, turns: 6 },
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
  repair_kit: {
    id: "repair_kit",
    name: "Repair Kit",
    description: "Patches up your own tank for 30 HP. Can't exceed 100 HP.",
    cost: 50,
    damage: 0,
    splashRadius: 0,
    projectile: "instant",
    heal: 30,
    defaultAmmo: 0,
    purchasable: true,
    color: "#22c55e",
    icon: "repair",
  },
  shield_generator: {
    id: "shield_generator",
    name: "Shield Generator",
    description: "Reduces incoming damage by 50% for the next 4 turns.",
    cost: 70,
    damage: 0,
    splashRadius: 0,
    projectile: "instant",
    shield: { reduction: 0.5, turns: 4 },
    defaultAmmo: 0,
    purchasable: true,
    color: "#0ea5e9",
    icon: "shield",
  },
  balloon: {
    id: "balloon",
    name: "Balloon",
    description: "Lifts your tank and lets the wind carry it to a new spot. Landing hard enough can still hurt.",
    cost: 55,
    damage: 0,
    splashRadius: 0,
    projectile: "instant",
    balloon: true,
    defaultAmmo: 0,
    purchasable: true,
    color: "#fbbf24",
    icon: "balloon",
    projectileStyle: "balloon",
  },
  freeze_shell: {
    id: "freeze_shell",
    name: "Freeze Shell",
    description: "A modest blast that locks the target's aim angle for 4 turns.",
    cost: 60,
    damage: 10,
    splashRadius: 30,
    projectile: "parabolic",
    freeze: { turns: 4 },
    defaultAmmo: 0,
    purchasable: true,
    color: "#38bdf8",
    icon: "freeze",
    projectileColor: "#7dd3fc",
  },
  vat_of_acid: {
    id: "vat_of_acid",
    name: "Vat of Acid",
    description: "A weaker splash than Magma Strike, but the pool of acid it leaves behind spreads wider, eats into the ground, and corrodes anyone standing in it, leaving them vulnerable to extra damage.",
    cost: 90,
    damage: 12,
    splashRadius: 28,
    projectile: "parabolic",
    hazard: { damagePerTurn: 8, turns: 6, growPerTurn: 20, sinkPerTurn: 3, corrode: { amplify: 0.25, turns: 4 } },
    defaultAmmo: 0,
    purchasable: true,
    color: "#65a30d",
    icon: "acid",
  },
  air_strike: {
    id: "air_strike",
    name: "Air Strike",
    description: "An unaimed strafing run — a plane crosses the whole battlefield, dropping bombs one by one wherever they happen to fall.",
    cost: 100,
    damage: 10,
    splashRadius: 35,
    projectile: "airstrike",
    defaultAmmo: 0,
    purchasable: true,
    color: "#334155",
    icon: "airstrike",
    projectileStyle: "bomb",
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
