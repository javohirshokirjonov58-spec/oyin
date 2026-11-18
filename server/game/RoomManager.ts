import { WebSocket } from 'ws';
import {
  CharacterClass
} from '../../shared/characters';
import {
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  RECONNECT_TIMEOUT_SEC,
  RATE_LIMIT_MAX_PACKETS_PER_SEC
} from '../../shared/constants';
import {
  RoomDetails,
  RoomPlayer,
  ServerPacket,
  ClientPacket,
  GameStateSnapshot,
  MatchResultData,
  InputPayload
} from '../../shared/types';
import { GameLoop } from './GameLoop';
import { CombatEvent } from './CombatSystem';
import { dbStore } from '../db/store';

export interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  name: string;
  characterClass: CharacterClass;
  sessionToken: string;
  roomCode: string | null;
  packetCount: number;
  lastPacketReset: number;
}

export interface ManagedRoom {
  code: string;
  isPrivate: boolean;
  gameLoop: GameLoop;
  players: Map<string, {
    client?: ConnectedClient;
    name: string;
    characterClass: CharacterClass;
    isReady: boolean;
    isHost: boolean;
    isConnected: boolean;
    sessionToken: string;
    disconnectTimeout?: NodeJS.Timeout;
  }>;
  countdownTimer?: NodeJS.Timeout;
  countdownSeconds: number;
}

export class RoomManager {
  private rooms: Map<string, ManagedRoom> = new Map();
  private queue: { client: ConnectedClient; joinedAt: number }[] = [];
  private clients: Map<WebSocket, ConnectedClient> = new Map();

  constructor() {
    // Background matchmaking queue checker every 1 second
    setInterval(() => this.processMatchmakingQueue(), 1000);
  }

  public registerClient(ws: WebSocket): ConnectedClient {
    const client: ConnectedClient = {
      ws,
      userId: '',
      name: '',
      characterClass: 'warrior',
      sessionToken: '',
      roomCode: null,
      packetCount: 0,
      lastPacketReset: Date.now()
    };
    this.clients.set(ws, client);
    return client;
  }

  public unregisterClient(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.leaveQueue(client);

    if (client.roomCode) {
      this.handlePlayerDisconnect(client);
    }

    this.clients.delete(ws);
  }

  public checkRateLimit(client: ConnectedClient): boolean {
    const now = Date.now();
    if (now - client.lastPacketReset > 1000) {
      client.packetCount = 0;
      client.lastPacketReset = now;
    }
    client.packetCount++;
    if (client.packetCount > RATE_LIMIT_MAX_PACKETS_PER_SEC) {
      console.warn(`[RateLimit] Disconnecting ${client.name || client.userId} for exceeding ${RATE_LIMIT_MAX_PACKETS_PER_SEC} pkts/s`);
      this.send(client.ws, {
        type: 'ERROR',
        payload: { message: 'Packet rate limit exceeded (Anti-Cheat)', code: 'RATE_LIMIT' }
      });
      client.ws.close();
      return false;
    }
    return true;
  }

  // --- Matchmaking Queue ---
  public joinQueue(client: ConnectedClient, characterClass: CharacterClass) {
    client.characterClass = characterClass;
    if (this.queue.some(q => q.client.userId === client.userId)) {
      return;
    }
    this.queue.push({ client, joinedAt: Date.now() });
    this.broadcastQueueStatus();
    this.processMatchmakingQueue();
  }

  public leaveQueue(client: ConnectedClient) {
    const idx = this.queue.findIndex(q => q.client.userId === client.userId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.send(client.ws, {
        type: 'QUEUE_STATUS',
        payload: { inQueue: false, playersInQueue: this.queue.length }
      });
      this.broadcastQueueStatus();
    }
  }

  private broadcastQueueStatus() {
    for (const q of this.queue) {
      this.send(q.client.ws, {
        type: 'QUEUE_STATUS',
        payload: { inQueue: true, playersInQueue: this.queue.length }
      });
    }
  }

  private processMatchmakingQueue() {
    if (this.queue.length < MIN_PLAYERS_TO_START) return;

    // Filter alive sockets
    this.queue = this.queue.filter(q => q.client.ws.readyState === WebSocket.OPEN);
    if (this.queue.length < MIN_PLAYERS_TO_START) return;

    // Sort queue by MMR
    this.queue.sort((a, b) => {
      const userA = dbStore.getUserById(a.client.userId);
      const userB = dbStore.getUserById(b.client.userId);
      return (userA?.mmr || 1000) - (userB?.mmr || 1000);
    });

    // Take up to 4 players whose MMR is within +/- 250
    const matched: ConnectedClient[] = [];
    const baseMMR = dbStore.getUserById(this.queue[0].client.userId)?.mmr || 1000;

    for (let i = 0; i < this.queue.length && matched.length < MAX_PLAYERS_PER_ROOM; i++) {
      const candidate = this.queue[i].client;
      const mmr = dbStore.getUserById(candidate.userId)?.mmr || 1000;
      if (Math.abs(mmr - baseMMR) <= 300 || matched.length < MIN_PLAYERS_TO_START) {
        matched.push(candidate);
      }
    }

    if (matched.length >= MIN_PLAYERS_TO_START) {
      // Remove matched from queue
      const matchedIds = new Set(matched.map(m => m.userId));
      this.queue = this.queue.filter(q => !matchedIds.has(q.client.userId));
      this.broadcastQueueStatus();

      // Create quick match room
      const roomCode = this.generateRoomCode();
      const room = this.createRoomInternal(roomCode, false);

      matched.forEach((c, idx) => {
        c.roomCode = roomCode;
        room.players.set(c.userId, {
          client: c,
          name: c.name,
          characterClass: c.characterClass,
          isReady: true, // Auto-ready in quick match
          isHost: idx === 0,
          isConnected: true,
          sessionToken: c.sessionToken
        });
        room.gameLoop.addPlayer(c.userId, c.name, c.characterClass);
      });

      this.broadcastRoomUpdate(room);
      this.startCountdown(room);
    }
  }

  // --- Rooms Management ---
  public createPrivateRoom(client: ConnectedClient, characterClass: CharacterClass): string {
    if (client.roomCode) {
      this.leaveRoom(client);
    }

    client.characterClass = characterClass;
    const roomCode = this.generateRoomCode();
    const room = this.createRoomInternal(roomCode, true);

    client.roomCode = roomCode;
    room.players.set(client.userId, {
      client,
      name: client.name,
      characterClass,
      isReady: false,
      isHost: true,
      isConnected: true,
      sessionToken: client.sessionToken
    });

    room.gameLoop.addPlayer(client.userId, client.name, characterClass);
    this.broadcastRoomUpdate(room);
    return roomCode;
  }

  public joinRoom(client: ConnectedClient, code: string, characterClass: CharacterClass): boolean {
    const cleanCode = code.toUpperCase().trim();
    const room = this.rooms.get(cleanCode);

    if (!room) {
      this.send(client.ws, { type: 'ERROR', payload: { message: 'Xona topilmadi!' } });
      return false;
    }

    if (room.gameLoop.matchState === 'in_progress') {
      this.send(client.ws, { type: 'ERROR', payload: { message: 'Xonada o‘yin allaqachon boshlangan!' } });
      return false;
    }

    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      this.send(client.ws, { type: 'ERROR', payload: { message: 'Xona to‘lgan (maksimal 4 kishi)!' } });
      return false;
    }

    if (client.roomCode) {
      this.leaveRoom(client);
    }

    client.roomCode = cleanCode;
    client.characterClass = characterClass;

    room.players.set(client.userId, {
      client,
      name: client.name,
      characterClass,
      isReady: false,
      isHost: room.players.size === 0,
      isConnected: true,
      sessionToken: client.sessionToken
    });

    room.gameLoop.addPlayer(client.userId, client.name, characterClass);
    this.broadcastRoomUpdate(room);
    return true;
  }

  public setReady(client: ConnectedClient, ready: boolean) {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    const p = room.players.get(client.userId);
    if (!p) return;

    p.isReady = ready;
    this.broadcastRoomUpdate(room);

    // Check if everyone is ready
    const allPlayers = Array.from(room.players.values());
    const allReady = allPlayers.length >= MIN_PLAYERS_TO_START && allPlayers.every(pl => pl.isReady);

    if (allReady && room.gameLoop.matchState === 'waiting' && !room.countdownTimer) {
      this.startCountdown(room);
    } else if (!allReady && room.countdownTimer) {
      this.cancelCountdown(room);
    }
  }

  public changeClass(client: ConnectedClient, characterClass: CharacterClass) {
    client.characterClass = characterClass;
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room || room.gameLoop.matchState !== 'waiting') return;

    const p = room.players.get(client.userId);
    if (p) {
      p.characterClass = characterClass;
      // Also update in game loop
      const loopPlayer = room.gameLoop.getPlayer(client.userId);
      if (loopPlayer) {
        loopPlayer.characterClass = characterClass;
        loopPlayer.hp = characterClass === 'warrior' ? 150 : (characterClass === 'rogue' ? 100 : 90);
        loopPlayer.maxHp = loopPlayer.hp;
      }
      this.broadcastRoomUpdate(room);
    }
  }

  public leaveRoom(client: ConnectedClient) {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    const wasHost = room.players.get(client.userId)?.isHost;
    room.players.delete(client.userId);
    room.gameLoop.removePlayer(client.userId);
    client.roomCode = null;

    if (room.countdownTimer) {
      this.cancelCountdown(room);
    }

    if (room.players.size === 0) {
      room.gameLoop.stop();
      this.rooms.delete(room.code);
    } else {
      // Reassign host if necessary
      if (wasHost) {
        const firstRemaining = room.players.values().next().value;
        if (firstRemaining) firstRemaining.isHost = true;
      }
      this.broadcastRoomUpdate(room);

      // If in progress and only 1 player left, finish match
      if (room.gameLoop.matchState === 'in_progress' && room.players.size === 1) {
        room.gameLoop.finishMatch('forfeit');
      }
    }
  }

  // --- Countdown & Match Start ---
  private startCountdown(room: ManagedRoom) {
    room.countdownSeconds = 3;
    room.gameLoop.matchState = 'countdown';

    const tickCountdown = () => {
      this.broadcastToRoom(room, {
        type: 'ROOM_UPDATE',
        payload: {
          ...this.getRoomDetails(room),
          countdown: room.countdownSeconds
        }
      });

      if (room.countdownSeconds <= 0) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        room.countdownTimer = undefined;
        this.startMatch(room);
      } else {
        room.countdownSeconds--;
      }
    };

    tickCountdown();
    room.countdownTimer = setInterval(tickCountdown, 1000);
  }

  private cancelCountdown(room: ManagedRoom) {
    if (room.countdownTimer) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = undefined;
    }
    room.gameLoop.matchState = 'waiting';
    this.broadcastRoomUpdate(room);
  }

  private startMatch(room: ManagedRoom) {
    const roomDetails = this.getRoomDetails(room);
    this.broadcastToRoom(room, {
      type: 'MATCH_START',
      payload: {
        roomCode: room.code,
        players: roomDetails.players
      }
    });

    room.gameLoop.start();
  }

  // --- Disconnect & Reconnect Handling ---
  public handlePlayerDisconnect(client: ConnectedClient) {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room) return;

    const p = room.players.get(client.userId);
    if (!p) return;

    p.isConnected = false;
    p.client = undefined;
    this.broadcastRoomUpdate(room);

    // If match is still waiting, just remove them
    if (room.gameLoop.matchState === 'waiting' || room.gameLoop.matchState === 'countdown') {
      this.leaveRoom(client);
      return;
    }

    // If match is in progress, give 45-second grace period for Reconnect
    if (room.gameLoop.matchState === 'in_progress') {
      console.log(`[Disconnect] Player ${p.name} disconnected. Starting 45s grace timer for room ${room.code}`);
      p.disconnectTimeout = setTimeout(() => {
        console.log(`[Disconnect] Grace period expired for ${p.name}. Forfeit!`);
        this.leaveRoom(client);
      }, RECONNECT_TIMEOUT_SEC * 1000);
    }
  }

  public reconnect(client: ConnectedClient, sessionToken: string, roomCode: string): boolean {
    const cleanCode = roomCode.toUpperCase().trim();
    const room = this.rooms.get(cleanCode);

    if (!room) {
      this.send(client.ws, {
        type: 'ERROR',
        payload: { message: 'Xona topilmadi yoki o‘yin yakunlangan!' }
      });
      return false;
    }

    // Find player by sessionToken
    let matchedPlayerId: string | null = null;
    for (const [id, pl] of room.players.entries()) {
      if (pl.sessionToken === sessionToken) {
        matchedPlayerId = id;
        break;
      }
    }

    if (!matchedPlayerId) {
      this.send(client.ws, {
        type: 'ERROR',
        payload: { message: 'Qayta ulanish tokeni mos kelmadi!' }
      });
      return false;
    }

    const p = room.players.get(matchedPlayerId)!;
    if (p.disconnectTimeout) {
      clearTimeout(p.disconnectTimeout);
      p.disconnectTimeout = undefined;
    }

    // Update client references
    client.userId = matchedPlayerId;
    client.name = p.name;
    client.characterClass = p.characterClass;
    client.sessionToken = sessionToken;
    client.roomCode = cleanCode;

    p.client = client;
    p.isConnected = true;

    this.send(client.ws, {
      type: 'RECONNECT_SUCCESS',
      payload: { room: this.getRoomDetails(room) }
    });

    this.broadcastRoomUpdate(room);
    return true;
  }

  // --- Packet Routing ---
  public handleInput(client: ConnectedClient, input: InputPayload) {
    if (!client.roomCode) return;
    const room = this.rooms.get(client.roomCode);
    if (!room || room.gameLoop.matchState !== 'in_progress') return;

    room.gameLoop.queueInput(client.userId, input);
  }

  // --- Internal Helpers ---
  private createRoomInternal(code: string, isPrivate: boolean): ManagedRoom {
    const gameLoop = new GameLoop(
      code,
      (snapshot: GameStateSnapshot) => {
        const r = this.rooms.get(code);
        if (r) this.broadcastToRoom(r, { type: 'SNAPSHOT', payload: snapshot });
      },
      (event: CombatEvent) => {
        const r = this.rooms.get(code);
        if (r) this.broadcastToRoom(r, { type: 'COMBAT_EVENT', payload: event });
      },
      (result: MatchResultData) => {
        const r = this.rooms.get(code);
        if (r) {
          this.broadcastToRoom(r, { type: 'MATCH_END', payload: result });
          this.broadcastRoomUpdate(r);
        }
      }
    );

    const room: ManagedRoom = {
      code,
      isPrivate,
      gameLoop,
      players: new Map(),
      countdownSeconds: 0
    };

    this.rooms.set(code, room);
    return room;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return this.rooms.has(code) ? this.generateRoomCode() : code;
  }

  private getRoomDetails(room: ManagedRoom): RoomDetails {
    const playersList: RoomPlayer[] = Array.from(room.players.entries()).map(([id, p]) => {
      const user = dbStore.getUserById(id);
      return {
        id,
        name: p.name,
        characterClass: p.characterClass,
        isReady: p.isReady,
        isHost: p.isHost,
        isConnected: p.isConnected,
        mmr: user ? user.mmr : 1000
      };
    });

    return {
      code: room.code,
      isPrivate: room.isPrivate,
      status: room.gameLoop.matchState,
      players: playersList,
      countdown: room.countdownSeconds > 0 ? room.countdownSeconds : undefined
    };
  }

  public broadcastRoomUpdate(room: ManagedRoom) {
    this.broadcastToRoom(room, {
      type: 'ROOM_UPDATE',
      payload: this.getRoomDetails(room)
    });
  }

  public broadcastToRoom(room: ManagedRoom, packet: ServerPacket) {
    for (const p of room.players.values()) {
      if (p.client && p.client.ws && p.client.ws.readyState === WebSocket.OPEN) {
        this.send(p.client.ws, packet);
      }
    }
  }

  public send(ws: WebSocket, packet: ServerPacket) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  }
}

export const roomManager = new RoomManager();

