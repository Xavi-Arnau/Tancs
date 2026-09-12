import {
  BOARD_WIDTH,
  STARTING_CURRENCY,
  STARTING_HP,
  TANK_SPAWN_CENTER_MARGIN_RATIO,
  TANK_SPAWN_EDGE_MARGIN_RATIO,
} from "./constants.js";
import { generateTerrain } from "./terrain.js";
import type { PlayerState, Terrain } from "./types.js";
import { defaultInventory } from "./weapons.js";

export function createInitialTerrain(
  width: number = BOARD_WIDTH,
  rng?: () => number,
): Terrain {
  return generateTerrain(width, rng);
}

export function initialTankX(
  slot: 0 | 1,
  width: number = BOARD_WIDTH,
  rng: () => number = Math.random,
): number {
  const edgeMargin = width * TANK_SPAWN_EDGE_MARGIN_RATIO;
  const centerMargin = width * TANK_SPAWN_CENTER_MARGIN_RATIO;
  const zoneStart = slot === 0 ? edgeMargin : width / 2 + centerMargin;
  const zoneEnd = slot === 0 ? width / 2 - centerMargin : width - edgeMargin;
  return zoneStart + rng() * (zoneEnd - zoneStart);
}

export function createPlayerState(
  playerId: string,
  slot: 0 | 1,
  width: number = BOARD_WIDTH,
  displayName: string | null = null,
  rng: () => number = Math.random,
): PlayerState {
  return {
    playerId,
    slot,
    tankX: initialTankX(slot, width, rng),
    hp: STARTING_HP,
    currency: STARTING_CURRENCY,
    readyForBuyPhase: false,
    inventory: defaultInventory(),
    lastAngle: slot === 0 ? 45 : 135, // face the opponent before either tank has fired
    displayName,
    shield: null,
    frozen: null,
    burning: null,
    corroded: null,
    tankClass: "standard",
  };
}
