export type CharacterClass = 'warrior' | 'rogue' | 'mage';

export interface AttackConfig {
  name: string;
  damage: number;
  cooldown: number; // in seconds
  description: string;
  range?: number;
  radius?: number;
  knockback?: number;
  projectileSpeed?: number;
  aoeRadius?: number;
  duration?: number;
}

export interface CharacterConfig {
  id: CharacterClass;
  name: string;
  title: string;
  description: string;
  hp: number;
  speed: number; // pixels per second
  radius: number; // collision radius
  color: string;
  accentColor: string;
  skills: {
    light: AttackConfig;   // J key
    heavy: AttackConfig;   // K key
    special: AttackConfig; // L key
    dodge: {
      name: string;
      cooldown: number; // in seconds
      distance: number; // in pixels
      duration: number; // dash duration in seconds
      iframeDuration: number; // invulnerability duration (0.2s)
      description: string;
    };
  };
}

export const CHARACTERS: Record<CharacterClass, CharacterConfig> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    title: 'Qalqonli Bahodir',
    description: 'Yuqori HP va mustahkam himoyaga ega yaqin jang ustasi. AoE aylanma zarba beradi.',
    hp: 150,
    speed: 220,
    radius: 26,
    color: '#e74c3c',
    accentColor: '#f39c12',
    skills: {
      light: {
        name: 'Sword Slash',
        damage: 15,
        cooldown: 0.4,
        radius: 65,
        description: 'Tezkor qilich zarbasi (15 DMG, 0.4s CD, 65px radius)'
      },
      heavy: {
        name: 'Shield Bash',
        damage: 25,
        cooldown: 1.5,
        radius: 55,
        knockback: 260,
        description: 'Qalqon zarbasi va orqaga itarish (25 DMG + Knockback, 1.5s CD)'
      },
      special: {
        name: 'Whirlwind',
        damage: 35,
        cooldown: 6.0,
        radius: 100,
        duration: 0.5,
        description: '360° aylanma xavfli zarba (35 DMG, 6.0s CD, 100px radius)'
      },
      dodge: {
        name: 'Power Dash',
        cooldown: 3.0,
        distance: 120,
        duration: 0.2,
        iframeDuration: 0.2,
        description: 'Zirhli tez siljish (120px masofa, 3.0s CD, 200ms i-frame)'
      }
    }
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    title: 'Soyalar Qotili',
    description: 'Eng yuqori harakat tezligiga ega chaqqon qotil. Teleport orqali kutilmagan zarba beradi.',
    hp: 100,
    speed: 310,
    radius: 20,
    color: '#2ecc71',
    accentColor: '#1abc9c',
    skills: {
      light: {
        name: 'Dagger Thrust',
        damage: 12,
        cooldown: 0.25,
        radius: 45,
        description: 'Yashin tezligida xanjar sanchish (12 DMG, 0.25s CD, 45px radius)'
      },
      heavy: {
        name: 'Dual Slice',
        damage: 22,
        cooldown: 1.2,
        radius: 55,
        description: 'Ikki karra kesuvchi xanjar zarbasi (22 DMG, 1.2s CD)'
      },
      special: {
        name: 'Shadow Step',
        damage: 30,
        cooldown: 5.0,
        range: 250,
        radius: 50,
        description: 'Oldinga 250px teleportatsiya va orqadan qora zarba (30 DMG, 5.0s CD)'
      },
      dodge: {
        name: 'Shadow Roll',
        cooldown: 1.8,
        distance: 180,
        duration: 0.18,
        iframeDuration: 0.2,
        description: 'Tezkor yumalash (180px masofa, 1.8s CD, 200ms i-frame)'
      }
    }
  },
  mage: {
    id: 'mage',
    name: 'Mage',
    title: 'Sehr Ustozi',
    description: 'Uzoq masofadan sehrli otishmalar va nurli lazer orqali ulkan zarar yetkazuvchi sehrgar.',
    hp: 90,
    speed: 240,
    radius: 20,
    color: '#3498db',
    accentColor: '#9b59b6',
    skills: {
      light: {
        name: 'Magic Orb',
        damage: 10,
        cooldown: 0.5,
        range: 420,
        projectileSpeed: 560,
        radius: 12,
        description: 'Uzoqqa uchuvchi sehrli shar (10 DMG, 0.5s CD, 420px range)'
      },
      heavy: {
        name: 'Explosion Wave',
        damage: 28,
        cooldown: 2.0,
        range: 120,
        aoeRadius: 85,
        description: 'Portlovchi sehr to‘lqini (28 DMG, 2.0s CD, 85px AoE radius)'
      },
      special: {
        name: 'Arcane Laser',
        damage: 40,
        cooldown: 7.0,
        range: 680,
        duration: 0.35,
        description: 'Teshuvchi to‘g‘ri chiziqli kuchli nur (40 DMG, 7.0s CD, 680px laser)'
      },
      dodge: {
        name: 'Arcane Blink',
        cooldown: 2.5,
        distance: 150,
        duration: 0.18,
        iframeDuration: 0.2,
        description: 'Sehrli fazoviy sakrash (150px masofa, 2.5s CD, 200ms i-frame)'
      }
    }
  }
};

