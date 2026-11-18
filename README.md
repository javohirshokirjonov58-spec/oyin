# Arena Clash 2D ⚔️

Real-time 2D Multiplayer Fighting Arena o‘yini (100% Server-Authoritative arxitekturada).

## 🚀 Ishga tushirish (Live Dev Servers)

Loyiha hozirda Antigravity IDE muhitida to‘liq ishga tushirilgan:
- **Frontend (Vite UI):** [http://localhost:5173](http://localhost:5173)
- **Backend (Node.js Express + WS API):** [http://localhost:3001](http://localhost:3001)

### Qayta ishga tushirish buyruqlari:
```bash
# Barcha bog'liqliklarni o'rnatish
npm install

# Backend va Frontendni bir vaqtda ishga tushirish
npm run dev

# Alohida ishga tushirish
npm run dev:server  # Port 3001
npm run dev:client  # Port 5173
```

---

## 🎮 O‘yin Rejimlari va Boshqaruv

### 1. Online Multiplayer Rejimi (Quick Match & Private Room)
- **Harakat:** `W`, `A`, `S`, `D` (8 yo‘nalishli vektor normallashtirilgan harakat)
- **Nishonga olish:** Sichqoncha ko‘rsatkichi (Mouse cursor)
- **Oddiy hujum (`J`):** Light Attack — tezkor zarba, past cooldown
- **Kuchli hujum (`K`):** Heavy Attack — yuqori zarar, knockback / AoE
- **Maxsus qobiliyat (`L`):** Special Skill — qahramonning eng kuchli mahorati
- **Dodge (`Space`):** Qisqa masofaga dash va 200ms davomida i-frame (zarar yetmaslik holati)

### 2. Offline 2-Player Practice (Bitta klaviaturada 2 kishi)
- **1-O‘yinchi (P1):**
  - Harakat: `W`, `A`, `S`, `D`
  - Zarbalar: `J` (Light), `K` (Heavy), `L` (Special), `Space` (Dodge)
- **2-O‘yinchi (P2):**
  - Harakat: `↑`, `←`, `↓`, `→` (Strelkalar)
  - Zarbalar: `Numpad 1` yoki `U` (Light), `Numpad 2` yoki `I` (Heavy), `Numpad 3` yoki `O` (Special), `Numpad 0` yoki `P` / `Right Shift` (Dodge)

---

## 🛡️ Qahramonlar Balansi (3 ta Sinf)

| Xususiyat | Warrior (Jangchi) | Rogue (Chaqqon) | Mage (Sehrgar) |
| :--- | :--- | :--- | :--- |
| **HP** | 150 | 100 | 90 |
| **Tezlik** | 220 px/sek | 310 px/sek | 240 px/sek |
| **J (Light)** | Sword Slash (15 DMG, 0.4s CD) | Dagger Thrust (12 DMG, 0.25s CD) | Magic Orb (10 DMG, 420px Range) |
| **K (Heavy)** | Shield Bash (25 DMG + Knockback) | Dual Slice (22 DMG, 1.2s CD) | Explosion Wave (28 DMG, 85px AoE) |
| **L (Special)** | Whirlwind (35 DMG, 360° AoE) | Shadow Step (30 DMG, Teleport) | Arcane Laser (40 DMG, 680px Beam) |
| **Space (Dodge)** | Power Dash (120px, 3.0s CD) | Shadow Roll (180px, 1.8s CD) | Arcane Blink (150px, 2.5s CD) |

---

## ⚡ Tarmoq Arxitekturasi va Server Authority

1. **30 Hz Server Tick Rate:** Server har 33.33 ms da o‘yin holatini hisoblab, barcha mijozlarga authoritative `SNAPSHOT` yuboradi.
2. **Client-Side Prediction:** WASD bosilganda client zudlik bilan harakatlanadi (0 latency hissi).
3. **Server Reconciliation:** Serverdan tasdiqlangan `lastProcessedInputSeq` kelganda, unga asoslanib unacknowledged inputlar qayta qo‘llanadi.
4. **Entity Interpolation:** Boshqa o‘yinchilar 100 ms kechikish bilan oxirgi ikki snapshot orasida silliq lerp qilinadi (harakat sakrab qolmaydi).
5. **Anti-Cheat & Rate Limiting:**
   - Client o‘z (x,y) koordinatasini o‘zgartira olmaydi; server tezlikni va chegaralarni tekshiradi.
   - 1 soniyada 60 tadan ortiq paket yuborgan ulanish avtomatik disconnect qilinadi.
   - Cooldown va i-frame holati server tomonidan qat’iy tekshiriladi.
6. **45s Reconnect Mexanizmi:** O‘yinchi sahifani yangilasa (F5) yoki internet uzilsa, `sessionToken` orqali 45 soniya ichida aynan o‘z xonasiga va qahramoniga qayta ulanadi.
7. **MMR va Statistika:** Har bir g‘alaba va mag‘lubiyat `data/store.json` bazasida saqlanadi va Global Top-20 Leaderboard hamda Match Historyda aks etadi.

