import { CharacterClass } from './characters';

export interface Vector2D {
  x: number;
  y: number;
}

export type SkillSlot = 'light' | 'heavy' | 'special' | 'dodge';

export interface CooldownState {
  light: number;   // remaining seconds
  heavy: number;
  special: number;
  dodge: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  characterClass: CharacterClass;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number; // in radians
  hp: number;
  maxHp: number;
  isAlive: boolean;
  isInvulnerable: boolean; // spawn protection or dodge i-frame
  isDashing: boolean;
  respawnTimer: number; // remaining seconds until respawn
  kills: number;
  deaths: number;
  damageDealt: number;
  ping: number;
  cooldowns: CooldownState;
  color: string;
}

export interface Projectile {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  maxDistance: number;
  traveled: number;
  color: string;
}

export interface ActiveVisualEffect {
  id: string;
  type: 'whirlwind' | 'slash' | 'explosion' | 'laser' | 'dash' | 'hit' | 'teleport';
  x: number;
  y: number;
  angle?: number;
  radius?: number;
  length?: number;
  color: string;
  duration: number; // total duration
  createdAt: number; // timestamp
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  createdAt: number;
  duration: number;
}

export type MatchStatus = 'waiting' | 'countdown' | 'in_progress' | 'ended';

export interface GameStateSnapshot {
  tick: number;
  timestamp: number;
  matchState: MatchStatus;
  timeRemaining: number;
  players: PlayerSnapshot[];
  projectiles: Projectile[];
  effects: ActiveVisualEffect[];
  lastProcessedInputSeq: Record<string, number>; // playerId -> seq
}

// Client Input Payload sent every frame/tick
export interface InputPayload {
  seq: number;
  dx: number; // -1 to 1 normalized
  dy: number; // -1 to 1 normalized
  facingAngle: number; // radians
  action?: SkillSlot;
  timestamp: number;
}

// Player Room Info
export interface RoomPlayer {
  id: string;
  name: string;
  characterClass: CharacterClass;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  mmr: number;
}

export interface RoomDetails {
  code: string;
  isPrivate: boolean;
  status: MatchStatus;
  players: RoomPlayer[];
  countdown?: number;
}

// Match result player record
export interface MatchResultPlayer {
  id: string;
  name: string;
  characterClass: CharacterClass;
  kills: number;
  deaths: number;
  damageDealt: number;
  rank: number;
  oldMmr: number;
  newMmr: number;
  mmrDelta: number;
}

export interface MatchResultData {
  roomCode: string;
  winnerId: string | null;
  winnerName: string | null;
  reason: 'time_up' | 'target_kills' | 'forfeit';
  scoreboard: MatchResultPlayer[];
}

export interface UserProfile {
  id: string;
  nickname: string;
  sessionToken: string;
  mmr: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
}

export interface MatchHistoryItem {
  id: string;
  date: string;
  mode: string;
  playersCount: number;
  rank: number;
  characterClass: CharacterClass;
  kills: number;
  deaths: number;
  damageDealt: number;
  mmrChange: number;
}

// Network Packets (Client <-> Server)
export type ClientPacket =
  | { type: 'AUTH'; payload: { nickname: string; sessionToken?: string; characterClass: CharacterClass } }
  | { type: 'JOIN_QUEUE'; payload: { characterClass: CharacterClass } }
  | { type: 'LEAVE_QUEUE' }
  | { type: 'CREATE_ROOM'; payload: { characterClass: CharacterClass } }
  | { type: 'JOIN_ROOM'; payload: { code: string; characterClass: CharacterClass } }
  | { type: 'LEAVE_ROOM' }
  | { type: 'SET_READY'; payload: { ready: boolean } }
  | { type: 'CHANGE_CLASS'; payload: { characterClass: CharacterClass } }
  | { type: 'INPUT'; payload: InputPayload }
  | { type: 'RECONNECT'; payload: { sessionToken: string; roomCode: string } }
  | { type: 'PING'; payload: { clientTime: number } };

export type ServerPacket =
  | { type: 'AUTH_SUCCESS'; payload: { user: UserProfile } }
  | { type: 'QUEUE_STATUS'; payload: { inQueue: boolean; playersInQueue: number } }
  | { type: 'ROOM_UPDATE'; payload: RoomDetails }
  | { type: 'MATCH_START'; payload: { roomCode: string; players: RoomPlayer[] } }
  | { type: 'SNAPSHOT'; payload: GameStateSnapshot }
  | { type: 'COMBAT_EVENT'; payload: { eventType: 'hit' | 'kill' | 'respawn'; text: string; x?: number; y?: number; damage?: number } }
  | { type: 'MATCH_END'; payload: MatchResultData }
  | { type: 'PONG'; payload: { clientTime: number; serverTime: number } }
  | { type: 'ERROR'; payload: { message: string; code?: string } }
  | { type: 'RECONNECT_SUCCESS'; payload: { room: RoomDetails } }
  | { type: 'ACTION_REJECTED'; payload: { action: string; reason: string } };

