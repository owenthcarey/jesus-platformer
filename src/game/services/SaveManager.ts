export interface ProgressData {
  unlockedLevel: number;
  completedLevels: number[];
  bestTimes: Record<number, number>;
  bestRatings: Record<number, number>;
  scripturesFound: string[];
  soundOn: boolean;
}

const STORAGE_KEY = 'the-way-progress-v1';

const defaults: ProgressData = {
  unlockedLevel: 1,
  completedLevels: [],
  bestTimes: {},
  bestRatings: {},
  scripturesFound: [],
  soundOn: true,
};

export class SaveManager {
  static load(): ProgressData {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaults, ...JSON.parse(saved) as ProgressData } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  static update(update: Partial<ProgressData>): ProgressData {
    const next = { ...this.load(), ...update };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The game remains fully playable when storage is unavailable.
    }
    return next;
  }

  static completeLevel(level: number, elapsedMs: number, rating: number, found: string[]): ProgressData {
    const current = this.load();
    const previousTime = current.bestTimes[level];
    const completedLevels = Array.from(new Set([...current.completedLevels, level]));
    return this.update({
      completedLevels,
      unlockedLevel: Math.max(current.unlockedLevel, Math.min(level + 1, 4)),
      bestTimes: {
        ...current.bestTimes,
        [level]: previousTime ? Math.min(previousTime, elapsedMs) : elapsedMs,
      },
      bestRatings: {
        ...current.bestRatings,
        [level]: Math.max(current.bestRatings[level] ?? 0, rating),
      },
      scripturesFound: Array.from(new Set([...current.scripturesFound, ...found])),
    });
  }

  static reset(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage restrictions.
    }
  }
}
