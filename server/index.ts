import http from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { dbStore } from './db/store';
import { roomManager } from './game/RoomManager';
import { ClientPacket, ServerPacket } from '../shared/types';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- REST Endpoints ---
app.post('/api/auth', (req, res) => {
  const { nickname, sessionToken } = req.body;
  const user = dbStore.getOrCreateUser(nickname, sessionToken);
  res.json({ success: true, user });
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = dbStore.getLeaderboard(20);
  res.json({ success: true, leaderboard });
});

app.get('/api/history/:userId', (req, res) => {
  const { userId } = req.params;
  const history = dbStore.getHistory(userId);
  res.json({ success: true, history });
});

app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const user = dbStore.getUserById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
  }
  res.json({ success: true, user });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  const client = roomManager.registerClient(ws);

  ws.on('message', (data: string) => {
    try {
      if (!roomManager.checkRateLimit(client)) {
        return; // Exceeded rate limit
      }

      const packet: ClientPacket = JSON.parse(data.toString());

      switch (packet.type) {
        case 'PING':
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'PONG',
              payload: {
                clientTime: packet.payload.clientTime,
                serverTime: Date.now()
              }
            }));
          }
          break;

        case 'AUTH': {
          const user = dbStore.getOrCreateUser(packet.payload.nickname, packet.payload.sessionToken);
          client.userId = user.id;
          client.name = user.nickname;
          client.sessionToken = user.sessionToken;
          client.characterClass = packet.payload.characterClass || 'warrior';

          const res: ServerPacket = {
            type: 'AUTH_SUCCESS',
            payload: { user }
          };
          ws.send(JSON.stringify(res));
          break;
        }

        case 'JOIN_QUEUE':
          roomManager.joinQueue(client, packet.payload.characterClass);
          break;

        case 'LEAVE_QUEUE':
          roomManager.leaveQueue(client);
          break;

        case 'CREATE_ROOM':
          roomManager.createPrivateRoom(client, packet.payload.characterClass);
          break;

        case 'JOIN_ROOM':
          roomManager.joinRoom(client, packet.payload.code, packet.payload.characterClass);
          break;

        case 'LEAVE_ROOM':
          roomManager.leaveRoom(client);
          break;

        case 'SET_READY':
          roomManager.setReady(client, packet.payload.ready);
          break;

        case 'CHANGE_CLASS':
          roomManager.changeClass(client, packet.payload.characterClass);
          break;

        case 'INPUT':
          roomManager.handleInput(client, packet.payload);
          break;

        case 'RECONNECT':
          roomManager.reconnect(client, packet.payload.sessionToken, packet.payload.roomCode);
          break;

        default:
          console.warn('[Server] Unknown packet type:', (packet as any).type);
      }
    } catch (err) {
      console.error('[Server] Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    roomManager.unregisterClient(ws);
  });

  ws.on('error', (err) => {
    console.error('[Server] WS error:', err);
    roomManager.unregisterClient(ws);
  });
});

server.listen(PORT, () => {
  console.log(`[Arena Clash 2D] Server running on http://localhost:${PORT}`);
  console.log(`[Arena Clash 2D] WebSocket server ready on ws://localhost:${PORT}`);
});

