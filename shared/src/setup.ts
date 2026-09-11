import {
  BOARD_WIDTH,
  STARTING_CURRENCY,
  STARTING_HP,
  TANK_START_MARGIN_RATIO,
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

export function initialTankX(slot: 0 | 1, width: number = BOARD_WIDTH): number {
  const margin = width * TANK_START_MARGIN_RATIO;
  return slot === 0 ? margin : width - margin;
}

export function createPlayerState(
  playerId: string,
  slot: 0 | 1,
  width: number = BOARD_WIDTH,
  displayName: string | null = null,
): PlayerState {
  return {
    playerId,
    slot,
    tankX: initialTankX(slot, width),
    hp: STARTING_HP,
    currency: STARTING_CURRENCY,
    readyForBuyPhase: false,
    inventory: defaultInventory(),
    lastAngle: slot === 0 ? 45 : 135, // face the opponent before either tank has fired
    displayName,
  };
}
