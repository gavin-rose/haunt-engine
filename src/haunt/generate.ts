import type { Connection, HauntBlueprint, Room } from "./schema";
import { furnitureRule, PROPS, type FurnitureRule } from "./furniture";
import { makeRng, type Rng } from "./rng";

// blueprint + seed → tile map. The blueprint says what rooms exist and how they connect;
// this decides where everything physically goes. Deterministic for a given seed.

export const T = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, EXIT: 4, VENT: 5, FACE: 6 } as const;

/** rooms are drawn in 3/4 view: the top rows of every room are the north wall's face */
export const FACE_ROWS = 2;

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type MapRoom = Rect & Pick<Room, "id" | "name" | "condition" | "dark" | "mood" | "floor" | "walls">;
export type MapDoor = Point & { kind: Connection["kind"]; key?: string; from: string; to: string };
/** x,y,w,h is the footprint; the sprite is drawn bottom-aligned on it and may be taller */
export type MapProp = Rect & { name: string; blocking: boolean; room: string };
export type DecalKind = "water" | "scorch" | "vines" | "blood" | "frost" | "dust";
export type MapDecal = Point & { kind: DecalKind };

export type HauntMap = {
  width: number;
  height: number;
  tiles: number[];
  /** index into `rooms` for interior cells, -1 elsewhere */
  roomIndex: number[];
  rooms: MapRoom[];
  doors: MapDoor[];
  props: MapProp[];
  decals: MapDecal[];
  items: (Point & { id: string })[];
  actors: (Point & { id: string })[];
  exits: (Point & { room: string })[];
  spawn: Point;
  notes: string[];
};

const GRID = 220;
const CORRIDOR = -2;
const NONE = -1;

class Grid {
  t = new Uint8Array(GRID * GRID);
  owner = new Int16Array(GRID * GRID).fill(NONE);
  blocked = new Uint8Array(GRID * GRID);
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < GRID && y < GRID;
  }
  get(x: number, y: number) {
    return this.in(x, y) ? this.t[y * GRID + x] : T.WALL;
  }
  set(x: number, y: number, v: number, owner?: number) {
    this.t[y * GRID + x] = v;
    if (owner !== undefined) this.owner[y * GRID + x] = owner;
  }
  ownerAt(x: number, y: number) {
    return this.in(x, y) ? this.owner[y * GRID + x] : NONE;
  }
}

const SIDES = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;
type Side = (typeof SIDES)[number];

function roomDims(size: Room["size"], rng: Rng): { w: number; h: number } {
  switch (size) {
    case "small":
      return { w: rng.int(4, 6), h: FACE_ROWS + rng.int(3, 4) };
    case "medium":
      return { w: rng.int(6, 9), h: FACE_ROWS + rng.int(4, 6) };
    case "large":
      return { w: rng.int(9, 12), h: FACE_ROWS + rng.int(6, 8) };
    case "hall":
      return rng.chance(0.5) ? { w: rng.int(10, 16), h: FACE_ROWS + 2 } : { w: 3, h: rng.int(10, 15) };
  }
}

export function generateMap(bp: HauntBlueprint, seed: string): HauntMap {
  const rng = makeRng(`${seed}:map`);
  const g = new Grid();
  const notes: string[] = [];
  const idx = new Map(bp.rooms.map((r, i) => [r.id, i]));
  const dims = bp.rooms.map((r) => roomDims(r.size, rng));
  const placed: (Rect | null)[] = bp.rooms.map(() => null);
  const doors: MapDoor[] = [];
  /** interior cells that must stay walkable because something opens onto them */
  const entrances: Point[][] = bp.rooms.map(() => []);

  // --- layout: BFS spanning tree from the start room, children attached by corridors ---
  const startI = idx.get(bp.start)!;
  const s = dims[startI];
  placeRoom(g, startI, { x: (GRID - s.w) >> 1, y: (GRID - s.h) >> 1, ...s }, placed);

  const deferred: Connection[] = [];
  const queue = [startI];
  const seen = new Set([startI]);
  const treeEdges = new Set<Connection>();
  while (queue.length) {
    const p = queue.shift()!;
    for (const c of bp.connections) {
      const other = idx.get(c.from) === p ? idx.get(c.to) : idx.get(c.to) === p ? idx.get(c.from) : undefined;
      if (other === undefined || seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
      treeEdges.add(c);
      if (!attach(g, rng, p, other, dims[other], c, placed, doors, entrances)) {
        floatNear(g, rng, p, other, dims[other], placed);
        deferred.push(c);
      }
    }
  }
  for (let i = 0; i < placed.length; i++) {
    if (!placed[i]) {
      // disconnected in the blueprint (repair should prevent this)
      floatNear(g, rng, startI, i, dims[i], placed);
      notes.push(`room ${bp.rooms[i].id} has no connection`);
    }
  }

  // --- cycles and rooms that couldn't sit next to their parent get carved corridors ---
  // Deferred tree edges hold the building together and may be any length; cycles are
  // optional and dropped rather than snaking a corridor around the whole map.
  const extra = [
    ...deferred.map((c) => ({ c, maxLen: Infinity })),
    ...bp.connections.filter((c) => !treeEdges.has(c)).map((c) => ({ c, maxLen: 20 })),
  ];
  for (const { c, maxLen } of extra) {
    const a = idx.get(c.from)!;
    const b = idx.get(c.to)!;
    if (!carve(g, rng, a, b, c, placed, doors, entrances, maxLen)) {
      notes.push(`could not build ${c.kind} ${c.from}->${c.to}`);
    }
  }

  const rooms: MapRoom[] = bp.rooms.map((r, i) => ({
    ...placed[i]!,
    id: r.id,
    name: r.name,
    condition: r.condition,
    dark: r.dark,
    mood: r.mood,
    floor: r.floor,
    walls: r.walls,
  }));

  const exits: (Point & { room: string })[] = [];
  for (const o of bp.objectives) {
    if (o.kind !== "escape" || !idx.has(o.target)) continue;
    const i = idx.get(o.target)!;
    const spot = rng.shuffle(wallCandidates(g, placed[i]!))[0];
    if (!spot) {
      notes.push(`no outer wall for exit in ${o.target}`);
      continue;
    }
    g.set(spot.wall.x, spot.wall.y, T.EXIT);
    exits.push({ ...spot.wall, room: o.target });
    entrances[i].push(spot.inner);
  }

  bp.rooms.forEach((_, i) => raiseFaces(g, placed[i]!));

  const props: MapProp[] = [];
  bp.rooms.forEach((r, i) => {
    for (const name of r.furniture) furnish(g, rng, placed[i]!, i, r.id, name, furnitureRule(name), entrances[i], props);
  });

  const decals: MapDecal[] = [];
  bp.rooms.forEach((r, i) => decorate(g, rng, placed[i]!, i, r, entrances[i], props, decals));

  const taken = new Set<number>();
  const startRect = placed[startI]!;
  const spawn = freeCellNear(g, startRect, startI, taken, {
    x: startRect.x + (startRect.w >> 1),
    y: startRect.y + (startRect.h >> 1),
  });
  taken.add(key(spawn));

  const items = bp.items.map((it) => {
    const i = idx.get(it.room)!;
    const p = randomFreeCell(g, rng, placed[i]!, i, taken, entrances[i]) ?? spawn;
    taken.add(key(p));
    return { id: it.id, ...p };
  });

  const actors = bp.cast.map((c) => {
    const i = idx.get(c.room)!;
    let p: Point | null = null;
    for (let tries = 0; tries < 20; tries++) {
      p = randomFreeCell(g, rng, placed[i]!, i, taken, entrances[i]);
      if (!p || !c.hostile || dist(p, spawn) >= 6) break;
    }
    p ??= spawn;
    taken.add(key(p));
    return { id: c.id, ...p };
  });

  return crop(g, { rooms, doors, props, decals, items, actors, exits, spawn, notes });
}

function placeRoom(g: Grid, i: number, r: Rect, placed: (Rect | null)[]) {
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (inside) g.set(x, y, T.FLOOR, i);
      else if (g.get(x, y) === T.VOID) g.set(x, y, T.WALL);
    }
  }
  placed[i] = r;
}

/** Turn each room's top rows into wall face, except columns that a north door opens into. */
function raiseFaces(g: Grid, r: Rect) {
  for (let x = r.x; x < r.x + r.w; x++) {
    const above = g.get(x, r.y - 1);
    if (above !== T.WALL) continue;
    for (let y = r.y; y < r.y + FACE_ROWS && y < r.y + r.h - 1; y++) g.set(x, y, T.FACE);
  }
}

/** interior must be empty; the wall ring may share existing walls but nothing walkable */
function fits(g: Grid, r: Rect) {
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (!g.in(x, y)) return false;
      const t = g.get(x, y);
      const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (inside ? t !== T.VOID : t !== T.VOID && t !== T.WALL) return false;
    }
  }
  return true;
}

function corridorCellOk(g: Grid, x: number, y: number) {
  if (g.get(x, y) !== T.VOID) return false;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const t = g.get(x + ox, y + oy);
      if (t !== T.VOID && t !== T.WALL) return false;
    }
  return true;
}

function paintCorridor(g: Grid, cells: Point[], vent: boolean) {
  for (const c of cells) g.set(c.x, c.y, vent ? T.VENT : T.FLOOR, CORRIDOR);
  for (const c of cells)
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) if (g.get(c.x + ox, c.y + oy) === T.VOID) g.set(c.x + ox, c.y + oy, T.WALL);
}

function wallPoint(p: Rect, side: Side, along: number): Point {
  if (side.dx === 1) return { x: p.x + p.w, y: p.y + along };
  if (side.dx === -1) return { x: p.x - 1, y: p.y + along };
  if (side.dy === 1) return { x: p.x + along, y: p.y + p.h };
  return { x: p.x + along, y: p.y - 1 };
}

function attach(
  g: Grid,
  rng: Rng,
  parent: number,
  child: number,
  d: { w: number; h: number },
  c: Connection,
  placed: (Rect | null)[],
  doors: MapDoor[],
  entrances: Point[][],
): boolean {
  const p = placed[parent]!;
  for (let attempt = 0; attempt < 80; attempt++) {
    // hidden doors only in side walls: a gap in a north wall's face would give them away
    const side = c.kind === "hidden" ? rng.pick(SIDES.slice(0, 2)) : rng.pick(SIDES);
    const horizontal = side.dx !== 0;
    const span = horizontal ? p.h : p.w;
    // doors in side walls must open below the wall face
    const along = rng.int(horizontal ? FACE_ROWS : 0, span - 1);
    const L = c.kind === "vent" ? rng.int(2, 5) : rng.pick([0, 0, 1, 1, 2, 3, 4]);
    const pw = wallPoint(p, side, along);
    if (g.get(pw.x, pw.y) !== T.WALL) continue;

    const corridor: Point[] = [];
    for (let k = 1; k <= L; k++) corridor.push({ x: pw.x + side.dx * k, y: pw.y + side.dy * k });
    const cw = L === 0 ? pw : { x: pw.x + side.dx * (L + 1), y: pw.y + side.dy * (L + 1) };

    const off = horizontal ? rng.int(FACE_ROWS, d.h - 1) : rng.int(0, d.w - 1);
    let r: Rect;
    if (side.dx === 1) r = { x: cw.x + 1, y: cw.y - off, ...d };
    else if (side.dx === -1) r = { x: cw.x - d.w, y: cw.y - off, ...d };
    else if (side.dy === 1) r = { x: cw.x - off, y: cw.y + 1, ...d };
    else r = { x: cw.x - off, y: cw.y - d.h, ...d };

    if (!fits(g, r)) continue;
    if (!corridor.every((q) => corridorCellOk(g, q.x, q.y))) continue;
    if (L > 0 && g.get(cw.x, cw.y) !== T.VOID && g.get(cw.x, cw.y) !== T.WALL) continue;

    placeRoom(g, child, r, placed);
    if (L > 0) {
      paintCorridor(g, corridor, c.kind === "vent");
      g.set(pw.x, pw.y, c.kind === "vent" ? T.VENT : T.FLOOR, CORRIDOR);
    }
    makeDoor(g, cw, c, doors);
    entrances[parent].push({ x: pw.x - side.dx, y: pw.y - side.dy });
    entrances[child].push({ x: cw.x + side.dx, y: cw.y + side.dy });
    return true;
  }
  return false;
}

function makeDoor(g: Grid, at: Point, c: Connection, doors: MapDoor[]) {
  if (c.kind === "open") {
    g.set(at.x, at.y, T.FLOOR, CORRIDOR);
    return;
  }
  g.set(at.x, at.y, T.DOOR, CORRIDOR);
  doors.push({ ...at, kind: c.kind, key: c.key, from: c.from, to: c.to });
}

function floatNear(g: Grid, rng: Rng, near: number, i: number, d: { w: number; h: number }, placed: (Rect | null)[]) {
  const p = placed[near]!;
  for (let radius = 4; radius < GRID / 2; radius += 2) {
    for (let k = 0; k < 40; k++) {
      const r = {
        x: p.x + rng.int(-radius - d.w, p.w + radius),
        y: p.y + rng.int(-radius - d.h, p.h + radius),
        ...d,
      };
      if (fits(g, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 })) {
        placeRoom(g, i, r, placed);
        return;
      }
    }
  }
  throw new Error("map grid exhausted");
}

function wallCandidates(g: Grid, r: Rect, sidesOnly = false): { wall: Point; out: Point; inner: Point }[] {
  const res: { wall: Point; out: Point; inner: Point }[] = [];
  for (const side of sidesOnly ? SIDES.slice(0, 2) : SIDES) {
    const span = side.dx !== 0 ? r.h : r.w;
    for (let a = side.dx !== 0 ? FACE_ROWS : 0; a < span; a++) {
      const wall = wallPoint(r, side, a);
      const out = { x: wall.x + side.dx, y: wall.y + side.dy };
      const inner = { x: wall.x - side.dx, y: wall.y - side.dy };
      if (g.get(wall.x, wall.y) === T.WALL && corridorCellOk(g, out.x, out.y)) res.push({ wall, out, inner });
    }
  }
  return res;
}

function carve(
  g: Grid,
  rng: Rng,
  a: number,
  b: number,
  c: Connection,
  placed: (Rect | null)[],
  doors: MapDoor[],
  entrances: Point[][],
  maxLen: number,
): boolean {
  const ca = rng.shuffle(wallCandidates(g, placed[a]!)).slice(0, 14);
  const cb = rng.shuffle(wallCandidates(g, placed[b]!, c.kind === "hidden")).slice(0, 14);
  const pairs = ca
    .flatMap((x) => cb.map((y) => ({ x, y, d: Math.abs(x.out.x - y.out.x) + Math.abs(x.out.y - y.out.y) })))
    .sort((p, q) => p.d - q.d)
    .slice(0, 6);
  for (const { x: from, y: to } of pairs) {
    const path = astar(g, from.out, to.out);
    if (!path || path.length > maxLen) continue;
    paintCorridor(g, path, c.kind === "vent");
    g.set(from.wall.x, from.wall.y, c.kind === "vent" ? T.VENT : T.FLOOR, CORRIDOR);
    makeDoor(g, to.wall, c, doors);
    entrances[a].push(from.inner);
    entrances[b].push(to.inner);
    return true;
  }
  return false;
}

function astar(g: Grid, from: Point, to: Point): Point[] | null {
  const goal = key(to);
  const open = new Heap<number>();
  const cost = new Map<number, number>([[key(from), 0]]);
  const prev = new Map<number, number>();
  open.push(key(from), 0);
  let expanded = 0;
  while (open.size && expanded++ < 40000) {
    const cur = open.pop()!;
    if (cur === goal) {
      const path: Point[] = [];
      for (let k: number | undefined = cur; k !== undefined; k = prev.get(k)) path.push(unkey(k));
      return path.reverse();
    }
    const p = unkey(cur);
    for (const s of SIDES) {
      const n = { x: p.x + s.dx, y: p.y + s.dy };
      const nk = key(n);
      if (nk !== goal && !corridorCellOk(g, n.x, n.y)) continue;
      const turn = prev.has(cur) && key({ x: p.x - s.dx, y: p.y - s.dy }) !== prev.get(cur) ? 0.5 : 0;
      const c = cost.get(cur)! + 1 + turn;
      if (c < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, c);
        prev.set(nk, cur);
        open.push(nk, c + Math.abs(n.x - to.x) + Math.abs(n.y - to.y));
      }
    }
  }
  return null;
}

function furnish(
  g: Grid,
  rng: Rng,
  r: Rect,
  ri: number,
  roomId: string,
  name: string,
  rule: FurnitureRule,
  entrances: Point[],
  props: MapProp[],
) {
  const meta = PROPS[name];
  if (!meta) return;
  const area = r.w * (r.h - FACE_ROWS);
  const want = Math.min(rng.int(rule.count[0], rule.count[1]), Math.max(1, Math.floor(area / 5)));
  const spots = candidateSpots(r, rule, meta.fw, meta.fh, rng);
  let n = 0;
  for (const s of spots) {
    if (n >= want) break;
    const prop: MapProp = { x: s.x, y: s.y, w: meta.fw, h: meta.fh, name, blocking: meta.blocking, room: roomId };
    if (tryPlace(g, r, ri, prop, rule.placement === "mount", entrances, props)) n++;
  }
}

function candidateSpots(r: Rect, rule: FurnitureRule, w: number, h: number, rng: Rng): Point[] {
  const top = r.y + FACE_ROWS; // first walkable row
  const out: Point[] = [];
  switch (rule.placement) {
    case "mount":
      // hung on the lower row of the north wall face
      out.push(...rng.shuffle(range(r.x, r.x + r.w - w).map((x) => ({ x, y: top - 1 }))));
      break;
    case "wall": {
      // against the north wall reads best in 3/4 view; then the sides
      const north = range(r.x, r.x + r.w - w).map((x) => ({ x, y: top }));
      const west = range(top + 1, r.y + r.h - h).map((y) => ({ x: r.x, y }));
      const east = range(top + 1, r.y + r.h - h).map((y) => ({ x: r.x + r.w - w, y }));
      out.push(...rng.shuffle(north), ...rng.shuffle([...west, ...east]));
      break;
    }
    case "rows": {
      for (let y = top + 1; y + h <= r.y + r.h - 1; y += h + 1)
        for (let x = r.x + 1; x + w <= r.x + r.w - 1; x += w + 1) out.push({ x, y });
      break;
    }
    case "center": {
      const cx = r.x + ((r.w - w) >> 1);
      const cy = top + ((r.y + r.h - top - h) >> 1);
      out.push({ x: cx, y: cy }, { x: cx, y: cy + 1 }, { x: cx + 1, y: cy }, { x: cx - 1, y: cy });
      break;
    }
    case "corner":
      out.push(
        ...rng.shuffle([
          { x: r.x, y: top },
          { x: r.x + r.w - w, y: top },
          { x: r.x, y: r.y + r.h - h },
          { x: r.x + r.w - w, y: r.y + r.h - h },
        ]),
      );
      break;
    case "scatter":
      for (let k = 0; k < 30; k++) out.push({ x: rng.int(r.x, r.x + r.w - w), y: rng.int(top, r.y + r.h - h) });
      break;
  }
  return out;
}

function tryPlace(
  g: Grid,
  r: Rect,
  ri: number,
  prop: MapProp,
  mounted: boolean,
  entrances: Point[],
  props: MapProp[],
): boolean {
  const cells: Point[] = [];
  const want = mounted ? T.FACE : T.FLOOR;
  for (let y = prop.y; y < prop.y + prop.h; y++)
    for (let x = prop.x; x < prop.x + prop.w; x++) {
      if (g.ownerAt(x, y) !== ri || g.get(x, y) !== want) return false;
      if (entrances.some((e) => e.x === x && e.y === y)) return false;
      if (props.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) return false;
      cells.push({ x, y });
    }
  if (prop.blocking) {
    for (const c of cells) g.blocked[c.y * GRID + c.x] = 1;
    if (!roomStaysConnected(g, r, ri, entrances)) {
      for (const c of cells) g.blocked[c.y * GRID + c.x] = 0;
      return false;
    }
  }
  props.push(prop);
  return true;
}

/** every unblocked interior cell must be reachable from the first entrance */
function roomStaysConnected(g: Grid, r: Rect, ri: number, entrances: Point[]): boolean {
  const free = (x: number, y: number) =>
    g.ownerAt(x, y) === ri && g.get(x, y) === T.FLOOR && !g.blocked[y * GRID + x];
  let total = 0;
  let start: Point | null = entrances[0] ?? null;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (free(x, y)) {
        total++;
        start ??= { x, y };
      }
  if (!start || !free(start.x, start.y)) return false;
  const seen = new Set([key(start)]);
  const stack = [start];
  while (stack.length) {
    const p = stack.pop()!;
    for (const s of SIDES) {
      const n = { x: p.x + s.dx, y: p.y + s.dy };
      if (free(n.x, n.y) && !seen.has(key(n))) {
        seen.add(key(n));
        stack.push(n);
      }
    }
  }
  return seen.size === total;
}

const CONDITION_DECALS: Partial<Record<Room["condition"], { kind: DecalKind; density: number }>> = {
  flooded: { kind: "water", density: 0.45 },
  burned: { kind: "scorch", density: 0.3 },
  overgrown: { kind: "vines", density: 0.35 },
  bloodstained: { kind: "blood", density: 0.12 },
  frozen: { kind: "frost", density: 0.4 },
  dusty: { kind: "dust", density: 0.2 },
};

function decorate(
  g: Grid,
  rng: Rng,
  r: Rect,
  ri: number,
  room: Room,
  entrances: Point[],
  props: MapProp[],
  decals: MapDecal[],
) {
  const d = CONDITION_DECALS[room.condition];
  if (d) {
    const seeds = Array.from({ length: Math.max(1, Math.round(r.w * r.h * d.density * 0.15)) }, () => ({
      x: rng.int(r.x, r.x + r.w - 1),
      y: rng.int(r.y, r.y + r.h - 1),
    }));
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (g.get(x, y) !== T.FLOOR) continue;
        const near = Math.min(...seeds.map((s) => Math.hypot(s.x - x, s.y - y)));
        if (near < 2.2 && rng.chance(0.85 - near * 0.25)) decals.push({ x, y, kind: d.kind });
      }
  }
  if (room.condition === "collapsed") {
    const want = Math.max(2, Math.round(r.w * r.h * 0.12));
    for (let k = 0, n = 0; k < 40 && n < want; k++) {
      const name = rng.chance(0.6) ? "boulder" : "broken_planks";
      const prop: MapProp = {
        x: rng.int(r.x, r.x + r.w - 1),
        y: rng.int(r.y + FACE_ROWS, r.y + r.h - 1),
        w: 1,
        h: 1,
        name,
        blocking: PROPS[name].blocking,
        room: room.id,
      };
      if (tryPlace(g, r, ri, prop, false, entrances, props)) n++;
    }
  }
}

function isFree(g: Grid, ri: number, taken: Set<number>, p: Point) {
  return g.ownerAt(p.x, p.y) === ri && g.get(p.x, p.y) === T.FLOOR && !g.blocked[p.y * GRID + p.x] && !taken.has(key(p));
}

function randomFreeCell(g: Grid, rng: Rng, r: Rect, ri: number, taken: Set<number>, avoid: Point[]): Point | null {
  const cells: Point[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = { x, y };
      if (isFree(g, ri, taken, p) && !avoid.some((a) => a.x === x && a.y === y)) cells.push(p);
    }
  return cells.length ? rng.pick(cells) : null;
}

function freeCellNear(g: Grid, r: Rect, ri: number, taken: Set<number>, target: Point): Point {
  let best = target;
  let bestD = Infinity;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = { x, y };
      const d = dist(p, target);
      if (isFree(g, ri, taken, p) && d < bestD) {
        best = p;
        bestD = d;
      }
    }
  return best;
}

function crop(
  g: Grid,
  m: Omit<HauntMap, "width" | "height" | "tiles" | "roomIndex">,
): HauntMap {
  let x0 = GRID,
    y0 = GRID,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++)
      if (g.get(x, y) !== T.VOID) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  x0 -= 1;
  y0 -= 1;
  const width = x1 - x0 + 2;
  const height = y1 - y0 + 2;
  const tiles: number[] = [];
  const roomIndex: number[] = [];
  for (let y = y0; y < y0 + height; y++)
    for (let x = x0; x < x0 + width; x++) {
      tiles.push(g.in(x, y) ? g.get(x, y) : T.VOID);
      const o = g.ownerAt(x, y);
      roomIndex.push(o >= 0 && g.get(x, y) === T.FLOOR ? o : -1);
    }
  const sh = <P extends Point>(p: P): P => ({ ...p, x: p.x - x0, y: p.y - y0 });
  return {
    width,
    height,
    tiles,
    roomIndex,
    rooms: m.rooms.map(sh),
    doors: m.doors.map(sh),
    props: m.props.map(sh),
    decals: m.decals.map(sh),
    items: m.items.map(sh),
    actors: m.actors.map(sh),
    exits: m.exits.map(sh),
    spawn: sh(m.spawn),
    notes: m.notes,
  };
}

const key = (p: Point) => p.y * GRID + p.x;
const unkey = (k: number): Point => ({ x: k % GRID, y: Math.floor(k / GRID) });
const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const range = (a: number, b: number) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));

class Heap<V> {
  private items: { v: V; p: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(v: V, p: number) {
    const a = this.items;
    a.push({ v, p });
    for (let i = a.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): V | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
