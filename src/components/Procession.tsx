"use client";

import { useEffect, useState } from "react";
import type { Appearance } from "@/game/look";

const base: Appearance = {
  body: "male",
  skin: "light",
  head: "human",
  hair: "none",
  hair_color: "black",
  beard: "none",
  top: "none",
  top_color: "black",
  outer: "none",
  outer_color: "black",
  bottom: "pants",
  bottom_color: "black",
  shoes: "shoes",
  hat: "none",
  hat_color: "black",
  face: "none",
  neck: "none",
  held: "none",
  wound: "none",
};

const MARCHERS: { look: Appearance; ghost?: boolean }[] = [
  { look: { ...base, body: "skeleton", head: "skeleton", hat: "top_hat", outer: "frock_coat", neck: "bowtie" } },
  { look: { ...base, body: "female", skin: "lavender", head: "elderly", hair: "bun", hair_color: "white", top: "dress", top_color: "maroon", bottom: "long_skirt", bottom_color: "maroon", neck: "cross" }, ghost: true },
  { look: { ...base, head: "pumpkin", outer: "tattered_cape", outer_color: "black", held: "shovel" } },
  { look: { ...base, body: "child", skin: "pale_green", head: "human", hair: "messy", hair_color: "raven", top: "longsleeve", top_color: "white", bottom_color: "navy" }, ghost: true },
  { look: { ...base, body: "zombie", head: "zombie", skin: "zombie", top: "buttoned_shirt", top_color: "gray", outer: "vest", outer_color: "brown", hat: "bowler", wound: "ribs" } },
  { look: { ...base, body: "female", skin: "bronze", hair: "braid", hair_color: "black", top: "blouse", top_color: "white", bottom: "long_skirt", bottom_color: "orange", neck: "necklace" } },
];

const SCALE = 2;

export function Procession() {
  const [sheets, setSheets] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    import("@/game/compose").then(async ({ composeSheet }) => {
      const urls = await Promise.all(MARCHERS.map(async (m) => (await composeSheet(m.look, "walk")).toDataURL()));
      if (alive) setSheets(urls);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 overflow-hidden">
      <style>{`
        @keyframes march { from { transform: translateX(-160px); } to { transform: translateX(calc(100vw + 160px)); } }
        @keyframes step { from { background-position-x: ${-64 * SCALE}px; } to { background-position-x: ${-64 * SCALE * 9}px; } }
      `}</style>
      {sheets.map((url, i) => (
        <div
          key={i}
          className="absolute bottom-6"
          style={{ animation: `march 46s linear ${-i * 7.5}s infinite`, opacity: MARCHERS[i].ghost ? 0.55 : 0.9 }}
        >
          <div
            className="pixelated"
            style={{
              width: 64 * SCALE,
              height: 64 * SCALE,
              backgroundImage: `url(${url})`,
              backgroundSize: `${576 * SCALE}px ${256 * SCALE}px`,
              backgroundPositionY: `${-3 * 64 * SCALE}px`,
              animation: "step 0.9s steps(8) infinite",
              filter: MARCHERS[i].ghost ? "grayscale(0.6) brightness(1.25) sepia(0.15) hue-rotate(170deg)" : "none",
            }}
          />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-6 h-px bg-paper/10" />
    </div>
  );
}
