import { STARTING_HP } from "./constants.js";

export interface TankClassDefinition {
  id: string;
  name: string;
  description: string;
  hpMultiplier: number; // applied to STARTING_HP for this class's max HP
  damageMultiplier: number; // applied to this tank's own outgoing splash damage
  color: string;
}

export const TANK_CLASSES: Record<string, TankClassDefinition> = {
  standard: {
    id: "standard",
    name: "Standard",
    description: "Balanced — no bonuses, no drawbacks.",
    hpMultiplier: 1,
    damageMultiplier: 1,
    color: "#64748b",
  },
  glass_cannon: {
    id: "glass_cannon",
    name: "Glass Cannon",
    description: "Hits 30% harder, but only has 75 HP.",
    hpMultiplier: 0.75,
    damageMultiplier: 1.3,
    color: "#ef4444",
  },
  juggernaut: {
    id: "juggernaut",
    name: "Juggernaut",
    description: "130 HP, but deals 15% less damage.",
    hpMultiplier: 1.3,
    damageMultiplier: 0.85,
    color: "#0f766e",
  },
};

export function getTankClass(id: string): TankClassDefinition {
  return TANK_CLASSES[id] ?? TANK_CLASSES.standard;
}

export function listTankClasses(): TankClassDefinition[] {
  return Object.values(TANK_CLASSES);
}

export function maxHpFor(tankClassId: string): number {
  return Math.round(STARTING_HP * getTankClass(tankClassId).hpMultiplier);
}
