import props from "@/game/assets/props.json";

export type Placement = "wall" | "mount" | "rows" | "center" | "corner" | "scatter";

export type PropMeta = {
  frame: [number, number, number, number];
  fw: number;
  fh: number;
  blocking: boolean;
  mount: "floor" | "wall";
  source: string;
};
export const PROPS = props as unknown as Record<string, PropMeta>;
export type PropName = keyof typeof props;
export const PROP_NAMES = Object.keys(props) as [PropName, ...PropName[]];

export type FurnitureRule = { placement: Placement; count: [number, number] };

const P: Record<string, FurnitureRule> = {};
const set = (placement: Placement, count: [number, number], names: string[]) => {
  for (const n of names) P[n] = { placement, count };
};
set("wall", [1, 2], [
  "upright_piano", "pipe_organ", "grandfather_clock", "fireplace", "wardrobe", "dresser", "cabinet",
  "counter", "stove", "sink", "vanity", "writing_desk", "sofa", "alchemy_table", "jars", "folding_screen",
]);
set("wall", [1, 3], ["bookshelf", "bed", "canopy_bed", "bunk_bed"]);
set("mount", [1, 2], ["chalkboard", "painting", "portrait", "mirror", "window"]);
set("rows", [4, 12], ["school_desk", "pew", "chair", "headstone", "headstone_rip", "headstone_cross", "wooden_cross", "celtic_cross"]);
set("rows", [2, 6], ["grave_plot", "coffin"]);
set("center", [1, 1], ["grand_piano", "dining_table", "round_table", "long_table", "ritual_circle", "large_headstone", "chess_table", "monolith"]);
set("corner", [1, 2], ["barrels", "crate", "statue", "armor", "small_table", "stool", "gothic_chair", "armchair", "nightstand", "crystals"]);
set("scatter", [2, 4], ["skull", "papers", "skeleton", "lantern", "bench", "mantel_clock"]);

export function furnitureRule(name: string): FurnitureRule {
  return P[name] ?? { placement: "scatter", count: [1, 1] };
}
