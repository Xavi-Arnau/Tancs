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
export const STARTING_CURRENCY = 150;

export const TANK_START_MARGIN_RATIO = 0.15; // tanks start this fraction in from each edge
export const TANK_WIDTH = 24; // used for splash-distance and rendering, in board units
export const BARREL_LAUNCH_HEIGHT = 14; // vertical offset from tank base to barrel tip, in board units

export const FALL_DAMAGE_PER_UNIT = 0; // config-driven fall damage multiplier; 0 disables it for v1

export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;
export const MIN_POWER = 0;
export const MAX_POWER = 100;
