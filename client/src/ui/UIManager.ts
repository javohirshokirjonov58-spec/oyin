import { CharacterClass, CHARACTERS } from '../../../shared/characters';
import { RoomDetails, MatchResultData, UserProfile, MatchHistoryItem } from '../../../shared/types';

export class UIManager {
  // Screens
  private screenLogin = document.getElementById('screenLogin')!;
  private screenLobby = document.getElementById('screenLobby')!;
  private inGameHud = document.getElementById('inGameHud')!;
  private screenResult = document.getElementById('screenResult')!;
  private screenOfflineSetup = document.getElementById('screenOfflineSetup')!;

  // HUD Elements
  private hudTimer = document.getElementById('hudTimer')!;
  private hudScoreboardBrief = document.getElementById('hudScoreboardBrief')!;
  private hudFps = document.getElementById('hudFps')!;
  private hudPing = document.getElementById('hudPing')!;
  private hudPlayerName = document.getElementById('hudPlayerName')!;
  private hudPlayerHpText = document.getElementById('hudPlayerHpText')!;
  private hudPlayerHpFill = document.getElementById('hudPlayerHpFill')!;
  private hudCombatFeed = document.getElementById('hudCombatFeed')!;
  private hudRespawnBanner = document.getElementById('hudRespawnBanner')!;
  private hudRespawnSeconds = document.getElementById('hudRespawnSeconds')!;
  private hudCountdown = document.getElementById('hudCountdown')!;

  // Cooldown HUD Slots
  private slotLight = document.getElementById('slotLight')!;
  private slotHeavy = document.getElementById('slotHeavy')!;
  private slotSpecial = document.getElementById('slotSpecial')!;
  private slotDodge = document.getElementById('slotDodge')!;
  private cdLight = document.getElementById('cdLight')!;
  private cdHeavy = document.getElementById('cdHeavy')!;
  private cdSpecial = document.getElementById('cdSpecial')!;
  private cdDodge = document.getElementById('cdDodge')!;
  private slotLightName = document.getElementById('slotLightName')!;
  private slotHeavyName = document.getElementById('slotHeavyName')!;
  private slotSpecialName = document.getElementById('slotSpecialName')!;

  // Lobby Elements
  private panelLobbySelect = document.getElementById('panelLobbySelect')!;
  private panelActiveRoom = document.getElementById('panelActiveRoom')!;
  private displayRoomCode = document.getElementById('displayRoomCode')!;
  private roomStatusBadge = document.getElementById('roomStatusBadge')!;
  private roomPlayersList = document.getElementById('roomPlayersList')!;
  private btnToggleReady = document.getElementById('btnToggleReady') as HTMLButtonElement;
  private queueStatusText = document.getElementById('queueStatusText')!;
  private btnQuickMatch = document.getElementById('btnQuickMatch') as HTMLButtonElement;

  // Profile Elements
  private profileMmr = document.getElementById('profileMmr')!;
  private profileWinLoss = document.getElementById('profileWinLoss')!;

  // Result Elements
  private resultTitle = document.getElementById('resultTitle')!;
  private resultReasonText = document.getElementById('resultReasonText')!;
  private resultTableBody = document.getElementById('resultTableBody')!;
  private panelGlobalLeaderboard = document.getElementById('panelGlobalLeaderboard')!;
  private panelMatchHistory = document.getElementById('panelMatchHistory')!;
  private resultScoreboard = document.getElementById('resultScoreboard')!;
  private tableLeaderboardBody = document.getElementById('tableLeaderboardBody')!;
  private tableHistoryBody = document.getElementById('tableHistoryBody')!;

  public showScreen(screen: 'login' | 'lobby' | 'hud' | 'result' | 'offlineSetup') {
    this.screenLogin.classList.toggle('hidden', screen !== 'login');
    this.screenLobby.classList.toggle('hidden', screen !== 'lobby');
    this.inGameHud.classList.toggle('hidden', screen !== 'hud');
    this.screenResult.classList.toggle('hidden', screen !== 'result');
    this.screenOfflineSetup.classList.toggle('hidden', screen !== 'offlineSetup');
  }

  public updateProfile(user: UserProfile) {
    this.profileMmr.textContent = user.mmr.toString();
    this.profileWinLoss.textContent = `${user.wins}W - ${user.losses}L`;
  }

  public setCharacterSkillsHUD(charClass: CharacterClass) {
    const cfg = CHARACTERS[charClass];
    this.slotLightName.textContent = cfg.skills.light.name.split(' ')[0];
    this.slotHeavyName.textContent = cfg.skills.heavy.name.split(' ')[0];
    this.slotSpecialName.textContent = cfg.skills.special.name.split(' ')[0];
    this.hudPlayerName.textContent = cfg.name;
    this.hudPlayerName.style.color = cfg.color;
  }

  public updateHUD(
    timeRemaining: number,
    fps: number,
    ping: number,
    hp: number,
    maxHp: number,
    cooldowns: { light: number; heavy: number; special: number; dodge: number },
    isAlive: boolean,
    respawnTimer: number,
    briefScore?: string
  ) {
    // Format mm:ss
    const mins = Math.floor(timeRemaining / 60);
    const secs = Math.floor(timeRemaining % 60);
    this.hudTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    this.hudFps.textContent = fps.toString();
    this.hudPing.textContent = `${Math.round(ping)} ms`;

    if (briefScore) {
      this.hudScoreboardBrief.textContent = briefScore;
    }

    // HP Bar
    this.hudPlayerHpText.textContent = `${Math.round(hp)} / ${maxHp} HP`;
    const hpRatio = Math.max(0, Math.min(1, hp / maxHp));
    this.hudPlayerHpFill.style.width = `${hpRatio * 100}%`;

    // Cooldown Slots
    this.updateCooldownSlot(this.slotLight, this.cdLight, cooldowns.light);
    this.updateCooldownSlot(this.slotHeavy, this.cdHeavy, cooldowns.heavy);
    this.updateCooldownSlot(this.slotSpecial, this.cdSpecial, cooldowns.special);
    this.updateCooldownSlot(this.slotDodge, this.cdDodge, cooldowns.dodge);

    // Respawn Banner
    if (!isAlive && respawnTimer > 0) {
      this.hudRespawnBanner.classList.add('active');
      this.hudRespawnSeconds.textContent = Math.ceil(respawnTimer).toString();
    } else {
      this.hudRespawnBanner.classList.remove('active');
    }
  }

  private updateCooldownSlot(slotEl: HTMLElement, cdEl: HTMLElement, remainingSec: number) {
    if (remainingSec > 0.05) {
      slotEl.classList.add('on-cooldown');
      cdEl.textContent = remainingSec.toFixed(1);
    } else {
      slotEl.classList.remove('on-cooldown');
      cdEl.textContent = '0.0';
    }
  }

  public showCountdown(sec: number) {
    this.hudCountdown.style.display = 'block';
    this.hudCountdown.textContent = sec.toString();
    if (sec <= 0) {
      this.hudCountdown.textContent = 'FIGHT!';
      setTimeout(() => {
        this.hudCountdown.style.display = 'none';
      }, 700);
    }
  }

  public hideCountdown() {
    this.hudCountdown.style.display = 'none';
  }

  public addCombatFeed(text: string) {
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = text;
    this.hudCombatFeed.appendChild(item);

    setTimeout(() => {
      if (item.parentNode) {
        item.parentNode.removeChild(item);
      }
    }, 4500);
  }

  public setQueueStatus(inQueue: boolean, count = 0) {
    if (inQueue) {
      this.queueStatusText.style.display = 'block';
      this.queueStatusText.textContent = `⚡ Navbatda qidirilmoqda... (${count} o'yinchi)`;
      this.btnQuickMatch.textContent = 'Bekor qilish';
      this.btnQuickMatch.classList.remove('btn-primary');
      this.btnQuickMatch.classList.add('btn-danger');
    } else {
      this.queueStatusText.style.display = 'none';
      this.btnQuickMatch.textContent = '⚡ Navbatga Kirish';
      this.btnQuickMatch.classList.remove('btn-danger');
      this.btnQuickMatch.classList.add('btn-primary');
    }
  }

  public renderRoomView(room: RoomDetails, currentUserId: string) {
    this.panelLobbySelect.style.display = 'none';
    this.panelActiveRoom.style.display = 'block';

    this.displayRoomCode.textContent = room.code;
    this.roomStatusBadge.textContent =
      room.status === 'countdown' ? `BOSHLANMOQDA (${room.countdown || 3}s)` :
      (room.players.length >= 2 ? 'HAMMA TAYYOR BO‘LISHI KUTILMOQDA' : 'O‘YINCHILAR KUTILMOQDA (MIN 2)');

    this.roomPlayersList.innerHTML = '';

    let localPlayerReady = false;

    for (const p of room.players) {
      const isMe = p.id === currentUserId;
      if (isMe) localPlayerReady = p.isReady;

      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid ${p.isReady ? '#10b981' : 'rgba(255, 255, 255, 0.15)'};
        border-radius: 10px;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const cfg = CHARACTERS[p.characterClass];

      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:36px; height:36px; border-radius:50%; background:${cfg.color}; display:flex; align-items:center; justify-content:center; font-size:16px;">
            ${p.characterClass === 'warrior' ? '🛡️' : (p.characterClass === 'rogue' ? '🗡️' : '🔮')}
          </div>
          <div>
            <div style="font-weight:700; color:${isMe ? '#38bdf8' : '#f8fafc'};">${p.name} ${isMe ? '(Siz)' : ''} ${p.isHost ? '👑' : ''}</div>
            <div style="font-size:12px; color:var(--text-muted);">${cfg.name} • MMR ${p.mmr}</div>
          </div>
        </div>
        <div style="font-family:'Orbitron', monospace; font-size:12px; font-weight:700; color:${p.isReady ? '#10b981' : '#f59e0b'};">
          ${p.isReady ? 'TAYYOR' : 'KUTILMOQDA'}
        </div>
      `;

      this.roomPlayersList.appendChild(card);
    }

    // Update ready button
    if (localPlayerReady) {
      this.btnToggleReady.textContent = 'Bekor Qilish (Unready)';
      this.btnToggleReady.classList.remove('btn-success');
      this.btnToggleReady.classList.add('btn-warning');
    } else {
      this.btnToggleReady.textContent = 'Tayyorman (Ready)';
      this.btnToggleReady.classList.remove('btn-warning');
      this.btnToggleReady.classList.add('btn-success');
    }
  }

  public showLobbySelect() {
    this.panelLobbySelect.style.display = 'grid';
    this.panelActiveRoom.style.display = 'none';
  }

  public renderMatchResults(data: MatchResultData) {
    this.showScreen('result');
    this.panelGlobalLeaderboard.style.display = 'none';
    this.panelMatchHistory.style.display = 'none';
    this.resultScoreboard.style.display = 'table';

    this.resultTitle.textContent = data.winnerName ? `${data.winnerName.toUpperCase()} G'OLIB BO'LDI!` : 'DURANG!';
    this.resultReasonText.textContent =
      data.reason === 'target_kills' ? '5 ta Kill marrasiga erishildi' :
      (data.reason === 'forfeit' ? 'Raqib o‘yindan chiqib ketdi (Texnik g‘alaba)' : 'Vaqt (3 daqiqa) tugadi');

    this.resultTableBody.innerHTML = '';

    for (const p of data.scoreboard) {
      const row = document.createElement('tr');
      const mmrClass = p.mmrDelta >= 0 ? '#10b981' : '#ef4444';
      const mmrSign = p.mmrDelta >= 0 ? `+${p.mmrDelta}` : `${p.mmrDelta}`;

      row.innerHTML = `
        <td class="badge-rank-${p.rank}">#${p.rank}</td>
        <td style="font-weight:700;">${p.name}</td>
        <td><span style="color:${CHARACTERS[p.characterClass].color};">${CHARACTERS[p.characterClass].name}</span></td>
        <td style="color:#10b981; font-weight:700;">${p.kills}</td>
        <td style="color:#ef4444;">${p.deaths}</td>
        <td>${p.damageDealt}</td>
        <td style="font-family:'Orbitron', monospace; font-weight:700; color:${mmrClass};">
          ${p.oldMmr} -> ${p.newMmr} (${mmrSign})
        </td>
      `;
      this.resultTableBody.appendChild(row);
    }
  }

  public renderLeaderboard(list: UserProfile[]) {
    this.panelGlobalLeaderboard.style.display = 'block';
    this.panelMatchHistory.style.display = 'none';
    this.resultScoreboard.style.display = 'none';

    this.tableLeaderboardBody.innerHTML = '';
    list.forEach((u, i) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="badge-rank-${i + 1}">#${i + 1}</td>
        <td style="font-weight:700;">${u.nickname}</td>
        <td style="font-family:'Orbitron', monospace; color:#fbbf24; font-weight:700;">${u.mmr}</td>
        <td style="color:#10b981;">${u.wins}</td>
        <td style="color:#ef4444;">${u.losses}</td>
        <td>${u.kills}</td>
      `;
      this.tableLeaderboardBody.appendChild(row);
    });
  }

  public renderHistory(list: MatchHistoryItem[]) {
    this.panelGlobalLeaderboard.style.display = 'none';
    this.panelMatchHistory.style.display = 'block';
    this.resultScoreboard.style.display = 'none';

    this.tableHistoryBody.innerHTML = '';
    if (list.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="6" style="text-align:center; color:var(--text-muted);">Tarix mavjud emas</td>`;
      this.tableHistoryBody.appendChild(row);
      return;
    }

    list.forEach((h) => {
      const row = document.createElement('tr');
      const timeStr = new Date(h.date).toLocaleTimeString();
      const mmrClass = h.mmrChange >= 0 ? '#10b981' : '#ef4444';
      const mmrSign = h.mmrChange >= 0 ? `+${h.mmrChange}` : `${h.mmrChange}`;

      row.innerHTML = `
        <td>${timeStr}</td>
        <td><span style="color:${CHARACTERS[h.characterClass].color};">${CHARACTERS[h.characterClass].name}</span></td>
        <td class="badge-rank-${h.rank}">#${h.rank} / ${h.playersCount}</td>
        <td>${h.kills} / ${h.deaths}</td>
        <td>${h.damageDealt}</td>
        <td style="font-family:'Orbitron', monospace; font-weight:700; color:${mmrClass};">${mmrSign}</td>
      `;
      this.tableHistoryBody.appendChild(row);
    });
  }

  public showResultScoreboard() {
    this.panelGlobalLeaderboard.style.display = 'none';
    this.panelMatchHistory.style.display = 'none';
    this.resultScoreboard.style.display = 'table';
  }
}

export const uiManager = new UIManager();

