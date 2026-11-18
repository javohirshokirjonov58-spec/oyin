import {
  TICK_RATE,
  TICK_INTERVAL_MS,
  TICK_DT,
  MATCH_DURATION_SEC,
  TARGET_KILLS_TO_WIN,
  SPAWN_POINTS,
  MMR_RULES
} from '../../shared/constants';
import { CHARACTERS } from '../../shared/characters';
import {
  GameStateSnapshot,
  PlayerSnapshot,
  InputPayload,
  SkillSlot,
  Projectile,
  ActiveVisualEffect,
  MatchStatus,
  MatchResultPlayer,
  MatchResultData
} from '../../shared/types';
import { Physics } from './Physics';
import { CombatSystem, ServerPlayer, CombatEvent } from './CombatSystem';
import { dbStore } from '../db/store';

export class GameLoop {
  public roomCode: string;
  public matchState: MatchStatus = 'waiting';
  public timeRemaining: number = MATCH_DURATION_SEC;
  public tickCount: number = 0;

  private timerInterval: any = null;
  private players: Map<string, ServerPlayer> = new Map();
  private pendingInputs: Map<string, InputPayload[]> = new Map();
  private projectiles: Projectile[] = [];
  private effects: ActiveVisualEffect[] = [];
  private lastProcessedInputSeq: Record<string, number> = {};

  // Callbacks
  private onBroadcastSnapshot: (snapshot: GameStateSnapshot) => void;
  private onBroadcastEvent: (event: CombatEvent) => void;
  private onMatchEnd: (result: MatchResultData) => void;

  constructor(
    roomCode: string,
    onBroadcastSnapshot: (snapshot: GameStateSnapshot) => void,
    onBroadcastEvent: (event: CombatEvent) => void,
    onMatchEnd: (result: MatchResultData) => void
  ) {
    this.roomCode = roomCode;
    this.onBroadcastSnapshot = onBroadcastSnapshot;
    this.onBroadcastEvent = onBroadcastEvent;
    this.onMatchEnd = onMatchEnd;
  }

  public addPlayer(id: string, name: string, characterClass: 'warrior' | 'rogue' | 'mage'): ServerPlayer {
    const cfg = CHARACTERS[characterClass];
    const spawnIndex = this.players.size % SPAWN_POINTS.length;
    const spawn = SPAWN_POINTS[spawnIndex];

    const player: ServerPlayer = {
      id,
      name,
      characterClass,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facingAngle: 0,
      hp: cfg.hp,
      maxHp: cfg.hp,
      isAlive: true,
      spawnShieldTimer: 0,
      dashTimer: 0,
      dashVx: 0,
      dashVy: 0,
      respawnTimer: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      ping: 0,
      lastActionTime: 0,
      cooldowns: { light: 0, heavy: 0, special: 0, dodge: 0 },
      lastInputSeq: 0
    };

    this.players.set(id, player);
    this.pendingInputs.set(id, []);
    this.lastProcessedInputSeq[id] = 0;

    return player;
  }

  public removePlayer(id: string) {
    this.players.delete(id);
    this.pendingInputs.delete(id);
    delete this.lastProcessedInputSeq[id];
  }

  public getPlayer(id: string): ServerPlayer | undefined {
    return this.players.get(id);
  }

  public getPlayersCount(): number {
    return this.players.size;
  }

  public queueInput(id: string, input: InputPayload) {
    const list = this.pendingInputs.get(id);
    if (list) {
      // Keep queue bounded
      if (list.length < 20) {
        list.push(input);
      }
    }
  }

  public start() {
    this.matchState = 'in_progress';
    this.timeRemaining = MATCH_DURATION_SEC;
    this.tickCount = 0;
    this.projectiles = [];
    this.effects = [];

    // Reset player states & give initial shield
    let i = 0;
    for (const player of this.players.values()) {
      const sp = SPAWN_POINTS[i % SPAWN_POINTS.length];
      i++;
      player.x = sp.x;
      player.y = sp.y;
      player.vx = 0;
      player.vy = 0;
      player.hp = player.maxHp;
      player.isAlive = true;
      player.kills = 0;
      player.deaths = 0;
      player.damageDealt = 0;
      player.spawnShieldTimer = 2.0;
      player.respawnTimer = 0;
      player.dashTimer = 0;
      player.cooldowns = { light: 0, heavy: 0, special: 0, dodge: 0 };
    }

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  public stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.matchState = 'ended';
  }

  private tick() {
    if (this.matchState !== 'in_progress') return;

    this.tickCount++;
    const dt = TICK_DT;
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    const playerList = Array.from(this.players.values());
    const combatEvents: CombatEvent[] = [];

    // 1. Process player inputs & movement
    for (const player of playerList) {
      if (!player.isAlive) {
        // Discard inputs while dead
        this.pendingInputs.set(player.id, []);
        continue;
      }

      const inputs = this.pendingInputs.get(player.id) || [];
      const cfg = CHARACTERS[player.characterClass];

      while (inputs.length > 0) {
        const input = inputs.shift()!;
        player.lastInputSeq = input.seq;
        this.lastProcessedInputSeq[player.id] = input.seq;

        // Update facing direction
        if (typeof input.facingAngle === 'number') {
          player.facingAngle = input.facingAngle;
        }

        // Handle requested action
        if (input.action) {
          CombatSystem.handleAction(
            player,
            input.action,
            playerList,
            this.projectiles,
            this.effects,
            combatEvents
          );
        }

        // Apply movement vector if not currently dashing
        if (player.dashTimer <= 0) {
          let mag = Math.hypot(input.dx, input.dy);
          if (mag > 0.01) {
            // Anti-cheat: normalize if client sent magnitude > 1
            const normX = (input.dx / Math.max(1, mag));
            const normY = (input.dy / Math.max(1, mag));
            player.vx = normX * cfg.speed;
            player.vy = normY * cfg.speed;
          } else {
            player.vx = 0;
            player.vy = 0;
          }
        }
      }

      // Update Dash state or Normal Movement
      if (player.dashTimer > 0) {
        player.dashTimer = Math.max(0, player.dashTimer - dt);
        player.x += player.dashVx * dt;
        player.y += player.dashVy * dt;
      } else {
        // Anti-cheat speed clamping: max delta pos is speed * dt
        const maxStep = cfg.speed * dt * 1.1;
        const stepX = Math.max(-maxStep, Math.min(maxStep, player.vx * dt));
        const stepY = Math.max(-maxStep, Math.min(maxStep, player.vy * dt));
        player.x += stepX;
        player.y += stepY;
      }

      // World Boundary & Obstacle collision
      const resolved = Physics.resolveWorldCollision({ x: player.x, y: player.y }, cfg.radius);
      player.x = resolved.x;
      player.y = resolved.y;

      // Decrement timers
      if (player.spawnShieldTimer > 0) {
        player.spawnShieldTimer = Math.max(0, player.spawnShieldTimer - dt);
      }
      player.cooldowns.light = Math.max(0, player.cooldowns.light - dt);
      player.cooldowns.heavy = Math.max(0, player.cooldowns.heavy - dt);
      player.cooldowns.special = Math.max(0, player.cooldowns.special - dt);
      player.cooldowns.dodge = Math.max(0, player.cooldowns.dodge - dt);
    }

    // 2. Resolve player-to-player collision (soft body push)
    for (let i = 0; i < playerList.length; i++) {
      for (let j = i + 1; j < playerList.length; j++) {
        const p1 = playerList[i];
        const p2 = playerList[j];
        if (p1.isAlive && p2.isAlive) {
          const cfg1 = CHARACTERS[p1.characterClass];
          const cfg2 = CHARACTERS[p2.characterClass];
          const overlap = Physics.resolvePlayerOverlap(
            { x: p1.x, y: p1.y, radius: cfg1.radius },
            { x: p2.x, y: p2.y, radius: cfg2.radius }
          );
          p1.x += overlap.p1Offset.x;
          p1.y += overlap.p1Offset.y;
          p2.x += overlap.p2Offset.x;
          p2.y += overlap.p2Offset.y;
        }
      }
    }

    // 3. Update projectiles & collisions
    CombatSystem.updateProjectiles(dt, this.projectiles, playerList, this.effects, combatEvents);

    // 4. Handle Respawns
    CombatSystem.handleRespawns(dt, playerList, combatEvents);

    // 5. Clean up expired visual effects
    const now = Date.now();
    this.effects = this.effects.filter(fx => (now - fx.createdAt) / 1000 < fx.duration);

    // 6. Broadcast combat events (hits, kills, respawns)
    for (const ev of combatEvents) {
      this.onBroadcastEvent(ev);
    }

    // 7. Check match completion condition
    let matchFinished = false;
    let endReason: 'time_up' | 'target_kills' | 'forfeit' = 'time_up';

    if (this.timeRemaining <= 0) {
      matchFinished = true;
      endReason = 'time_up';
    } else {
      for (const p of playerList) {
        if (p.kills >= TARGET_KILLS_TO_WIN) {
          matchFinished = true;
          endReason = 'target_kills';
          break;
        }
      }
    }

    // 8. Build & broadcast snapshot
    const snapshot: GameStateSnapshot = {
      tick: this.tickCount,
      timestamp: Date.now(),
      matchState: this.matchState,
      timeRemaining: Math.ceil(this.timeRemaining),
      players: playerList.map(p => {
        const cfg = CHARACTERS[p.characterClass];
        return {
          id: p.id,
          name: p.name,
          characterClass: p.characterClass,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          vx: Math.round(p.vx),
          vy: Math.round(p.vy),
          facingAngle: p.facingAngle,
          hp: p.hp,
          maxHp: p.maxHp,
          isAlive: p.isAlive,
          isInvulnerable: p.spawnShieldTimer > 0 || p.dashTimer > 0,
          isDashing: p.dashTimer > 0,
          respawnTimer: Math.ceil(p.respawnTimer),
          kills: p.kills,
          deaths: p.deaths,
          damageDealt: p.damageDealt,
          ping: p.ping,
          cooldowns: {
            light: Math.max(0, Math.round(p.cooldowns.light * 10) / 10),
            heavy: Math.max(0, Math.round(p.cooldowns.heavy * 10) / 10),
            special: Math.max(0, Math.round(p.cooldowns.special * 10) / 10),
            dodge: Math.max(0, Math.round(p.cooldowns.dodge * 10) / 10)
          },
          color: cfg.color
        };
      }),
      projectiles: this.projectiles.map(p => ({
        ...p,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10
      })),
      effects: this.effects,
      lastProcessedInputSeq: { ...this.lastProcessedInputSeq }
    };

    this.onBroadcastSnapshot(snapshot);

    if (matchFinished) {
      this.finishMatch(endReason);
    }
  }

  public finishMatch(reason: 'time_up' | 'target_kills' | 'forfeit') {
    this.stop();

    const playerList = Array.from(this.players.values());
    // Sort by kills DESC, then damageDealt DESC, then deaths ASC
    const sorted = [...playerList].sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
      return a.deaths - b.deaths;
    });

    const isDuel = playerList.length === 2;
    const scoreboard: MatchResultPlayer[] = sorted.map((p, index) => {
      const rank = index + 1;
      let mmrDelta = 0;
      if (rank === 1) {
        mmrDelta = MMR_RULES.FIRST_PLACE;
      } else if (rank === 2) {
        mmrDelta = isDuel ? MMR_RULES.SECOND_PLACE_DUEL : MMR_RULES.SECOND_PLACE_MULTI;
      } else if (rank === 3) {
        mmrDelta = MMR_RULES.THIRD_PLACE;
      } else {
        mmrDelta = MMR_RULES.FOURTH_PLACE;
      }

      const user = dbStore.getUserById(p.id);
      const oldMmr = user ? user.mmr : 1000;
      const newMmr = Math.max(100, oldMmr + mmrDelta);

      return {
        id: p.id,
        name: p.name,
        characterClass: p.characterClass,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: p.damageDealt,
        rank,
        oldMmr,
        newMmr,
        mmrDelta
      };
    });

    // Save results into persistent store
    dbStore.recordMatchResults(scoreboard, 'Arena FFA');

    const winner = sorted[0];
    const result: MatchResultData = {
      roomCode: this.roomCode,
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.name : null,
      reason,
      scoreboard
    };

    this.onMatchEnd(result);
  }
}

