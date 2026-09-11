import type { WeaponDefinition } from "./types.js";

const BASE_DAMAGE = 25;

export const WEAPONS: Record<string, WeaponDefinition> = {
  basic_shell: {
    id: "basic_shell",
    name: "Basic Shell",
    description: "Standard-issue shell. Unlimited ammo.",
    cost: 0,
    damage: BASE_DAMAGE,
    splashRadius: 40,
    projectile: "parabolic",
    defaultAmmo: "infinite",
    purchasable: false,
  },
  heavy_shell: {
    id: "heavy_shell",
    name: "Heavy Shell",
    description: "Deals double damage. Must be bought before battle.",
    cost: 30,
    damage: BASE_DAMAGE * 2,
    splashRadius: 45,
    projectile: "parabolic",
    defaultAmmo: 0,
    purchasable: true,
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
