export const TICK_RATE = 30; // 30 Hz
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // ~33.33ms
export const TICK_DT = 1 / TICK_RATE; // ~0.03333 seconds

export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 800;

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'pillar' | 'wall' | 'rock';
}

// 4 symmetric cover pillars in the arena
export const ARENA_OBSTACLES: Obstacle[] = [
  { id: 'obs-1', x: 280, y: 220, width: 90, height: 90, type: 'pillar' },
  { id: 'obs-2', x: 830, y: 220, width: 90, height: 90, type: 'pillar' },
  { id: 'obs-3', x: 280, y: 490, width: 90, height: 90, type: 'pillar' },
  { id: 'obs-4', x: 830, y: 490, width: 90, height: 90, type: 'pillar' },
  // Center small barrier
  { id: 'obs-center', x: 550, y: 360, width: 100, height: 80, type: 'pillar' }
];

export const SPAWN_POINTS = [
  { x: 120, y: 120 },
  { x: 1080, y: 120 },
  { x: 120, y: 680 },
  { x: 1080, y: 680 }
];

export const MAX_PLAYERS_PER_ROOM = 4;
export const MIN_PLAYERS_TO_START = 2;
export const MATCH_DURATION_SEC = 180; // 3 minutes
export const TARGET_KILLS_TO_WIN = 5;

export const RESPAWN_DELAY_SEC = 3.0;
export const SPAWN_SHIELD_SEC = 2.0;
export const DODGE_IFRAME_SEC = 0.2; // 200ms

export const RECONNECT_TIMEOUT_SEC = 45;
export const RATE_LIMIT_MAX_PACKETS_PER_SEC = 60;
export const ENTITY_INTERPOLATION_OFFSET_MS = 100; // 100ms render delay for remote players

// MMR Adjustments
export const MMR_RULES = {
  INITIAL: 1000,
  FIRST_PLACE: 25,
  SECOND_PLACE_MULTI: 10,  // In 3-4 player match
  SECOND_PLACE_DUEL: -20,  // In 2 player match
  THIRD_PLACE: -10,
  FOURTH_PLACE: -20,
  FORFEIT: -25
};

