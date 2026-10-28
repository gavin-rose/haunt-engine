import type { HauntBlueprint } from "@/haunt/schema";

/** Make sure a haunt is in the local store (the demo isn't until first played) and return its id. */
export async function ensureSaved(blueprint: HauntBlueprint, seed: string, knownId?: string): Promise<string | null> {
  if (knownId) return knownId;
  try {
    const res = await fetch("/api/haunts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprint, seed }),
    });
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}
