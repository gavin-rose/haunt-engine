import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { HauntBlueprint } from "@/haunt/schema";

export type HauntRow = {
  id: string;
  blueprint: HauntBlueprint;
  seed: string;
  prompt?: string;
  createdAt: string;
  entered: number;
  died: number;
  escaped: number;
};

export type GraveRow = {
  id: string;
  hauntId: string;
  outcome: "died" | "escaped";
  killer?: string;
  room?: string;
  seconds: number;
  difficulty: string;
  epitaph?: string;
  x: number;
  y: number;
  createdAt: string;
};

export type HauntSummary = Omit<HauntRow, "blueprint"> & { title: string; premise: string };

type Db = {
  haunts: Record<string, HauntRow>;
  graves: GraveRow[];
  /** normalised prompt → haunt id, so the same prompt is only ever paid for once */
  prompts?: Record<string, string>;
};

const FILE = path.join(process.cwd(), ".data", "store.json");
let cache: Db | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8")) as Db;
  } catch {
    cache = { haunts: {}, graves: [] };
  }
  return cache;
}

/** serialise writes so concurrent requests can't interleave */
function write<T>(fn: (db: Db) => T): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const out = fn(db);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(`${FILE}.tmp`, JSON.stringify(db));
    await fs.rename(`${FILE}.tmp`, FILE);
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

/** Same blueprint + seed always gets the same id, so saving it again doesn't duplicate it. */
export function saveHaunt(blueprint: HauntBlueprint, seed: string, prompt?: string): Promise<string> {
  const id = createHash("sha256").update(JSON.stringify([blueprint, seed])).digest("base64url").slice(0, 9);
  return write((db) => {
    db.haunts[id] ??= { id, blueprint, seed, prompt, createdAt: new Date().toISOString(), entered: 0, died: 0, escaped: 0 };
    if (prompt) (db.prompts ??= {})[normalizePrompt(prompt)] = id;
    return id;
  });
}

export function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export async function hauntForPrompt(prompt: string): Promise<HauntRow | null> {
  const db = await load();
  const id = db.prompts?.[normalizePrompt(prompt)];
  return id ? (db.haunts[id] ?? null) : null;
}

export async function getHaunt(id: string): Promise<HauntRow | null> {
  return (await load()).haunts[id] ?? null;
}

export function recordEntry(id: string): Promise<void> {
  return write((db) => {
    const h = db.haunts[id];
    if (h) h.entered++;
  });
}

export function recordRun(run: Omit<GraveRow, "id" | "createdAt">): Promise<GraveRow | null> {
  return write((db) => {
    const h = db.haunts[run.hauntId];
    if (!h) return null;
    if (run.outcome === "died") h.died++;
    else h.escaped++;
    // runs started from a fresh summon or the demo never sent an "enter"
    h.entered = Math.max(h.entered, h.died + h.escaped);
    const grave: GraveRow = { ...run, id: randomUUID(), createdAt: new Date().toISOString() };
    db.graves.push(grave);
    return grave;
  });
}

export async function gravesFor(hauntId: string, limit = 20): Promise<GraveRow[]> {
  const db = await load();
  return db.graves.filter((g) => g.hauntId === hauntId && g.outcome === "died").slice(-limit).reverse();
}

export async function listHaunts(): Promise<HauntSummary[]> {
  const db = await load();
  return Object.values(db.haunts)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summarize);
}

export function summarize(h: HauntRow): HauntSummary {
  const { blueprint, ...rest } = h;
  return { ...rest, title: blueprint.title, premise: blueprint.premise };
}
