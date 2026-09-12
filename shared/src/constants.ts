// Board is a 2D coordinate space: x in [0, BOARD_WIDTH), y grows upward from 0 (ground level) to BOARD_HEIGHT.
// The heightmap is one terrain-surface height per integer column of x.
export const BOARD_WIDTH = 800;
export const BOARD_HEIGHT = 500;

export const GRAVITY = 300; // units/s^2, applied to vy each tick
export const POWER_TO_VELOCITY = 6; // power (0-100) * this = initial projectile speed
export const SIM_DT = 1 / 60; // seconds per simulation tick
export const MAX_SIM_TICKS = 1200; // safety cap (~20s of simulated flight)
export const TRAJECTORY_SAMPLE_COUNT = 30; // points stored/replayed per shot

export const WIND_MAX = 40; // signed horizontal acceleration, randomized each turn in [-WIND_MAX, WIND_MAX]

export const STARTING_HP = 100;
export const STARTING_CURRENCY = 1000;

export const TANK_SPAWN_EDGE_MARGIN_RATIO = 0.15; // closest a tank can spawn to its own outer edge
export const TANK_SPAWN_CENTER_MARGIN_RATIO = 0.15; // closest a tank can spawn to the board's center line
export const TANK_WIDTH = 24; // used for splash-distance and rendering, in board units
export const BARREL_LAUNCH_HEIGHT = 14; // vertical offset from tank base to barrel tip, in board units

export const FALL_DAMAGE_PER_UNIT = 0; // config-driven fall damage multiplier; 0 disables it for v1

export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
export const MIN_POWER = 0;
export const MAX_POWER = 100;

// "split" projectile weapons (e.g. cluster bombs): minimum ticks of ascent before a split is
// allowed, so a very flat shot doesn't split at the muzzle.
export const MIN_SPLIT_TICKS = 10;

// Fraction of the shot's natural (undisturbed) flight duration at which it splits — near the
// end of the flight, close to where it would have landed, rather than at the trajectory's own
// physics apex (which has no relation to where the shot is aimed and is often nowhere near
// the target).
export const SPLIT_FRACTION = 0.88;

// "bounce" projectile weapons: how much vertical/horizontal speed a shot keeps after each
// bounce off terrain (< 1 so it loses energy and eventually settles instead of bouncing forever).
export const BOUNCE_RESTITUTION = 0.6; // vy retained per bounce
export const BOUNCE_FRICTION = 0.85; // vx retained per bounce

// "airstrike" projectile weapons: an unaimed plane pass dropping several bombs one at a time.
export const AIRSTRIKE_ALTITUDE_RATIO = 0.95; // fraction of BOARD_HEIGHT — comfortably above the tallest possible terrain (0.85) so bombs always get real fall time
export const AIRSTRIKE_PLANE_SPEED_BASE = 220; // units/sec, before per-shot random variance
export const AIRSTRIKE_MIN_BOMBS = 5;
export const AIRSTRIKE_MAX_BOMBS = 8;
export const AIRSTRIKE_RELEASE_WINDOW_START = 0.2; // bombs only release during the middle
export const AIRSTRIKE_RELEASE_WINDOW_END = 0.8; // portion of the pass, one at a time
export const AIRSTRIKE_MIN_RELEASE_GAP_TICKS = 10; // plus a random 0-10 more between each
