import { CharacterClass, CHARACTERS } from '../../../shared/characters';
import { ARENA_WIDTH, ARENA_HEIGHT, RESPAWN_DELAY_SEC, SPAWN_SHIELD_SEC } from '../../../shared/constants';
import { Projectile, ActiveVisualEffect, FloatingText, GameStateSnapshot, PlayerSnapshot } from '../../../shared/types';
import { Physics } from '../../../server/game/Physics';
import { CombatSystem, ServerPlayer, CombatEvent } from '../../../server/game/CombatSystem';
import { inputManager } from './Input';

export class LocalMode {
  public isActive: boolean = false;
  private p1: ServerPlayer | null = null;
  private p2: ServerPlayer | null = null;
  private projectiles: Projectile[] = [];
  private effects: ActiveVisualEffect[] = [];
  public floatingTexts: FloatingText[] = [];

  public p1Class: CharacterClass = 'warrior';
  public p2Class: CharacterClass = 'rogue';
  public roundTimeRemaining: number = 180;
  private matchEnded: boolean = false;

  public start(p1Class: CharacterClass, p2Class: CharacterClass) {
    this.isActive = true;
    this.matchEnded = false;
    this.p1Class = p1Class;
    this.p2Class = p2Class;
    this.roundTimeRemaining = 180;
    this.projectiles = [];
    this.effects = [];
    this.floatingTexts = [];

    const cfg1 = CHARACTERS[p1Class];
    const cfg2 = CHARACTERS[p2Class];

    this.p1 = {
      id: 'local_p1',
      name: 'P1 (' + cfg1.name + ')',
      characterClass: p1Class,
      x: 250,
      y: 400,
      vx: 0,
      vy: 0,
      facingAngle: 0,
      hp: cfg1.hp,
      maxHp: cfg1.hp,
      isAlive: true,
      spawnShieldTimer: 2.0,
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

    this.p2 = {
      id: 'local_p2',
      name: 'P2 (' + cfg2.name + ')',
      characterClass: p2Class,
      x: 950,
      y: 400,
      vx: 0,
      vy: 0,
      facingAngle: Math.PI,
      hp: cfg2.hp,
      maxHp: cfg2.hp,
      isAlive: true,
      spawnShieldTimer: 2.0,
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
  }

  public stop() {
    this.isActive = false;
  }

  public update(dt: number) {
    if (!this.isActive || !this.p1 || !this.p2) return;

    this.roundTimeRemaining = Math.max(0, this.roundTimeRemaining - dt);
    const players = [this.p1, this.p2];
    const combatEvents: CombatEvent[] = [];

    // --- Player 1 Input ---
    if (this.p1.isAlive) {
      const inp1 = inputManager.getP1Input(this.p1, 0);
      this.p1.facingAngle = inp1.facingAngle;
      if (inp1.action) {
        CombatSystem.handleAction(this.p1, inp1.action, players, this.projectiles, this.effects, combatEvents);
      }
      if (this.p1.dashTimer <= 0) {
        const cfg1 = CHARACTERS[this.p1.characterClass];
        this.p1.vx = inp1.dx * cfg1.speed;
        this.p1.vy = inp1.dy * cfg1.speed;
      }
    }

    // --- Player 2 Input ---
    if (this.p2.isAlive) {
      const inp2 = inputManager.getP2Input(this.p2, this.p1, 0);
      this.p2.facingAngle = inp2.facingAngle;
      if (inp2.action) {
        CombatSystem.handleAction(this.p2, inp2.action, players, this.projectiles, this.effects, combatEvents);
      }
      if (this.p2.dashTimer <= 0) {
        const cfg2 = CHARACTERS[this.p2.characterClass];
        this.p2.vx = inp2.dx * cfg2.speed;
        this.p2.vy = inp2.dy * cfg2.speed;
      }
    }

    // --- Advance Physics & Timers for Both ---
    for (const p of players) {
      const cfg = CHARACTERS[p.characterClass];

      if (p.isAlive) {
        if (p.dashTimer > 0) {
          p.dashTimer = Math.max(0, p.dashTimer - dt);
          p.x += p.dashVx * dt;
          p.y += p.dashVy * dt;
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }

        const resolved = Physics.resolveWorldCollision({ x: p.x, y: p.y }, cfg.radius);
        p.x = resolved.x;
        p.y = resolved.y;

        if (p.spawnShieldTimer > 0) p.spawnShieldTimer = Math.max(0, p.spawnShieldTimer - dt);
        p.cooldowns.light = Math.max(0, p.cooldowns.light - dt);
        p.cooldowns.heavy = Math.max(0, p.cooldowns.heavy - dt);
        p.cooldowns.special = Math.max(0, p.cooldowns.special - dt);
        p.cooldowns.dodge = Math.max(0, p.cooldowns.dodge - dt);
      }
    }

    // Resolve Overlap
    if (this.p1.isAlive && this.p2.isAlive) {
      const c1 = CHARACTERS[this.p1.characterClass];
      const c2 = CHARACTERS[this.p2.characterClass];
      const overlap = Physics.resolvePlayerOverlap(
        { x: this.p1.x, y: this.p1.y, radius: c1.radius },
        { x: this.p2.x, y: this.p2.y, radius: c2.radius }
      );
      this.p1.x += overlap.p1Offset.x;
      this.p1.y += overlap.p1Offset.y;
      this.p2.x += overlap.p2Offset.x;
      this.p2.y += overlap.p2Offset.y;
    }

    // Update projectiles
    CombatSystem.updateProjectiles(dt, this.projectiles, players, this.effects, combatEvents);

    // Update respawns
    CombatSystem.handleRespawns(dt, players, combatEvents);

    // Process combat events into floating text
    for (const ev of combatEvents) {
      if (ev.eventType === 'hit' && ev.x && ev.y) {
        this.floatingTexts.push({
          id: 'ft_' + Math.random().toString(36).substring(2, 7),
          text: ev.text,
          x: ev.x,
          y: ev.y,
          color: '#fbbf24',
          size: 20,
          createdAt: Date.now(),
          duration: 0.8
        });
      } else if (ev.eventType === 'kill' && ev.x && ev.y) {
        this.floatingTexts.push({
          id: 'ft_' + Math.random().toString(36).substring(2, 7),
          text: 'K.O.!',
          x: ev.x,
          y: ev.y - 30,
          color: '#ef4444',
          size: 28,
          createdAt: Date.now(),
          duration: 1.5
        });
      }
    }

    // Clean up expired visual effects
    const now = Date.now();
    this.effects = this.effects.filter(fx => (now - fx.createdAt) / 1000 < fx.duration);
    this.floatingTexts = this.floatingTexts.filter(ft => (now - ft.createdAt) / 1000 < ft.duration);
  }

  public getSnapshot(): GameStateSnapshot {
    const playerSnapshots: PlayerSnapshot[] = [];
    if (this.p1) playerSnapshots.push(this.toSnapshot(this.p1));
    if (this.p2) playerSnapshots.push(this.toSnapshot(this.p2));

    return {
      tick: 0,
      timestamp: Date.now(),
      matchState: 'in_progress',
      timeRemaining: Math.ceil(this.roundTimeRemaining),
      players: playerSnapshots,
      projectiles: this.projectiles,
      effects: this.effects,
      lastProcessedInputSeq: {}
    };
  }

  public getP1(): ServerPlayer | null {
    return this.p1;
  }

  public getP2(): ServerPlayer | null {
    return this.p2;
  }

  private toSnapshot(p: ServerPlayer): PlayerSnapshot {
    const cfg = CHARACTERS[p.characterClass];
    return {
      id: p.id,
      name: p.name,
      characterClass: p.characterClass,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
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
      ping: 0,
      cooldowns: { ...p.cooldowns },
      color: cfg.color
    };
  }
}

export const localMode = new LocalMode();

