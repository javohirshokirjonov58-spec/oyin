import { ARENA_WIDTH, ARENA_HEIGHT, ARENA_OBSTACLES } from '../../../shared/constants';
import { CHARACTERS } from '../../../shared/characters';
import {
  GameStateSnapshot,
  PlayerSnapshot,
  FloatingText,
  Projectile,
  ActiveVisualEffect
} from '../../../shared/types';
import { InterpolatedPlayer } from '../network/Predictor';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  public debugHitboxes: boolean = false;
  public floatingTexts: FloatingText[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  public addFloatingText(text: string, x: number, y: number, color = '#fbbf24', size = 20) {
    this.floatingTexts.push({
      id: 'ft_' + Math.random().toString(36).substring(2, 7),
      text,
      x,
      y,
      color,
      size,
      createdAt: Date.now(),
      duration: 0.9
    });
  }

  public render(
    snapshot: GameStateSnapshot | null,
    interpolatedPlayers: (InterpolatedPlayer | PlayerSnapshot)[],
    localPlayerId?: string
  ) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // 1. Draw Arena Floor & Grid
    this.drawArenaBackground(ctx);

    // 2. Draw Arena Obstacles & Pillars
    this.drawObstacles(ctx);

    if (!snapshot) return;

    // 3. Draw Active Visual Effects (ground level: whirlwind, slash, laser)
    this.drawVisualEffects(ctx, snapshot.effects);

    // 4. Draw Projectiles
    this.drawProjectiles(ctx, snapshot.projectiles);

    // 5. Draw Players
    for (const player of interpolatedPlayers) {
      this.drawPlayer(ctx, player, player.id === localPlayerId);
    }

    // 6. Draw Floating Damage Numbers & Combat Text
    this.drawFloatingTexts(ctx);

    // 7. Hitbox & Collider Debug Overlay (if enabled)
    if (this.debugHitboxes) {
      this.drawDebugOverlays(ctx, interpolatedPlayers, snapshot);
    }
  }

  private drawArenaBackground(ctx: CanvasRenderingContext2D) {
    // Deep sci-fi arena gradient
    const bgGrad = ctx.createRadialGradient(
      ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 50,
      ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 700
    );
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(1, '#080b12');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Subtle Hexagonal / Grid Lines
    ctx.strokeStyle = 'rgba(79, 70, 229, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 50;

    ctx.beginPath();
    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_WIDTH, y);
    }
    ctx.stroke();

    // Center arena battle ring
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 260, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 90, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Neon Border
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, ARENA_WIDTH - 6, ARENA_HEIGHT - 6);

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, ARENA_WIDTH - 16, ARENA_HEIGHT - 16);
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    for (const obs of ARENA_OBSTACLES) {
      // Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(obs.x + 8, obs.y + 10, obs.width, obs.height);

      // Pillar Body
      const grad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
      grad.addColorStop(0, '#1f2937');
      grad.addColorStop(1, '#111827');
      ctx.fillStyle = grad;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

      // Pillar Border with Neon Bevel
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 3;
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

      // Cyber rune / accent in center
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x + 15, obs.y + 15, obs.width - 30, obs.height - 30);
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerSnapshot, isLocal: boolean) {
    const cfg = CHARACTERS[p.characterClass];

    if (!p.isAlive) {
      // Dead player / respawn tombstone
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💀', 0, 0);

      // Respawn timer text
      ctx.font = '700 12px Orbitron, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`Respawn: ${p.respawnTimer}s`, 0, -25);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 14, cfg.radius * 0.9, cfg.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dash trail / phantom glow
    if (p.isDashing) {
      ctx.fillStyle = cfg.accentColor + '55';
      ctx.beginPath();
      ctx.arc(-Math.cos(p.facingAngle) * 20, -Math.sin(p.facingAngle) * 20, cfg.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Invulnerability / Spawn Protection Shield Bubble
    if (p.isInvulnerable) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, cfg.radius + 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
      ctx.fill();
    }

    // Facing Angle Rotation for Character Model & Weapons
    ctx.rotate(p.facingAngle);

    // Body Circle
    ctx.fillStyle = cfg.color;
    ctx.beginPath();
    ctx.arc(0, 0, cfg.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner Armor Ring / Accent
    ctx.strokeStyle = cfg.accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Class specific weapon rendering
    if (p.characterClass === 'warrior') {
      // Right hand: Broadsword
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(10, 8, 28, 5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(10, 6, 4, 9); // Hilt

      // Left hand: Shield
      ctx.fillStyle = '#b91c1c';
      ctx.beginPath();
      ctx.arc(10, -10, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (p.characterClass === 'rogue') {
      // Dual Daggers
      ctx.fillStyle = '#10b981';
      ctx.fillRect(8, 8, 20, 3);
      ctx.fillRect(8, -11, 20, 3);
      // Glow tips
      ctx.fillStyle = '#6ee7b7';
      ctx.fillRect(25, 8, 5, 3);
      ctx.fillRect(25, -11, 5, 3);
    } else if (p.characterClass === 'mage') {
      // Mage Staff
      ctx.fillStyle = '#78350f';
      ctx.fillRect(6, 7, 24, 4);
      // Staff Crystal Orb
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(30, 9, 6, 0, Math.PI * 2);
      ctx.fill();
      // Orbiting magic sparks
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(-8, -12, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Direction indicator nose/visor
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cfg.radius - 4, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // Restore unrotated transform for overhead UI

    // Overhead Nickname & Mini HP Bar
    this.drawOverheadHUD(ctx, p, isLocal);
  }

  private drawOverheadHUD(ctx: CanvasRenderingContext2D, p: PlayerSnapshot, isLocal: boolean) {
    const x = p.x;
    const y = p.y - 38;

    // Nickname
    ctx.font = '700 13px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isLocal ? '#38bdf8' : '#f8fafc';
    ctx.fillText(`${p.name} ${isLocal ? '(YOU)' : ''}`, x, y);

    // Mini HP Bar
    const barW = 54;
    const barH = 6;
    const barX = x - barW / 2;
    const barY = y + 4;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barW, barH);

    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : (hpRatio > 0.25 ? '#f59e0b' : '#ef4444');
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]) {
    for (const p of projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 15;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawVisualEffects(ctx: CanvasRenderingContext2D, effects: ActiveVisualEffect[]) {
    const now = Date.now();

    for (const fx of effects) {
      const elapsed = (now - fx.createdAt) / 1000;
      const progress = Math.min(1, elapsed / fx.duration);
      const alpha = 1 - progress;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);

      if (fx.type === 'whirlwind') {
        // Spinning crimson circular whirlwind
        const r = fx.radius || 100;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 6;
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 20;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r * (0.8 + progress * 0.2), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fill();
      } else if (fx.type === 'slash') {
        // Melee slash crescent arc
        const r = fx.radius || 60;
        const angle = fx.angle || 0;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 5;
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, angle - 0.7, angle + 0.7);
        ctx.stroke();
      } else if (fx.type === 'laser') {
        // Arcane Laser straight piercing beam
        const angle = fx.angle || 0;
        const len = fx.length || 680;
        const endX = fx.x + Math.cos(angle) * len;
        const endY = fx.y + Math.sin(angle) * len;

        // Outer glow
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 26;
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 25;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Inner core
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(fx.x, fx.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      } else if (fx.type === 'explosion') {
        // Mage Explosion Wave
        const r = (fx.radius || 85) * progress;
        ctx.strokeStyle = fx.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(155, 89, 182, 0.2)';
        ctx.fill();
      } else if (fx.type === 'teleport' || fx.type === 'hit') {
        // Spark / Flash
        ctx.fillStyle = fx.color;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 16 * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    const now = Date.now();
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      const elapsed = (now - ft.createdAt) / 1000;
      if (elapsed > ft.duration) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      const progress = elapsed / ft.duration;
      const alpha = 1 - progress;
      const curY = ft.y - progress * 40; // Rises upwards

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${ft.size}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, curY);
      ctx.restore();
    }
  }

  private drawDebugOverlays(
    ctx: CanvasRenderingContext2D,
    players: (InterpolatedPlayer | PlayerSnapshot)[],
    snapshot: GameStateSnapshot
  ) {
    ctx.save();

    // 1. Obstacle Hitboxes (Yellow)
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    for (const obs of ARENA_OBSTACLES) {
      ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    }

    // 2. Player Hurtboxes (Green circle) & Attack Hitbox Reach (Red)
    for (const p of players) {
      if (!p.isAlive) continue;
      const cfg = CHARACTERS[p.characterClass];

      // Hurtbox
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cfg.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Attack Hitbox preview (Red arc)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, cfg.skills.light.radius || 60, p.facingAngle - 0.5, p.facingAngle + 0.5);
      ctx.stroke();
    }

    // 3. Projectile Hitboxes
    ctx.strokeStyle = '#06b6d4';
    for (const pr of snapshot.projectiles) {
      ctx.beginPath();
      ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

