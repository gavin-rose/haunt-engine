import { T, type HauntMap } from "@/haunt/generate";
import tilesMeta from "./assets/tiles.json";

export const TILE = 32;
type Meta = typeof tilesMeta & { frames: [number, number, number, number][] };
const META = tilesMeta as Meta;
export const CEILING_FILL = META.ceilingFill;

const TRIM_FOR_WALLS: Record<string, keyof typeof META.ceilings> = {
  stone: "stone",
  dark_stone: "grey_brick",
  cobble: "stone",
  brick: "dark_wood",
  plaster: "plaster",
  institutional: "plaster",
  tile: "plaster",
};

const DECAL_TINT: Record<string, [string, number]> = {
  water: ["#3d7da0", 0.55],
  scorch: ["#0d0806", 0.75],
  vines: ["#3f7a2e", 0.7],
  blood: ["#5e0b0b", 0.8],
  frost: ["#d8f0ff", 0.45],
  dust: ["#8f8470", 0.25],
};

export function paintGround(map: HauntMap, tiles: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * TILE;
  canvas.height = map.height * TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = CEILING_FILL;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= map.width || y >= map.height ? T.VOID : map.tiles[y * map.width + x];
  const roomAt = (x: number, y: number) => {
    const r = x < 0 || y < 0 || x >= map.width || y >= map.height ? -1 : map.roomIndex[y * map.width + x];
    return r >= 0 ? map.rooms[r] : null;
  };
  // FACE cells have no roomIndex; find their room by looking down the column
  const roomBelow = (x: number, y: number) => {
    for (let k = 0; k < 4; k++) {
      const r = roomAt(x, y + k);
      if (r) return r;
    }
    return null;
  };
  const corridorFloor = "worn_wood";
  const hiddenUnfound = new Set(map.doors.filter((d) => d.kind === "hidden").map((d) => d.y * map.width + d.x));
  const solid = (x: number, y: number) => {
    const t = at(x, y);
    return t === T.WALL || t === T.VOID || hiddenUnfound.has(y * map.width + x);
  };
  const draw = (frame: number, x: number, y: number) => {
    const [fx, fy, fw, fh] = META.frames[frame];
    ctx.drawImage(tiles, fx, fy, fw, fh, x * TILE, y * TILE, TILE, TILE);
  };

  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const t = at(x, y);
      if (t === T.VOID || t === T.WALL || t === T.FACE) continue;
      if (hiddenUnfound.has(y * map.width + x)) continue;
      const style = (roomAt(x, y)?.floor ?? corridorFloor) as keyof typeof META.floors;
      const block = META.floors[style] ?? META.floors.worn_wood;
      draw(block[(x & 1) + (y & 1) * 2], x, y);
      if (t === T.VENT) {
        ctx.fillStyle = "rgba(20,22,26,0.85)";
        ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        ctx.fillStyle = "rgba(110,118,128,0.9)";
        for (let i = 6; i < TILE - 4; i += 6) ctx.fillRect(x * TILE + i, y * TILE + 4, 2, TILE - 8);
      }
    }

  const tinted = new Map<string, HTMLCanvasElement[]>();
  const decalFrames = (kind: string) => {
    let list = tinted.get(kind);
    if (!list) {
      const [color] = DECAL_TINT[kind];
      list = META.decals.map((f) => {
        const c = document.createElement("canvas");
        c.width = c.height = TILE;
        const cx = c.getContext("2d")!;
        const [fx, fy, fw, fh] = META.frames[f];
        cx.drawImage(tiles, fx, fy, fw, fh, 0, 0, TILE, TILE);
        cx.globalCompositeOperation = "source-atop";
        cx.fillStyle = color;
        cx.fillRect(0, 0, TILE, TILE);
        return c;
      });
      tinted.set(kind, list);
    }
    return list;
  };
  for (const d of map.decals) {
    const list = decalFrames(d.kind);
    ctx.globalAlpha = DECAL_TINT[d.kind][1];
    ctx.drawImage(list[(d.x * 7 + d.y * 13) % list.length], d.x * TILE, d.y * TILE);
  }
  ctx.globalAlpha = 1;

  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (at(x, y) !== T.FACE) continue;
      const style = (roomBelow(x, y)?.walls ?? "plaster") as keyof typeof META.walls;
      const w = META.walls[style] ?? META.walls.plaster;
      const top = at(x, y - 1) !== T.FACE;
      const left = at(x - 1, y) !== T.FACE;
      const right = at(x + 1, y) !== T.FACE;
      const piece = top ? (left ? w.tl : right ? w.tr : w.t) : left ? w.bl : right ? w.br : w.b;
      draw(piece, x, y);
    }

  // ceiling trim: corner autotile over solid cells; a corner is "open" if it touches anything walkable
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (!solid(x, y)) continue;
      const open = (vx: number, vy: number) =>
        !solid(vx - 1, vy - 1) || !solid(vx, vy - 1) || !solid(vx - 1, vy) || !solid(vx, vy);
      const bits = [open(x, y), open(x + 1, y), open(x + 1, y + 1), open(x, y + 1)].map((b) => (b ? "1" : "0")).join("");
      if (bits === "0000") continue;
      const near = roomAt(x, y + 1) ?? roomAt(x, y - 1) ?? roomAt(x + 1, y) ?? roomAt(x - 1, y) ?? roomBelow(x, y + 1);
      const trimStyle = TRIM_FOR_WALLS[near?.walls ?? ""] ?? "wood";
      const set = META.ceilings[trimStyle] as Record<string, number>;
      const frame = set[bits] ?? set["1111"];
      if (frame !== undefined) draw(frame, x, y);
    }
  return canvas;
}

export function glowTexture(size: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
