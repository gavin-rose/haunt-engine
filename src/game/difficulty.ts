export type Difficulty = {
  id: "mourner" | "visitor" | "restless";
  name: string;
  blurb: string;
  /** candles: how many times you can be caught */
  lives: number;
  enemySpeed: number;
  light: number;
  guide: boolean;
};

export const DIFFICULTIES: Difficulty[] = [
  {
    id: "mourner",
    name: "Mourner",
    blurb: "Three candles. Marigolds show the way. The dead are slow.",
    lives: 3,
    enemySpeed: 0.65,
    light: 1.3,
    guide: true,
  },
  {
    id: "visitor",
    name: "Visitor",
    blurb: "Two candles. Find your own way.",
    lives: 2,
    enemySpeed: 0.85,
    light: 1,
    guide: false,
  },
  {
    id: "restless",
    name: "Restless",
    blurb: "One candle, a small light, and no help.",
    lives: 1,
    enemySpeed: 1.1,
    light: 0.8,
    guide: false,
  },
];

export const difficultyById = (id: string | null | undefined) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
