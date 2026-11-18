import { ARENA_WIDTH, ARENA_HEIGHT, ARENA_OBSTACLES, Obstacle } from '../../shared/constants';
import { Vector2D } from '../../shared/types';

export class Physics {
  /**
   * Clamps and resolves a circle's position against arena boundaries and obstacles.
   */
  public static resolveWorldCollision(pos: Vector2D, radius: number): Vector2D {
    let x = Math.max(radius, Math.min(ARENA_WIDTH - radius, pos.x));
    let y = Math.max(radius, Math.min(ARENA_HEIGHT - radius, pos.y));

    // Check obstacles
    for (const obs of ARENA_OBSTACLES) {
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));

      const dx = x - closestX;
      const dy = y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        if (dist === 0) {
          // Inside obstacle center, push out towards top
          y = obs.y - radius;
        } else {
          const overlap = radius - dist;
          x += (dx / dist) * overlap;
          y += (dy / dist) * overlap;
        }
      }
    }

    // Re-clamp against borders just in case
    x = Math.max(radius, Math.min(ARENA_WIDTH - radius, x));
    y = Math.max(radius, Math.min(ARENA_HEIGHT - radius, y));

    return { x, y };
  }

  /**
   * Resolves circle-circle collision between players.
   */
  public static resolvePlayerOverlap(
    p1: { x: number; y: number; radius: number },
    p2: { x: number; y: number; radius: number }
  ): { p1Offset: Vector2D; p2Offset: Vector2D } {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distSq = dx * dx + dy * dy;
    const minDist = p1.radius + p2.radius;

    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = (minDist - dist) * 0.5;
      const nx = dx / dist;
      const ny = dy / dist;

      return {
        p1Offset: { x: -nx * overlap, y: -ny * overlap },
        p2Offset: { x: nx * overlap, y: ny * overlap }
      };
    }

    return { p1Offset: { x: 0, y: 0 }, p2Offset: { x: 0, y: 0 } };
  }

  /**
   * Checks if a point/circle hits an obstacle.
   */
  public static isCircleCollidingWithObstacles(x: number, y: number, radius: number): boolean {
    if (x - radius <= 0 || x + radius >= ARENA_WIDTH || y - radius <= 0 || y + radius >= ARENA_HEIGHT) {
      return true;
    }
    for (const obs of ARENA_OBSTACLES) {
      const closestX = Math.max(obs.x, Math.min(x, obs.x + obs.width));
      const closestY = Math.max(obs.y, Math.min(y, obs.y + obs.height));
      const dx = x - closestX;
      const dy = y - closestY;
      if (dx * dx + dy * dy <= radius * radius) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if target is inside an attack sector/arc (for melee swings like Warrior J or Rogue J).
   */
  public static isTargetInSector(
    origin: Vector2D,
    facingAngle: number,
    arcRads: number,
    reach: number,
    target: Vector2D,
    targetRadius: number
  ): boolean {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy);

    if (dist > reach + targetRadius) {
      return false;
    }

    // Angle to target
    const targetAngle = Math.atan2(dy, dx);
    let angleDiff = targetAngle - facingAngle;

    // Normalize angle difference to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    return Math.abs(angleDiff) <= arcRads / 2 + 0.3; // generous grace angle for responsive combat
  }

  /**
   * Checks if target circle is inside a circle AoE (e.g. Whirlwind or Mage Explosion).
   */
  public static isTargetInCircle(
    center: Vector2D,
    radius: number,
    target: Vector2D,
    targetRadius: number
  ): boolean {
    const dist = Math.hypot(target.x - center.x, target.y - center.y);
    return dist <= radius + targetRadius;
  }

  /**
   * Checks if target circle intersects a laser beam segment of given length and beam thickness.
   */
  public static isTargetInBeam(
    origin: Vector2D,
    angle: number,
    length: number,
    thickness: number,
    target: Vector2D,
    targetRadius: number
  ): boolean {
    const endX = origin.x + Math.cos(angle) * length;
    const endY = origin.y + Math.sin(angle) * length;

    const dx = endX - origin.x;
    const dy = endY - origin.y;
    const lineLenSq = dx * dx + dy * dy;

    if (lineLenSq === 0) return this.isTargetInCircle(origin, thickness, target, targetRadius);

    // Project target onto segment
    const t = Math.max(0, Math.min(1, ((target.x - origin.x) * dx + (target.y - origin.y) * dy) / lineLenSq));
    const projX = origin.x + t * dx;
    const projY = origin.y + t * dy;

    const dist = Math.hypot(target.x - projX, target.y - projY);
    return dist <= thickness / 2 + targetRadius;
  }
}

