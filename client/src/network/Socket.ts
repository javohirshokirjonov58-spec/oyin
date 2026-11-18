import { ClientPacket, ServerPacket } from '../../../shared/types';

export type PacketHandler = (packet: ServerPacket) => void;

export class SocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: PacketHandler[] = [];
  private simulatedLatencyMs: number = 0;
  private outgoingQueue: { packet: ClientPacket; sendAt: number }[] = [];
  private incomingQueue: { packet: ServerPacket; processAt: number }[] = [];

  public currentPingMs: number = 0;
  private pingInterval: any = null;
  private queueInterval: any = null;

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else {
      const envUrl = (import.meta as any).env?.VITE_WS_URL;
      if (envUrl) {
        this.url = envUrl;
      } else {
        const loc = window.location;
        const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        // In dev mode with Vite on 5173, Vite proxies /ws to localhost:3001
        this.url = `${protocol}//${loc.host}/ws`;
      }
    }

    // Process delayed packets if simulated latency is active
    this.queueInterval = setInterval(() => this.processQueues(), 5);
  }

  public setSimulatedLatency(ms: number) {
    this.simulatedLatencyMs = Math.max(0, ms);
  }

  public getSimulatedLatency(): number {
    return this.simulatedLatencyMs;
  }

  public connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[Socket] Connected to server:', this.url);
          this.startHeartbeat();
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const packet: ServerPacket = JSON.parse(event.data);
            if (packet.type === 'PONG') {
              this.currentPingMs = Date.now() - packet.payload.clientTime;
            }

            if (this.simulatedLatencyMs > 0) {
              this.incomingQueue.push({
                packet,
                processAt: Date.now() + this.simulatedLatencyMs
              });
            } else {
              this.dispatchPacket(packet);
            }
          } catch (err) {
            console.error('[Socket] Error parsing message:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('[Socket] Connection error:', err);
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log('[Socket] Disconnected from server');
          this.stopHeartbeat();
        };
      } catch (err) {
        console.error('[Socket] Failed to create WebSocket:', err);
        resolve(false);
      }
    });
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public onMessage(handler: PacketHandler) {
    this.handlers.push(handler);
  }

  public send(packet: ClientPacket) {
    if (!this.isConnected()) return;

    if (this.simulatedLatencyMs > 0) {
      this.outgoingQueue.push({
        packet,
        sendAt: Date.now() + this.simulatedLatencyMs
      });
    } else {
      this.sendDirect(packet);
    }
  }

  private sendDirect(packet: ClientPacket) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  private processQueues() {
    const now = Date.now();

    // Process outgoing
    while (this.outgoingQueue.length > 0 && this.outgoingQueue[0].sendAt <= now) {
      const item = this.outgoingQueue.shift()!;
      this.sendDirect(item.packet);
    }

    // Process incoming
    while (this.incomingQueue.length > 0 && this.incomingQueue[0].processAt <= now) {
      const item = this.incomingQueue.shift()!;
      this.dispatchPacket(item.packet);
    }
  }

  private dispatchPacket(packet: ServerPacket) {
    for (const h of this.handlers) {
      h(packet);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'PING',
          payload: { clientTime: Date.now() }
        });
      }
    }, 2000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const socketService = new SocketService();

