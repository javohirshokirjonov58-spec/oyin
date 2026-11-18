import {
  GameStateSnapshot,
  PlayerSnapshot,
  InputPayload
} from '../../../shared/types';
import { CHARACTERS } from '../../../shared/characters';
import { ENTITY_INTERPOLATION_OFFSET_MS } from '../../../shared/constants';
import { Physics } from '../../../server/game/Physics';

export interface InterpolatedPlayer extends PlayerSnapshot {
  isLocal: boolean;
}

export class Predictor {
  private localPlayerId: string = '';
  private pendingInputs: InputPayload[] = [];
  private inputSequence: number = 0;

  // Local predicted state
  public localPredictedPos: { x: number; y: number } = { x: 0, y: 0 };

  // Snapshot buffer for entity interpolation
  private snapshotBuffer: { timestamp: number; snapshot: GameStateSnapshot }[] = [];
  private serverTimeOffset: number = 0;

  public setLocalPlayerId(id: string) {
    this.localPlayerId = id;
    this.pendingInputs = [];
    this.inputSequence = 0;
    this.snapshotBuffer = [];
  }

  public getNextSequence(): number {
    return ++this.inputSequence;
  }

  /**
   * Applies local client-side prediction for local player movement.
   */
  public predictLocalMovement(input: InputPayload, dt: number, characterClass: 'warrior' | 'rogue' | 'mage') {
    this.pendingInputs.push(input);

    const cfg = CHARACTERS[characterClass];
    let mag = Math.hypot(input.dx, input.dy);
    if (mag > 0.01) {
      const normX = input.dx / Math.max(1, mag);
      const normY = input.dy / Math.max(1, mag);
      this.localPredictedPos.x += normX * cfg.speed * dt;
      this.localPredictedPos.y += normY * cfg.speed * dt;
    }

    // World collision
    const resolved = Physics.resolveWorldCollision(this.localPredictedPos, cfg.radius);
    this.localPredictedPos.x = resolved.x;
    this.localPredictedPos.y = resolved.y;
  }

  /**
   * Called whenever a new authoritative snapshot arrives from the server.
   */
  public onServerSnapshot(snapshot: GameStateSnapshot) {
    const now = Date.now();
    // Estimate clock difference
    this.serverTimeOffset = now - snapshot.timestamp;

    this.snapshotBuffer.push({
      timestamp: snapshot.timestamp,
      snapshot
    });

    // Keep snapshot buffer under 2 seconds
    while (this.snapshotBuffer.length > 60) {
      this.snapshotBuffer.shift();
    }

    // --- Server Reconciliation for Local Player ---
    if (!this.localPlayerId) return;

    const serverLocal = snapshot.players.find(p => p.id === this.localPlayerId);
    if (!serverLocal) return;

    const lastAckSeq = snapshot.lastProcessedInputSeq[this.localPlayerId] || 0;

    // Discard all inputs acknowledged by the server
    this.pendingInputs = this.pendingInputs.filter(inp => inp.seq > lastAckSeq);

    // Replay remaining unacknowledged inputs on top of authoritative server pos
    let reconX = serverLocal.x;
    let reconY = serverLocal.y;
    const cfg = CHARACTERS[serverLocal.characterClass];
    const dt = 1 / 30; // standard tick delta

    for (const inp of this.pendingInputs) {
      const mag = Math.hypot(inp.dx, inp.dy);
      if (mag > 0.01) {
        reconX += (inp.dx / Math.max(1, mag)) * cfg.speed * dt;
        reconY += (inp.dy / Math.max(1, mag)) * cfg.speed * dt;
      }
      const res = Physics.resolveWorldCollision({ x: reconX, y: reconY }, cfg.radius);
      reconX = res.x;
      reconY = res.y;
    }

    // Smooth error correction: if prediction difference is small, lerp; if huge, snap
    const errorDist = Math.hypot(this.localPredictedPos.x - reconX, this.localPredictedPos.y - reconY);
    if (errorDist > 100) {
      this.localPredictedPos.x = reconX;
      this.localPredictedPos.y = reconY;
    } else {
      this.localPredictedPos.x += (reconX - this.localPredictedPos.x) * 0.4;
      this.localPredictedPos.y += (reconY - this.localPredictedPos.y) * 0.4;
    }
  }

  /**
   * Computes interpolated entities for rendering at the current frame.
   */
  public getInterpolatedPlayers(latestSnapshot: GameStateSnapshot | null): InterpolatedPlayer[] {
    if (!latestSnapshot) return [];

    const now = Date.now();
    // Render time delayed by offset
    const renderTime = (now - this.serverTimeOffset) - ENTITY_INTERPOLATION_OFFSET_MS;

    // Find surrounding snapshots s0 and s1
    let s0: { timestamp: number; snapshot: GameStateSnapshot } | null = null;
    let s1: { timestamp: number; snapshot: GameStateSnapshot } | null = null;

    for (let i = 0; i < this.snapshotBuffer.length - 1; i++) {
      if (this.snapshotBuffer[i].timestamp <= renderTime && this.snapshotBuffer[i + 1].timestamp >= renderTime) {
        s0 = this.snapshotBuffer[i];
        s1 = this.snapshotBuffer[i + 1];
        break;
      }
    }

    const result: InterpolatedPlayer[] = [];

    for (const p of latestSnapshot.players) {
      const isLocal = p.id === this.localPlayerId;

      if (isLocal) {
        // Use local predicted position
        result.push({
          ...p,
          x: this.localPredictedPos.x,
          y: this.localPredictedPos.y,
          isLocal: true
        });
        continue;
      }

      // Remote player: Entity Interpolation
      if (s0 && s1 && s1.timestamp > s0.timestamp) {
        const p0 = s0.snapshot.players.find(pl => pl.id === p.id);
        const p1 = s1.snapshot.players.find(pl => pl.id === p.id);

        if (p0 && p1) {
          const factor = (renderTime - s0.timestamp) / (s1.timestamp - s0.timestamp);
          const t = Math.max(0, Math.min(1, factor));

          // Interpolate position
          const interpX = p0.x + (p1.x - p0.x) * t;
          const interpY = p0.y + (p1.y - p0.y) * t;

          // Interpolate angle with shortest rotation path
          let diffAngle = p1.facingAngle - p0.facingAngle;
          while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
          while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
          const interpAngle = p0.facingAngle + diffAngle * t;

          result.push({
            ...p,
            x: interpX,
            y: interpY,
            facingAngle: interpAngle,
            isLocal: false
          });
          continue;
        }
      }

      // Fallback: render latest server position
      result.push({
        ...p,
        isLocal: false
      });
    }

    return result;
  }
}

export const predictor = new Predictor();

