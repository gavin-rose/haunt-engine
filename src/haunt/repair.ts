import type { Connection, HauntBlueprint, Item } from "./schema";
import { makeRng, type Rng } from "./rng";

// Small models get references wrong: a door to a room that doesn't exist, a key that was
// never placed, a key locked behind its own door. Rather than re-asking the model, fix the
// blueprint deterministically and record what changed.

export type Repaired = { blueprint: HauntBlueprint; notes: string[] };

export function repairBlueprint(input: HauntBlueprint, seed: string): Repaired {
  const bp: HauntBlueprint = structuredClone(input);
  const notes: string[] = [];
  const rng = makeRng(`${seed}:repair`);

  bp.rooms = uniqueBy(bp.rooms, (r) => r.id, (r) => notes.push(`duplicate room ${r.id} dropped`));
  bp.items = uniqueBy(bp.items, (i) => i.id, (i) => notes.push(`duplicate item ${i.id} dropped`));
  bp.cast = uniqueBy(bp.cast, (c) => c.id, (c) => notes.push(`duplicate character ${c.id} dropped`));

  const roomIds = new Set(bp.rooms.map((r) => r.id));
  if (!roomIds.has(bp.start)) {
    notes.push(`start room ${bp.start} missing, using ${bp.rooms[0].id}`);
    bp.start = bp.rooms[0].id;
  }

  const seenPairs = new Set<string>();
  bp.connections = bp.connections.filter((c) => {
    const pair = [c.from, c.to].sort().join("|");
    const ok = roomIds.has(c.from) && roomIds.has(c.to) && c.from !== c.to && !seenPairs.has(pair);
    if (!ok) notes.push(`connection ${c.from}->${c.to} dropped`);
    seenPairs.add(pair);
    return ok;
  });

  for (;;) {
    const linked = component(bp.start, bp.connections, () => true);
    const orphan = bp.rooms.find((r) => !linked.has(r.id));
    if (!orphan) break;
    const anchor = rng.pick([...linked]);
    bp.connections.push({ from: anchor, to: orphan.id, kind: "door" });
    notes.push(`room ${orphan.id} was unreachable, added door from ${anchor}`);
  }

  const nonStartRooms = bp.rooms.filter((r) => r.id !== bp.start).map((r) => r.id);
  const someRoom = () => rng.pick(nonStartRooms.length ? nonStartRooms : [bp.start]);

  for (const item of bp.items) {
    if (!roomIds.has(item.room)) {
      item.room = someRoom();
      notes.push(`item ${item.id} moved to ${item.room}`);
    }
  }
  for (const c of bp.cast) {
    if (!roomIds.has(c.room)) {
      c.room = someRoom();
      notes.push(`character ${c.id} moved to ${c.room}`);
    }
  }

  for (const c of bp.connections) {
    if (c.kind !== "locked") {
      delete c.key;
      continue;
    }
    if (!c.key || !bp.items.some((i) => i.id === c.key)) {
      const key: Item = {
        id: c.key || `key_${c.from}_${c.to}`,
        name: "Rusted Key",
        description: "A small iron key. The tag is too stained to read.",
        room: bp.start,
      };
      bp.items.push(key);
      c.key = key.id;
      notes.push(`created missing key ${key.id}`);
    }
  }

  fixKeyReachability(bp, rng, notes);

  const itemIds = new Set(bp.items.map((i) => i.id));
  const castIds = new Set(bp.cast.map((c) => c.id));
  const objectiveIds = new Set(bp.objectives.map((o) => o.id));

  bp.objectives = bp.objectives.filter((o) => {
    const ok =
      o.kind === "survive" ||
      (o.kind === "find" && itemIds.has(o.target)) ||
      (o.kind === "bring" && itemIds.has(o.target)) ||
      (o.kind === "talk" && castIds.has(o.target)) ||
      (o.kind === "escape" && roomIds.has(o.target));
    if (!ok) notes.push(`objective ${o.id} references unknown ${o.target}, dropped`);
    if (o.kind === "survive" && !o.seconds) o.seconds = 90;
    return ok;
  });
  strengthen(bp, rng, notes);

  bp.events = bp.events
    .filter((e) => {
      const ref = e.trigger.ref;
      const ok =
        (e.trigger.on === "pickup" && itemIds.has(ref)) ||
        (e.trigger.on === "enter" && roomIds.has(ref)) ||
        (e.trigger.on === "talk" && castIds.has(ref)) ||
        (e.trigger.on === "objective" && objectiveIds.has(ref));
      if (!ok) notes.push(`event on ${e.trigger.on}:${ref} dropped`);
      return ok;
    })
    .map((e) => ({
      ...e,
      effects: e.effects.filter((f) => !["spawn", "chase", "calm"].includes(f.do) || castIds.has(f.ref ?? "")),
    }))
    .filter((e) => e.effects.length > 0);

  return { blueprint: bp, notes };
}

// A haunt has to be a journey: at least three steps, ending in an escape from somewhere far
// from the start, with something hunting you. Small models often stop at two objectives and
// no exit, which plays in a minute; top it up from what the blueprint already contains.
function strengthen(bp: HauntBlueprint, rng: Rng, notes: string[]) {
  const roomName = (id: string) => (bp.rooms.find((r) => r.id === id)?.name ?? id).replace(/^the\s+/i, "");
  const used = new Set(bp.objectives.map((o) => o.target));

  let escape = bp.objectives.find((o) => o.kind === "escape");
  if (!escape) {
    const dist = roomDistances(bp);
    const far = [...dist.entries()].filter(([id]) => id !== bp.start).sort((a, b) => b[1] - a[1])[0]?.[0] ?? bp.start;
    escape = { id: "escape", kind: "escape", target: far, text: `Find the way out through the ${roomName(far)}` };
    notes.push(`no escape, added one from ${far}`);
  }
  bp.objectives = bp.objectives.filter((o) => o !== escape && o.kind !== "escape");

  // items nobody asks for yet, keys last (they're already needed to get through doors)
  const keys = new Set(bp.connections.map((c) => c.key).filter(Boolean));
  const spareItems = rng.shuffle(bp.items.filter((i) => !used.has(i.id))).sort((a, b) => Number(keys.has(a.id)) - Number(keys.has(b.id)));
  const spareFriends = rng.shuffle(bp.cast.filter((c) => !c.hostile && !used.has(c.id)));
  while (bp.objectives.length < 3 && (spareItems.length || spareFriends.length)) {
    const item = spareItems.shift();
    if (item) {
      bp.objectives.push({ id: `find_${item.id}`, kind: "find", target: item.id, text: `Find the ${item.name.replace(/^the\s+/i, "")}` });
      notes.push(`added objective: find ${item.id}`);
      continue;
    }
    const friend = spareFriends.shift()!;
    bp.objectives.push({ id: `talk_${friend.id}`, kind: "talk", target: friend.id, text: `Speak to ${friend.name}` });
    notes.push(`added objective: talk to ${friend.id}`);
  }
  bp.objectives.push(escape);

  if (!bp.cast.some((c) => c.hostile)) {
    const hunter = bp.cast.find((c) => c.kind === "shadow" || c.kind === "creature") ?? bp.cast[bp.cast.length - 1];
    hunter.hostile = true;
    if (hunter.behavior === "stationary" || hunter.behavior === "wander") hunter.behavior = "stalk";
    notes.push(`nothing was hunting the player; ${hunter.id} now is`);
  }
}

function roomDistances(bp: HauntBlueprint): Map<string, number> {
  const dist = new Map([[bp.start, 0]]);
  const queue = [bp.start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const c of bp.connections) {
      const other = c.from === cur ? c.to : c.to === cur ? c.from : null;
      if (other && !dist.has(other)) {
        dist.set(other, dist.get(cur)! + 1);
        queue.push(other);
      }
    }
  }
  return dist;
}

// Fixpoint: walk from start through unlocked doors and doors whose key we already hold.
// If rooms remain unreachable, move one frontier door's key somewhere reachable and retry.
function fixKeyReachability(bp: HauntBlueprint, rng: Rng, notes: string[]) {
  for (let guard = 0; guard < 50; guard++) {
    const reach = reachableRooms(bp);
    if (reach.size === bp.rooms.length) return;
    const frontier = bp.connections.find(
      (c) => c.kind === "locked" && reach.has(c.from) !== reach.has(c.to),
    );
    if (!frontier) return;
    const key = bp.items.find((i) => i.id === frontier.key)!;
    key.room = rng.pick([...reach]);
    notes.push(`key ${key.id} was out of reach, moved to ${key.room}`);
  }
}

export function reachableRooms(bp: HauntBlueprint): Set<string> {
  let held = new Set<string>();
  for (;;) {
    const reach = component(bp.start, bp.connections, (c) => c.kind !== "locked" || held.has(c.key ?? ""));
    const nextHeld = new Set(bp.items.filter((i) => reach.has(i.room)).map((i) => i.id));
    if (nextHeld.size === held.size) return reach;
    held = nextHeld;
  }
}

function component(start: string, edges: Connection[], passable: (c: Connection) => boolean): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (!passable(e)) continue;
      const other = e.from === cur ? e.to : e.to === cur ? e.from : null;
      if (other && !seen.has(other)) {
        seen.add(other);
        queue.push(other);
      }
    }
  }
  return seen;
}

function uniqueBy<T>(list: T[], key: (t: T) => string, onDupe: (t: T) => void): T[] {
  const seen = new Set<string>();
  return list.filter((t) => {
    const k = key(t);
    if (seen.has(k)) {
      onDupe(t);
      return false;
    }
    seen.add(k);
    return true;
  });
}
