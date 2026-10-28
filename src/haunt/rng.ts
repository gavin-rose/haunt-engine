import seedrandom from "seedrandom";

export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  shuffle<T>(list: T[]): T[];
  chance(p: number): boolean;
};

export function makeRng(seed: string): Rng {
  const r = seedrandom(seed);
  const rng: Rng = {
    next: () => r(),
    int: (min, max) => min + Math.floor(r() * (max - min + 1)),
    pick: (list) => list[Math.floor(r() * list.length)],
    shuffle: (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    },
    chance: (p) => r() < p,
  };
  return rng;
}
