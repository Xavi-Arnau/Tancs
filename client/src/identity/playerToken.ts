const STORAGE_KEY = "tancs.games";

interface StoredGameIdentity {
  token: string;
  slot: 0 | 1;
  lastSeenTurnNumber: number;
}

type StoredGames = Record<string, StoredGameIdentity>;

function readAll(): StoredGames {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredGames) : {};
  } catch {
    return {};
  }
}

function writeAll(games: StoredGames): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  } catch {
    // localStorage unavailable (private mode, etc.) — identity just won't persist.
  }
}

export function getGameIdentity(gameId: string): StoredGameIdentity | null {
  return readAll()[gameId] ?? null;
}

export function listStoredGameIds(): string[] {
  return Object.keys(readAll());
}

export function listStoredGames(): Array<{ gameId: string; token: string }> {
  return Object.entries(readAll()).map(([gameId, identity]) => ({
    gameId,
    token: identity.token,
  }));
}

export function saveGameIdentity(
  gameId: string,
  identity: { token: string; slot: 0 | 1 },
): void {
  const all = readAll();
  all[gameId] = {
    token: identity.token,
    slot: identity.slot,
    lastSeenTurnNumber: all[gameId]?.lastSeenTurnNumber ?? 0,
  };
  writeAll(all);
}

export function setLastSeenTurnNumber(gameId: string, turnNumber: number): void {
  const all = readAll();
  const existing = all[gameId];
  if (!existing) return;
  existing.lastSeenTurnNumber = turnNumber;
  writeAll(all);
}

export function removeGameIdentity(gameId: string): void {
  const all = readAll();
  delete all[gameId];
  writeAll(all);
}
