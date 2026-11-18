import { CHARACTERS } from '../../shared/characters';
import { RESPAWN_DELAY_SEC, SPAWN_SHIELD_SEC, SPAWN_POINTS } from '../../shared/constants';
import { SkillSlot, ActiveVisualEffect, Projectile } from '../../shared/types';
import { Physics } from './Physics';

export interface ServerPlayer {
  id: string;
  name: string;
  characterClass: 'warrior' | 'rogue' | 'mage';
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingAngle: number;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  spawnShieldTimer: number; // seconds remaining
  dashTimer: number; // seconds remaining
  dashVx: number;
  dashVy: number;
  respawnTimer: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  ping: number;
  lastActionTime: number;
  cooldowns: {
    light: number;
    heavy: number;
    special: number;
    dodge: number;
  };
  lastInputSeq: number;
}

export interface CombatEvent {
  eventType: 'hit' | 'kill' | 'respawn';
  text: string;
  x?: number;
  y?: number;
  damage?: number;
}

export class CombatSystem {
  /**
   * Executes a requested skill action by a player.
   */
  public static handleAction(
    player: ServerPlayer,
    action: SkillSlot,
    allPlayers: ServerPlayer[],
    projectiles: Projectile[],
    effects: ActiveVisualEffect[],
    events: CombatEvent[]
  ): { success: boolean; reason?: string } {
    if (!player.isAlive) {
      return { success: false, reason: 'Player is dead' };
    }

    if (player.cooldowns[action] > 0) {
      return { success: false, reason: `Action on cooldown: ${player.cooldowns[action].toFixed(1)}s remaining` };
    }

    const cfg = CHARACTERS[player.characterClass];
    const enemies = allPlayers.filter(p => p.id !== player.id && p.isAlive);

    if (action === 'dodge') {
      const dodgeCfg = cfg.skills.dodge;
      player.cooldowns.dodge = dodgeCfg.cooldown;
      player.dashTimer = dodgeCfg.duration;

      // Determine dash direction from facing angle or current velocity
      let dirX = Math.cos(player.facingAngle);
      let dirY = Math.sin(player.facingAngle);
      if (Math.hypot(player.vx, player.vy) > 10) {
        const len = Math.hypot(player.vx, player.vy);
        dirX = player.vx / len;
        dirY = player.vy / len;
      }

      const speed = dodgeCfg.distance / dodgeCfg.duration;
      player.dashVx = dirX * speed;
      player.dashVy = dirY * speed;

      effects.push({
        id: 'fx_' + Math.random().toString(36).substring(2, 8),
        type: 'dash',
        x: player.x,
        y: player.y,
        angle: Math.atan2(dirY, dirX),
        color: cfg.accentColor,
        duration: dodgeCfg.duration,
        createdAt: Date.now()
      });

      return { success: true };
    }

    if (action === 'light') {
      const skill = cfg.skills.light;
      player.cooldowns.light = skill.cooldown;

      if (player.characterClass === 'mage') {
        // Projectile attack
        const speed = skill.projectileSpeed || 550;
        const dirX = Math.cos(player.facingAngle);
        const dirY = Math.sin(player.facingAngle);
        projectiles.push({
          id: 'proj_' + Math.random().toString(36).substring(2, 8),
          ownerId: player.id,
          x: player.x + dirX * (player.characterClass === 'mage' ? 25 : 30),
          y: player.y + dirY * (player.characterClass === 'mage' ? 25 : 30),
          vx: dirX * speed,
          vy: dirY * speed,
          radius: skill.radius || 12,
          damage: skill.damage,
          maxDistance: skill.range || 420,
          traveled: 0,
          color: '#3498db'
        });
      } else {
        // Melee slash / dagger thrust
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'slash',
          x: player.x,
          y: player.y,
          angle: player.facingAngle,
          radius: skill.radius || 60,
          color: cfg.accentColor,
          duration: 0.15,
          createdAt: Date.now()
        });

        const arc = player.characterClass === 'warrior' ? Math.PI * 0.7 : Math.PI * 0.5;
        for (const enemy of enemies) {
          if (Physics.isTargetInSector(player, player.facingAngle, arc, skill.radius || 60, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      }

      return { success: true };
    }

    if (action === 'heavy') {
      const skill = cfg.skills.heavy;
      player.cooldowns.heavy = skill.cooldown;

      if (player.characterClass === 'warrior') {
        // Shield Bash with knockback
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'slash',
          x: player.x,
          y: player.y,
          angle: player.facingAngle,
          radius: skill.radius || 60,
          color: '#f39c12',
          duration: 0.2,
          createdAt: Date.now()
        });

        for (const enemy of enemies) {
          if (Physics.isTargetInSector(player, player.facingAngle, Math.PI * 0.6, skill.radius || 60, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
            // Apply knockback
            const kbDist = skill.knockback || 220;
            const dirX = Math.cos(player.facingAngle);
            const dirY = Math.sin(player.facingAngle);
            const targetPos = Physics.resolveWorldCollision(
              { x: enemy.x + dirX * kbDist, y: enemy.y + dirY * kbDist },
              22
            );
            enemy.x = targetPos.x;
            enemy.y = targetPos.y;
          }
        }
      } else if (player.characterClass === 'rogue') {
        // Dual Slice (fast double strike)
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'slash',
          x: player.x,
          y: player.y,
          angle: player.facingAngle,
          radius: skill.radius || 55,
          color: '#2ecc71',
          duration: 0.2,
          createdAt: Date.now()
        });

        for (const enemy of enemies) {
          if (Physics.isTargetInSector(player, player.facingAngle, Math.PI * 0.8, skill.radius || 55, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      } else if (player.characterClass === 'mage') {
        // Explosive Wave (AoE burst 120px in front)
        const offset = skill.range || 120;
        const blastX = player.x + Math.cos(player.facingAngle) * offset;
        const blastY = player.y + Math.sin(player.facingAngle) * offset;
        const blastCenter = Physics.resolveWorldCollision({ x: blastX, y: blastY }, 10);

        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'explosion',
          x: blastCenter.x,
          y: blastCenter.y,
          radius: skill.aoeRadius || 85,
          color: '#9b59b6',
          duration: 0.35,
          createdAt: Date.now()
        });

        for (const enemy of enemies) {
          if (Physics.isTargetInCircle(blastCenter, skill.aoeRadius || 85, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      }

      return { success: true };
    }

    if (action === 'special') {
      const skill = cfg.skills.special;
      player.cooldowns.special = skill.cooldown;

      if (player.characterClass === 'warrior') {
        // Whirlwind: 360 AoE
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'whirlwind',
          x: player.x,
          y: player.y,
          radius: skill.radius || 100,
          color: '#e74c3c',
          duration: skill.duration || 0.5,
          createdAt: Date.now()
        });

        for (const enemy of enemies) {
          if (Physics.isTargetInCircle(player, skill.radius || 100, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      } else if (player.characterClass === 'rogue') {
        // Shadow Step: Teleport 250px in facing direction + strike
        const stepDist = skill.range || 250;
        const dirX = Math.cos(player.facingAngle);
        const dirY = Math.sin(player.facingAngle);

        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'teleport',
          x: player.x,
          y: player.y,
          color: '#1abc9c',
          duration: 0.2,
          createdAt: Date.now()
        });

        const newPos = Physics.resolveWorldCollision(
          { x: player.x + dirX * stepDist, y: player.y + dirY * stepDist },
          20
        );
        player.x = newPos.x;
        player.y = newPos.y;

        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'slash',
          x: player.x,
          y: player.y,
          angle: player.facingAngle,
          radius: skill.radius || 60,
          color: '#2ecc71',
          duration: 0.25,
          createdAt: Date.now()
        });

        // Strike targets around destination
        for (const enemy of enemies) {
          if (Physics.isTargetInCircle(player, skill.radius || 60, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      } else if (player.characterClass === 'mage') {
        // Arcane Laser: 680px straight piercing beam
        const beamLen = skill.range || 680;
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'laser',
          x: player.x,
          y: player.y,
          angle: player.facingAngle,
          length: beamLen,
          color: '#00d2d3',
          duration: skill.duration || 0.35,
          createdAt: Date.now()
        });

        for (const enemy of enemies) {
          if (Physics.isTargetInBeam(player, player.facingAngle, beamLen, 40, enemy, 22)) {
            this.applyDamage(player, enemy, skill.damage, events);
          }
        }
      }

      return { success: true };
    }

    return { success: false, reason: 'Unknown action' };
  }

  /**
   * Applies damage to target player with invulnerability/shield checks.
   */
  public static applyDamage(
    attacker: ServerPlayer,
    target: ServerPlayer,
    damage: number,
    events: CombatEvent[]
  ): boolean {
    if (!target.isAlive) return false;
    // Check spawn shield & dodge i-frames
    if (target.spawnShieldTimer > 0 || target.dashTimer > 0) {
      return false; // Invulnerable!
    }

    target.hp = Math.max(0, target.hp - damage);
    attacker.damageDealt += damage;

    events.push({
      eventType: 'hit',
      text: `-${damage}`,
      x: target.x,
      y: target.y - 20,
      damage
    });

    if (target.hp <= 0) {
      target.isAlive = false;
      target.deaths += 1;
      target.respawnTimer = RESPAWN_DELAY_SEC;
      attacker.kills += 1;

      events.push({
        eventType: 'kill',
        text: `${attacker.name} eliminated ${target.name}!`,
        x: target.x,
        y: target.y
      });
    }

    return true;
  }

  /**
   * Updates projectile positions and checks collisions.
   */
  public static updateProjectiles(
    dt: number,
    projectiles: Projectile[],
    allPlayers: ServerPlayer[],
    effects: ActiveVisualEffect[],
    events: CombatEvent[]
  ) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const moveDist = Math.hypot(p.vx * dt, p.vy * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += moveDist;

      // Check max distance or collision with obstacles/walls
      if (p.traveled >= p.maxDistance || Physics.isCircleCollidingWithObstacles(p.x, p.y, p.radius)) {
        effects.push({
          id: 'fx_' + Math.random().toString(36).substring(2, 8),
          type: 'hit',
          x: p.x,
          y: p.y,
          color: p.color,
          duration: 0.15,
          createdAt: Date.now()
        });
        projectiles.splice(i, 1);
        continue;
      }

      // Check hit against enemy players
      const attacker = allPlayers.find(pl => pl.id === p.ownerId);
      let hit = false;

      for (const enemy of allPlayers) {
        if (enemy.id !== p.ownerId && enemy.isAlive) {
          const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
          if (dist <= p.radius + 22) {
            if (attacker) {
              this.applyDamage(attacker, enemy, p.damage, events);
            }
            effects.push({
              id: 'fx_' + Math.random().toString(36).substring(2, 8),
              type: 'hit',
              x: p.x,
              y: p.y,
              color: p.color,
              duration: 0.2,
              createdAt: Date.now()
            });
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        projectiles.splice(i, 1);
      }
    }
  }

  /**
   * Respawns dead players whose respawn timer expired at the safest corner.
   */
  public static handleRespawns(
    dt: number,
    players: ServerPlayer[],
    events: CombatEvent[]
  ) {
    for (const player of players) {
      if (!player.isAlive) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          // Find safest spawn point (furthest average or minimum distance to living enemies)
          const livingEnemies = players.filter(p => p.id !== player.id && p.isAlive);
          let bestSpawn = SPAWN_POINTS[0];
          let maxMinDist = -1;

          for (const sp of SPAWN_POINTS) {
            let minDistToEnemy = 99999;
            for (const enemy of livingEnemies) {
              const d = Math.hypot(enemy.x - sp.x, enemy.y - sp.y);
              if (d < minDistToEnemy) minDistToEnemy = d;
            }
            if (minDistToEnemy > maxMinDist) {
              maxMinDist = minDistToEnemy;
              bestSpawn = sp;
            }
          }

          player.x = bestSpawn.x;
          player.y = bestSpawn.y;
          player.vx = 0;
          player.vy = 0;
          player.hp = player.maxHp;
          player.isAlive = true;
          player.spawnShieldTimer = SPAWN_SHIELD_SEC;
          player.respawnTimer = 0;

          // Reset cooldowns
          player.cooldowns = { light: 0, heavy: 0, special: 0, dodge: 0 };

          events.push({
            eventType: 'respawn',
            text: `${player.name} respawned!`,
            x: player.x,
            y: player.y
          });
        }
      }
    }
  }
}

