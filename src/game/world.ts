import { T, type HauntMap, type Point } from "@/haunt/generate";

export class World {
  readonly blockedByProp: Uint8Array;
  readonly doorAt = new Map<number, HauntMap["doors"][number]>();
  /** locked doors the player has opened, hidden doors they've found */
  readonly opened = new Set<number>();
  readonly found = new Set<number>();
  /** doors slammed shut by an event, until a timestamp */
  readonly slammed = new Map<number, number>();

  constructor(readonly map: HauntMap) {
    this.blockedByProp = new Uint8Array(map.width * map.height);
    for (const p of map.props) {
      if (!p.blocking) continue;
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this.blockedByProp[this.i(x, y)] = 1;
    }
    for (const d of map.doors) this.doorAt.set(this.i(d.x, d.y), d);
  }

  i(x: number, y: number) {
    return y * this.map.width + x;
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.map.width && y < this.map.height;
  }
  tile(x: number, y: number) {
    return this.in(x, y) ? this.map.tiles[this.i(x, y)] : T.VOID;
  }
  roomAt(x: number, y: number) {
    const r = this.in(x, y) ? this.map.roomIndex[this.i(x, y)] : -1;
    return r >= 0 ? this.map.rooms[r] : null;
  }

  /** `who`: the player respects locks; ghosts drift through any door. */
  walkable(x: number, y: number, who: "player" | "ghost" | "body", now = 0): boolean {
    const t = this.tile(x, y);
    const k = this.i(x, y);
    if (t === T.FLOOR || t === T.VENT || t === T.EXIT) return !this.blockedByProp[k];
    if (t !== T.DOOR) return false;
    if (who === "ghost") return true;
    if ((this.slammed.get(k) ?? 0) > now) return false;
    const d = this.doorAt.get(k)!;
    if (d.kind === "locked") return this.opened.has(k);
    if (d.kind === "hidden") return this.found.has(k) || who === "body";
    return true;
  }

  blocksLight(x: number, y: number) {
    const t = this.tile(x, y);
    if (t === T.WALL || t === T.VOID || t === T.FACE) return true;
    if (t === T.DOOR) {
      const d = this.doorAt.get(this.i(x, y))!;
      return d.kind === "hidden" && !this.found.has(this.i(x, y));
    }
    return false;
  }

  lineOfSight(a: Point, b: Point): boolean {
    let x = a.x,
      y = a.y;
    const dx = Math.abs(b.x - a.x),
      dy = -Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1,
      sy = a.y < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x === b.x && y === b.y) return true;
      if ((x !== a.x || y !== a.y) && this.blocksLight(x, y)) return false;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** shortest walkable path, excluding `from`; empty if unreachable */
  pathTo(from: Point, to: Point, who: "player" | "ghost" | "body", now: number): Point[] {
    const start = this.i(from.x, from.y);
    const goal = this.i(to.x, to.y);
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === goal) break;
      const cx = cur % this.map.width,
        cy = Math.floor(cur / this.map.width);
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox,
          ny = cy + oy;
        const n = this.i(nx, ny);
        if (prev.has(n) || !this.in(nx, ny)) continue;
        if (n !== goal && !this.walkable(nx, ny, who, now)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(goal) || goal === start) return [];
    const path: Point[] = [];
    for (let k = goal; k !== start; k = prev.get(k)!) path.push({ x: k % this.map.width, y: Math.floor(k / this.map.width) });
    return path.reverse();
  }

  /** next step from `from` toward `to`, BFS over walkable tiles; null if unreachable */
  stepToward(from: Point, to: Point, who: "ghost" | "body", now: number, maxNodes = 4000): Point | null {
    if (from.x === to.x && from.y === to.y) return null;
    const start = this.i(from.x, from.y);
    const goal = this.i(to.x, to.y);
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length && head < maxNodes; head++) {
      const cur = queue[head];
      if (cur === goal) break;
      const cx = cur % this.map.width,
        cy = Math.floor(cur / this.map.width);
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox,
          ny = cy + oy;
        const n = this.i(nx, ny);
        if (prev.has(n) || !this.in(nx, ny)) continue;
        if (n !== goal && !this.walkable(nx, ny, who, now)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(goal)) return null;
    let k = goal;
    while (prev.get(k) !== start) k = prev.get(k)!;
    return { x: k % this.map.width, y: Math.floor(k / this.map.width) };
  }
}

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
