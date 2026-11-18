import { InputPayload, SkillSlot } from '../../../shared/types';

export class InputManager {
  private keys: Record<string, boolean> = {};
  private p1ActionQueue: SkillSlot[] = [];
  private p2ActionQueue: SkillSlot[] = [];
  private mousePos: { x: number; y: number } = { x: 600, y: 400 };
  private canvasElement: HTMLCanvasElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
  }

  public setCanvas(canvas: HTMLCanvasElement) {
    this.canvasElement = canvas;
  }

  private handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const code = e.code;

    // Prevent default scrolling for game keys
    if (['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) ||
        ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }

    if (!this.keys[code]) {
      // Player 1 Actions
      if (code === 'KeyJ') this.p1ActionQueue.push('light');
      if (code === 'KeyK') this.p1ActionQueue.push('heavy');
      if (code === 'KeyL') this.p1ActionQueue.push('special');
      if (code === 'Space') this.p1ActionQueue.push('dodge');

      // Player 2 Actions (Numpad or U/I/O/P for standard keyboards without numpad)
      if (code === 'Numpad1' || code === 'KeyU') this.p2ActionQueue.push('light');
      if (code === 'Numpad2' || code === 'KeyI') this.p2ActionQueue.push('heavy');
      if (code === 'Numpad3' || code === 'KeyO') this.p2ActionQueue.push('special');
      if (code === 'Numpad0' || code === 'KeyP' || code === 'ShiftRight') this.p2ActionQueue.push('dodge');
    }

    this.keys[code] = true;
    this.keys[key] = true;
  }

  private handleKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    const code = e.code;
    this.keys[code] = false;
    this.keys[key] = false;
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvasElement) {
      this.mousePos = { x: e.clientX, y: e.clientY };
      return;
    }
    const rect = this.canvasElement.getBoundingClientRect();
    const scaleX = this.canvasElement.width / rect.width;
    const scaleY = this.canvasElement.height / rect.height;

    this.mousePos = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  /**
   * Reads current input for Player 1 (Online or Offline).
   */
  public getP1Input(playerPos: { x: number; y: number }, seq: number): InputPayload {
    let dx = 0;
    let dy = 0;

    if (this.keys['KeyW'] || this.keys['w']) dy -= 1;
    if (this.keys['KeyS'] || this.keys['s']) dy += 1;
    if (this.keys['KeyA'] || this.keys['a']) dx -= 1;
    if (this.keys['KeyD'] || this.keys['d']) dx += 1;

    // Normalize
    const mag = Math.hypot(dx, dy);
    if (mag > 0) {
      dx /= mag;
      dy /= mag;
    }

    // Aim towards mouse
    const facingAngle = Math.atan2(this.mousePos.y - playerPos.y, this.mousePos.x - playerPos.x);
    const action = this.p1ActionQueue.shift();

    return {
      seq,
      dx,
      dy,
      facingAngle,
      action,
      timestamp: Date.now()
    };
  }

  /**
   * Reads current input for Player 2 (Offline split keyboard).
   */
  public getP2Input(playerPos: { x: number; y: number }, targetPos?: { x: number; y: number }, seq = 0): InputPayload {
    let dx = 0;
    let dy = 0;

    if (this.keys['ArrowUp']) dy -= 1;
    if (this.keys['ArrowDown']) dy += 1;
    if (this.keys['ArrowLeft']) dx -= 1;
    if (this.keys['ArrowRight']) dx += 1;

    // Normalize
    const mag = Math.hypot(dx, dy);
    if (mag > 0) {
      dx /= mag;
      dy /= mag;
    }

    // Aim towards opponent or towards movement direction
    let facingAngle = 0;
    if (targetPos) {
      facingAngle = Math.atan2(targetPos.y - playerPos.y, targetPos.x - playerPos.x);
    } else if (mag > 0) {
      facingAngle = Math.atan2(dy, dx);
    }

    const action = this.p2ActionQueue.shift();

    return {
      seq,
      dx,
      dy,
      facingAngle,
      action,
      timestamp: Date.now()
    };
  }

  public getMousePos() {
    return this.mousePos;
  }

  public clear() {
    this.keys = {};
    this.p1ActionQueue = [];
    this.p2ActionQueue = [];
  }
}

export const inputManager = new InputManager();

