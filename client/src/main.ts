import { CharacterClass } from '../../shared/characters';
import { GameStateSnapshot, ServerPacket, UserProfile } from '../../shared/types';
import { socketService } from './network/Socket';
import { predictor } from './network/Predictor';
import { inputManager } from './game/Input';
import { localMode } from './game/LocalMode';
import { Renderer } from './game/Renderer';
import { uiManager } from './ui/UIManager';

// State
let currentUser: UserProfile | null = null;
let currentClass: CharacterClass = 'warrior';
let currentRoomCode: string | null = null;
let isLocalPractice: boolean = false;
let isMatchActive: boolean = false;
let isReady: boolean = false;

// Latency & FPS
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 60;
let fpsTimer = performance.now();

// Networking
let latestServerSnapshot: GameStateSnapshot | null = null;
let inputSeq = 0;

// Setup Canvas & Renderer
const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
inputManager.setCanvas(canvas);

// Local Storage Keys
const LS_NICKNAME = 'arena_clash_nickname';
const LS_TOKEN = 'arena_clash_session_token';
const SS_ROOM = 'arena_clash_active_room';

// --- Initialization ---
async function init() {
  setupUIEventListeners();
  loadSavedProfile();

  // Connect WebSocket
  const connected = await socketService.connect();
  if (connected) {
    authenticate();
  }

  socketService.onMessage(handleServerPacket);

  // Start main loop
  requestAnimationFrame(gameLoop);
}

function loadSavedProfile() {
  const savedNick = localStorage.getItem(LS_NICKNAME) || 'Bahodir_' + Math.floor(Math.random() * 900 + 100);
  const nickInput = document.getElementById('inputNickname') as HTMLInputElement;
  if (nickInput) nickInput.value = savedNick;
}

function authenticate() {
  const nickInput = document.getElementById('inputNickname') as HTMLInputElement;
  const nickname = nickInput?.value.trim() || 'Champion';
  const sessionToken = localStorage.getItem(LS_TOKEN) || undefined;

  socketService.send({
    type: 'AUTH',
    payload: {
      nickname,
      sessionToken,
      characterClass: currentClass
    }
  });
}

// --- Server Packet Dispatcher ---
function handleServerPacket(packet: ServerPacket) {
  switch (packet.type) {
    case 'AUTH_SUCCESS': {
      currentUser = packet.payload.user;
      localStorage.setItem(LS_TOKEN, currentUser.sessionToken);
      localStorage.setItem(LS_NICKNAME, currentUser.nickname);
      uiManager.updateProfile(currentUser);
      predictor.setLocalPlayerId(currentUser.id);

      // Check if there was an active match before page refresh (F5 Reconnect)
      const lastActiveRoom = sessionStorage.getItem(SS_ROOM);
      if (lastActiveRoom) {
        console.log(`[Reconnect] Attempting to reconnect to room: ${lastActiveRoom}`);
        socketService.send({
          type: 'RECONNECT',
          payload: {
            sessionToken: currentUser.sessionToken,
            roomCode: lastActiveRoom
          }
        });
      }
      break;
    }

    case 'QUEUE_STATUS':
      uiManager.setQueueStatus(packet.payload.inQueue, packet.payload.playersInQueue);
      break;

    case 'ROOM_UPDATE': {
      const room = packet.payload;
      currentRoomCode = room.code;
      uiManager.renderRoomView(room, currentUser?.id || '');

      if (room.status === 'countdown' && room.countdown !== undefined) {
        uiManager.showCountdown(room.countdown);
      } else if (room.status === 'waiting') {
        uiManager.hideCountdown();
      }
      break;
    }

    case 'MATCH_START': {
      isMatchActive = true;
      isLocalPractice = false;
      currentRoomCode = packet.payload.roomCode;
      sessionStorage.setItem(SS_ROOM, packet.payload.roomCode);

      uiManager.setCharacterSkillsHUD(currentClass);
      uiManager.showScreen('hud');
      uiManager.showCountdown(0);
      break;
    }

    case 'SNAPSHOT': {
      latestServerSnapshot = packet.payload;
      predictor.onServerSnapshot(packet.payload);
      break;
    }

    case 'COMBAT_EVENT': {
      const ev = packet.payload;
      uiManager.addCombatFeed(ev.text);
      if (ev.eventType === 'hit' && ev.x && ev.y) {
        renderer.addFloatingText(ev.text, ev.x, ev.y, '#fbbf24', 20);
      } else if (ev.eventType === 'kill' && ev.x && ev.y) {
        renderer.addFloatingText('ELIMINATED!', ev.x, ev.y - 25, '#ef4444', 26);
      }
      break;
    }

    case 'MATCH_END': {
      isMatchActive = false;
      sessionStorage.removeItem(SS_ROOM);
      uiManager.renderMatchResults(packet.payload);

      // Refresh user stats
      if (currentUser) {
        fetch(`/api/stats/${currentUser.id}`)
          .then(r => r.json())
          .then(data => {
            if (data.success) {
              currentUser = data.user;
              uiManager.updateProfile(currentUser!);
            }
          })
          .catch(() => {});
      }
      break;
    }

    case 'RECONNECT_SUCCESS': {
      const room = packet.payload.room;
      currentRoomCode = room.code;
      sessionStorage.setItem(SS_ROOM, room.code);
      isMatchActive = true;
      isLocalPractice = false;
      uiManager.setCharacterSkillsHUD(currentClass);
      uiManager.showScreen('hud');
      break;
    }

    case 'ERROR': {
      alert(`Xatolik: ${packet.payload.message}`);
      break;
    }

    default:
      break;
  }
}

// --- Main Application Loop (60+ FPS) ---
function gameLoop(now: number) {
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // Measure FPS
  frameCount++;
  if (now - fpsTimer >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    fpsTimer = now;
  }

  if (isLocalPractice && localMode.isActive) {
    // --- OFFLINE 2P MODE ---
    localMode.update(dt);
    const snap = localMode.getSnapshot();
    renderer.floatingTexts = localMode.floatingTexts;
    renderer.render(snap, snap.players, 'local_p1');

    const p1 = localMode.getP1();
    if (p1) {
      uiManager.updateHUD(
        localMode.roundTimeRemaining,
        currentFps,
        0,
        p1.hp,
        p1.maxHp,
        p1.cooldowns,
        p1.isAlive,
        p1.respawnTimer,
        `P1: ${p1.kills} Kills | P2: ${localMode.getP2()?.kills || 0} Kills`
      );
    }
  } else if (isMatchActive && latestServerSnapshot) {
    // --- ONLINE SERVER-AUTHORITATIVE MODE ---
    const localPlayer = latestServerSnapshot.players.find(p => p.id === currentUser?.id);

    if (localPlayer && localPlayer.isAlive) {
      // Gather and send client input
      inputSeq++;
      const input = inputManager.getP1Input(predictor.localPredictedPos, inputSeq);

      // Client-Side Prediction
      predictor.predictLocalMovement(input, dt, localPlayer.characterClass);

      // Send to authoritative server
      socketService.send({
        type: 'INPUT',
        payload: input
      });
    }

    // Entity Interpolation for remote players
    const renderPlayers = predictor.getInterpolatedPlayers(latestServerSnapshot);
    renderer.render(latestServerSnapshot, renderPlayers, currentUser?.id);

    if (localPlayer) {
      uiManager.updateHUD(
        latestServerSnapshot.timeRemaining,
        currentFps,
        socketService.currentPingMs,
        localPlayer.hp,
        localPlayer.maxHp,
        localPlayer.cooldowns,
        localPlayer.isAlive,
        localPlayer.respawnTimer,
        `Kills: ${localPlayer.kills} | Deaths: ${localPlayer.deaths}`
      );
    }
  } else {
    // Idle / Menu background render
    renderer.render(null, []);
  }

  requestAnimationFrame(gameLoop);
}

// --- UI Event Handlers ---
function setupUIEventListeners() {
  // Character Card Selection
  const cards = document.querySelectorAll('.char-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const cls = card.getAttribute('data-class') as CharacterClass;
      if (cls) {
        currentClass = cls;
        if (socketService.isConnected()) {
          socketService.send({ type: 'CHANGE_CLASS', payload: { characterClass: cls } });
        }
      }
    });
  });

  // Nickname Change
  const nickInput = document.getElementById('inputNickname') as HTMLInputElement;
  nickInput?.addEventListener('change', () => {
    if (socketService.isConnected()) authenticate();
  });

  // Open Lobby Screen
  document.getElementById('btnOpenLobby')?.addEventListener('click', () => {
    authenticate();
    uiManager.showScreen('lobby');
    uiManager.showLobbySelect();
  });

  // Back to Login
  document.getElementById('btnBackToLogin')?.addEventListener('click', () => {
    if (socketService.isConnected()) {
      socketService.send({ type: 'LEAVE_QUEUE' });
      socketService.send({ type: 'LEAVE_ROOM' });
    }
    uiManager.showScreen('login');
  });

  // Quick Match
  document.getElementById('btnQuickMatch')?.addEventListener('click', () => {
    const isQueued = (document.getElementById('queueStatusText') as HTMLElement).style.display !== 'none';
    if (isQueued) {
      socketService.send({ type: 'LEAVE_QUEUE' });
    } else {
      socketService.send({ type: 'JOIN_QUEUE', payload: { characterClass: currentClass } });
    }
  });

  // Create Private Room
  document.getElementById('btnCreatePrivateRoom')?.addEventListener('click', () => {
    socketService.send({ type: 'CREATE_ROOM', payload: { characterClass: currentClass } });
  });

  // Join Room by Code
  document.getElementById('btnJoinRoom')?.addEventListener('click', () => {
    const codeInput = document.getElementById('inputRoomCode') as HTMLInputElement;
    const code = codeInput?.value.trim().toUpperCase();
    if (code && code.length >= 4) {
      socketService.send({ type: 'JOIN_ROOM', payload: { code, characterClass: currentClass } });
    } else {
      alert('Iltimos, 6 xonali xona kodini kiriting!');
    }
  });

  // Leave Room
  document.getElementById('btnLeaveRoom')?.addEventListener('click', () => {
    socketService.send({ type: 'LEAVE_ROOM' });
    currentRoomCode = null;
    sessionStorage.removeItem(SS_ROOM);
    uiManager.showLobbySelect();
  });

  // Toggle Ready
  document.getElementById('btnToggleReady')?.addEventListener('click', () => {
    isReady = !isReady;
    socketService.send({ type: 'SET_READY', payload: { ready: isReady } });
  });

  // Hero select inside room lobby
  const selLobbyHero = document.getElementById('selLobbyHero') as HTMLSelectElement;
  selLobbyHero?.addEventListener('change', () => {
    currentClass = selLobbyHero.value as CharacterClass;
    socketService.send({ type: 'CHANGE_CLASS', payload: { characterClass: currentClass } });
  });

  // Leave Match button inside HUD
  document.getElementById('btnLeaveMatch')?.addEventListener('click', () => {
    if (isLocalPractice) {
      localMode.stop();
      isLocalPractice = false;
      uiManager.showScreen('login');
    } else {
      socketService.send({ type: 'LEAVE_ROOM' });
      sessionStorage.removeItem(SS_ROOM);
      isMatchActive = false;
      uiManager.showScreen('lobby');
      uiManager.showLobbySelect();
    }
  });

  // Hitbox Debug Checkbox
  const chkHitbox = document.getElementById('chkDebugHitbox') as HTMLInputElement;
  chkHitbox?.addEventListener('change', () => {
    renderer.debugHitboxes = chkHitbox.checked;
  });

  // Simulated Latency
  const selSimLag = document.getElementById('selSimulatedLag') as HTMLSelectElement;
  selSimLag?.addEventListener('change', () => {
    socketService.setSimulatedLatency(parseInt(selSimLag.value, 10));
  });

  // Leaderboard & History
  document.getElementById('btnViewLeaderboard')?.addEventListener('click', async () => {
    uiManager.showScreen('result');
    loadGlobalLeaderboard();
  });

  document.getElementById('btnTabResult')?.addEventListener('click', () => {
    uiManager.showResultScoreboard();
  });

  document.getElementById('btnTabLeaderboard')?.addEventListener('click', () => {
    loadGlobalLeaderboard();
  });

  document.getElementById('btnTabHistory')?.addEventListener('click', () => {
    loadUserHistory();
  });

  document.getElementById('btnResultPlayAgain')?.addEventListener('click', () => {
    uiManager.showScreen('lobby');
    uiManager.showLobbySelect();
  });

  document.getElementById('btnResultBackLobby')?.addEventListener('click', () => {
    uiManager.showScreen('login');
  });

  // --- Offline 2P Practice Mode Setup ---
  document.getElementById('btnStartOfflinePractice')?.addEventListener('click', () => {
    uiManager.showScreen('offlineSetup');
  });

  document.getElementById('btnCancelOffline')?.addEventListener('click', () => {
    uiManager.showScreen('login');
  });

  document.getElementById('btnLaunchOfflineBattle')?.addEventListener('click', () => {
    const selP1 = document.getElementById('selP1Class') as HTMLSelectElement;
    const selP2 = document.getElementById('selP2Class') as HTMLSelectElement;
    const p1Class = (selP1?.value || 'warrior') as CharacterClass;
    const p2Class = (selP2?.value || 'rogue') as CharacterClass;

    isLocalPractice = true;
    isMatchActive = false;
    currentClass = p1Class;

    localMode.start(p1Class, p2Class);
    uiManager.setCharacterSkillsHUD(p1Class);
    uiManager.showScreen('hud');
  });
}

async function loadGlobalLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    if (data.success) {
      uiManager.renderLeaderboard(data.leaderboard);
    }
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
}

async function loadUserHistory() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/history/${currentUser.id}`);
    const data = await res.json();
    if (data.success) {
      uiManager.renderHistory(data.history);
    }
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', init);

