const STORAGE_KEY = "tancs.lastShotSettings";

interface ShotSettings {
  weaponId: string;
  angle: number;
  power: number;
}

type StoredSettings = Record<string, ShotSettings>;

function readAll(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSettings) : {};
  } catch {
    return {};
  }
}

export function getLastShot(gameId: string): ShotSettings | null {
  return readAll()[gameId] ?? null;
}

export function saveLastShot(gameId: string, settings: ShotSettings): void {
  try {
    const all = readAll();
    all[gameId] = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable — settings just won't be remembered.
  }
}
