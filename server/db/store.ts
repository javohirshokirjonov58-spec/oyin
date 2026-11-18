import fs from 'fs';
import path from 'path';
import { UserProfile, MatchHistoryItem, MatchResultPlayer } from '../../shared/types';
import { MMR_RULES } from '../../shared/constants';

interface DataStore {
  users: Record<string, UserProfile>;
  sessionTokens: Record<string, string>; // token -> userId
  matchHistory: Record<string, MatchHistoryItem[]>; // userId -> history
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

class Store {
  private data: DataStore = {
    users: {},
    sessionTokens: {},
    matchHistory: {}
  };

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('[Store] Failed to load data, starting fresh:', err);
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Store] Failed to save data:', err);
    }
  }

  public getOrCreateUser(nickname: string, existingToken?: string): UserProfile {
    // Check if token exists
    if (existingToken && this.data.sessionTokens[existingToken]) {
      const userId = this.data.sessionTokens[existingToken];
      const user = this.data.users[userId];
      if (user) {
        if (nickname && nickname.trim() && user.nickname !== nickname.trim()) {
          user.nickname = nickname.trim();
          this.save();
        }
        return user;
      }
    }

    // Check if nickname already exists
    const cleanNick = (nickname || 'Player').trim().slice(0, 16);
    const existing = Object.values(this.data.users).find(
      u => u.nickname.toLowerCase() === cleanNick.toLowerCase()
    );

    if (existing) {
      return existing;
    }

    // Create new user
    const id = 'usr_' + Math.random().toString(36).substring(2, 9);
    const sessionToken = 'tok_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const newUser: UserProfile = {
      id,
      nickname: cleanNick,
      sessionToken,
      mmr: MMR_RULES.INITIAL,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0
    };

    this.data.users[id] = newUser;
    this.data.sessionTokens[sessionToken] = id;
    this.data.matchHistory[id] = [];
    this.save();

    return newUser;
  }

  public getUserByToken(token: string): UserProfile | null {
    const userId = this.data.sessionTokens[token];
    if (!userId) return null;
    return this.data.users[userId] || null;
  }

  public getUserById(id: string): UserProfile | null {
    return this.data.users[id] || null;
  }

  public recordMatchResults(scoreboard: MatchResultPlayer[], mode = 'Arena Clash') {
    const dateStr = new Date().toISOString();

    scoreboard.forEach((p, index) => {
      const user = this.data.users[p.id];
      if (user) {
        user.mmr = Math.max(100, user.mmr + p.mmrDelta);
        user.kills += p.kills;
        user.deaths += p.deaths;
        if (p.rank === 1) {
          user.wins += 1;
        } else {
          user.losses += 1;
        }

        // Add history item
        if (!this.data.matchHistory[p.id]) {
          this.data.matchHistory[p.id] = [];
        }

        const historyItem: MatchHistoryItem = {
          id: 'hist_' + Math.random().toString(36).substring(2, 9),
          date: dateStr,
          mode,
          playersCount: scoreboard.length,
          rank: p.rank,
          characterClass: p.characterClass,
          kills: p.kills,
          deaths: p.deaths,
          damageDealt: p.damageDealt,
          mmrChange: p.mmrDelta
        };

        this.data.matchHistory[p.id].unshift(historyItem);
        // keep last 20
        if (this.data.matchHistory[p.id].length > 20) {
          this.data.matchHistory[p.id].pop();
        }
      }
    });

    this.save();
  }

  public getLeaderboard(limit = 20): UserProfile[] {
    return Object.values(this.data.users)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins)
      .slice(0, limit);
  }

  public getHistory(userId: string): MatchHistoryItem[] {
    return this.data.matchHistory[userId] || [];
  }
}

export const dbStore = new Store();

