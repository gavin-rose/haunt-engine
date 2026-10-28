// npx tsx scripts/haunt.mts "an abandoned classroom" [--seed abc] [--from blueprint.json] [--out file.json]
import { readFileSync, writeFileSync } from "node:fs";
import { designHaunt } from "@/haunt/architect";
import { repairBlueprint } from "@/haunt/repair";
import { generateMap, T, type HauntMap } from "@/haunt/generate";
import { HauntBlueprint } from "@/haunt/schema";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const seed = flag("seed") ?? Math.random().toString(36).slice(2, 8);
const from = flag("from");
const out = flag("out");
const prompt = args.join(" ");

const started = Date.now();
const raw = from ? HauntBlueprint.parse(JSON.parse(readFileSync(from, "utf8"))) : await designHaunt(prompt, (t) => process.stderr.write(`\r${t.length} chars`));
if (!from) console.error(`designed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (out) writeFileSync(out, JSON.stringify(raw, null, 2));

const { blueprint, notes } = repairBlueprint(raw, seed);
const map = generateMap(blueprint, seed);

console.log(`\n${blueprint.title} (seed ${seed})\n${blueprint.premise}\n`);
console.log(render(map));
console.log("\nrooms:", map.rooms.map((r) => `${r.id}(${r.w}x${r.h},${r.condition})`).join(" "));
console.log("objectives:", blueprint.objectives.map((o) => `${o.kind}:${o.target}`).join(" → "));
console.log("cast:", blueprint.cast.map((c) => `${c.name} [${c.kind}${c.hostile ? ", hostile" : ""}, ${c.behavior}]`).join("; "));
for (const n of [...notes, ...map.notes]) console.log("  note:", n);

function render(m: HauntMap): string {
  const ch: string[] = m.tiles.map((t) => ({ [T.VOID]: " ", [T.FLOOR]: ".", [T.WALL]: "#", [T.DOOR]: "+", [T.EXIT]: "E", [T.VENT]: ":", [T.FACE]: "=" })[t] ?? "?");
  const put = (x: number, y: number, c: string) => (ch[y * m.width + x] = c);
  for (const d of m.decals) if (ch[d.y * m.width + d.x] === ".") put(d.x, d.y, "~");
  for (const p of m.props)
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) put(x, y, p.blocking ? p.name[0].toUpperCase() : p.name[0]);
  for (const d of m.doors) put(d.x, d.y, { door: "+", locked: "L", vent: "=", hidden: "h", open: "." }[d.kind]);
  for (const i of m.items) put(i.x, i.y, "*");
  for (const a of m.actors) put(a.x, a.y, "@");
  put(m.spawn.x, m.spawn.y, "S");
  const lines: string[] = [];
  for (let y = 0; y < m.height; y++) lines.push(ch.slice(y * m.width, (y + 1) * m.width).join(""));
  return lines.join("\n");
}
