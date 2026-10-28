import { z } from "zod";
import lpc from "./assets/lpc.json";

type LpcItem = {
  name: string;
  layers: { z: number; paths: Partial<Record<BaseBody, string>> }[];
  recolor: { material: Material; base: string }[];
  variants: string[] | null;
  matchBody: boolean;
};
export type Material = "body" | "cloth" | "hair" | "eye";
export type BaseBody = "male" | "female" | "child" | "teen";
export const CATALOG = lpc as unknown as {
  anims: Record<"walk" | "hurt", { cols: number; rows: number }>;
  items: Record<string, LpcItem>;
  palettes: Record<Material, { base: string; colors: Record<string, string[]> }>;
  credits: Record<string, { authors?: string[]; licenses?: string[]; urls?: string[] }>;
};

const names = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];

export const BODIES = { male: "male", female: "female", child: "child", teen: "teen", skeleton: "male", zombie: "male" } as const;
export const HEADS = {
  human: "",
  elderly: "",
  gaunt: "heads_human_male_gaunt",
  plump: "heads_human_male_plump",
  skeleton: "heads_skeleton",
  zombie: "heads_zombie",
  vampire: "heads_vampire",
  pumpkin: "heads_jack",
} as const;
export const HAIR = {
  none: "",
  short: "hair_plain",
  bob: "hair_bob",
  long: "hair_long_tied",
  ponytail: "hair_ponytail",
  bun: "hair_bangs_bun",
  braid: "hair_braid",
  pixie: "hair_pixie",
  messy: "hair_messy1",
  parted: "hair_parted",
  curly_long: "hair_curly_long",
  curly_short: "hair_curly_short",
  afro: "hair_afro",
  balding: "hair_balding",
  buzzcut: "hair_buzzcut",
  very_long: "hair_relm_xlong",
  unkempt: "hair_unkempt",
  half_up: "hair_half_up",
  shoulder: "hair_shoulderl",
} as const;
export const BEARD = { none: "", beard: "beards_beard", stubble: "beards_5oclock_shadow", long_beard: "beards_winter" } as const;
export const TOP = {
  none: "",
  longsleeve: "torso_clothes_longsleeve",
  shortsleeve: "torso_clothes_shortsleeve",
  cardigan: "torso_clothes_longsleeve2_cardigan",
  buttoned_shirt: "torso_clothes_longsleeve2_buttoned",
  blouse: "torso_clothes_blouse_longsleeve",
  tunic: "torso_clothes_tunic",
  robe: "torso_clothes_robe",
  corset: "torso_clothes_corset",
  dress: "dress_bodice",
  sash_dress: "dress_sash",
} as const;
export const OUTER = {
  none: "",
  frock_coat: "torso_jacket_frock",
  trench_coat: "torso_jacket_trench",
  jacket: "torso_jacket_collared",
  vest: "torso_clothes_vest",
  apron: "torso_aprons_apron",
  full_apron: "torso_aprons_apron_full",
  overalls: "torso_aprons_overalls",
  cape: "cape_solid",
  tattered_cape: "cape_tattered",
} as const;
export const BOTTOM = {
  none: "",
  pants: "legs_pants",
  formal_pants: "legs_formal",
  skirt: "legs_skirts_plain",
  long_skirt: "legs_skirt_belle",
  straight_skirt: "legs_skirt_straight",
  shorts: "legs_shorts",
} as const;
export const SHOES = { none: "", shoes: "feet_shoes_basic", boots: "feet_boots_basic", slippers: "feet_slippers" } as const;
export const HAT = {
  none: "",
  bowler: "hat_formal_bowler",
  top_hat: "hat_formal_tophat",
  cap: "hat_cap_leather",
  hood: "hat_hood_cloth",
  sack_hood: "hat_hood_sack_cloth",
  kerchief: "hat_headband_kerchief",
  bandana: "hat_bandana",
  wizard_hat: "hat_magic_wizard",
  bonnet: "hat_cap_bonnie",
} as const;
export const FACE = {
  none: "",
  glasses: "facial_glasses",
  round_glasses: "facial_glasses_round",
  half_moon_glasses: "facial_glasses_halfmoon",
  monocle: "facial_monocle_right",
  eyepatch: "facial_eyepatch_left",
  mask: "facial_mask_plain",
} as const;
export const NECK = {
  none: "",
  necktie: "neck_necktie",
  bowtie: "neck_bowtie",
  scarf: "neck_scarf",
  cross: "neck_amulet_cross",
  necklace: "neck_necklace_simple",
} as const;
export const HELD = {
  none: "",
  shovel: "tool_shovel",
  axe: "tool_axe",
  hoe: "tool_hoe",
  hammer: "tool_hammer",
  pickaxe: "tool_pickaxe",
  watering_can: "tool_watering_can",
} as const;
export const WOUND = { none: "", ribs: "wound_ribs", eye: "wound_eye_left", mouth: "wound_mouth", brain: "wound_brain", arm: "wound_arm" } as const;

const SKINS = ["light", "amber", "olive", "taupe", "bronze", "brown", "black", "zombie", "zombie_green", "lavender", "blue", "pale_green"] as const;
const HAIR_COLORS = names(CATALOG.palettes.hair.colors);
const CLOTH = names(CATALOG.palettes.cloth.colors);

export const Appearance = z.object({
  body: z.enum(names(BODIES)),
  skin: z.enum(SKINS).describe("ghosts look best pale: light, lavender, blue, pale_green"),
  head: z.enum(names(HEADS)),
  hair: z.enum(names(HAIR)),
  hair_color: z.enum(HAIR_COLORS),
  beard: z.enum(names(BEARD)),
  top: z.enum(names(TOP)),
  top_color: z.enum(CLOTH),
  outer: z.enum(names(OUTER)),
  outer_color: z.enum(CLOTH),
  bottom: z.enum(names(BOTTOM)),
  bottom_color: z.enum(CLOTH),
  shoes: z.enum(names(SHOES)),
  hat: z.enum(names(HAT)),
  hat_color: z.enum(CLOTH),
  face: z.enum(names(FACE)),
  neck: z.enum(names(NECK)),
  held: z.enum(names(HELD)),
  wound: z.enum(names(WOUND)),
});
export type Appearance = z.infer<typeof Appearance>;

export type Layer = { file: string; z: number; maps: { material: Material; from: string; to: string }[] };

/**
 * Appearance → ordered list of sheet files (relative to /assets/lpc/, without the
 * animation part) plus palette swaps. Items missing for a body type fall back to the
 * first item in the same slot that has it, or are dropped.
 */
export function resolveLayers(a: Appearance, anim: "walk" | "hurt"): Layer[] {
  const base: BaseBody = BODIES[a.body];
  const layers: Layer[] = [];

  const add = (stem: string, color: string | null, slot?: Record<string, string>) => {
    let item = stem ? CATALOG.items[stem] : undefined;
    if (item && !item.layers.some((l) => l.paths[base]) && slot) {
      const alt = Object.values(slot).find((s) => s && CATALOG.items[s]?.layers.some((l) => l.paths[base]));
      item = alt ? CATALOG.items[alt] : undefined;
    }
    if (!item) return;
    for (const l of item.layers) {
      const path = l.paths[base];
      if (!path) continue;
      let file = `${path}${anim}.png`;
      if (item.variants) {
        const v = color && item.variants.includes(color) ? color : nearestVariant(color, item.variants);
        file = `${path}${anim}/${v}.png`;
      }
      const maps = item.recolor.flatMap(({ material, base: from }) => {
        const to = material === "body" ? a.skin : material === "eye" ? "gray" : material === "hair" ? a.hair_color : color;
        return to && to !== from ? [{ material, from, to }] : [];
      });
      layers.push({ file, z: l.z, maps });
    }
  };

  add(a.body === "skeleton" ? "body_skeleton" : a.body === "zombie" ? "body_zombie" : "body", null);
  add(headStem(a), null);
  if (a.head !== "skeleton" && a.head !== "pumpkin") {
    add(HAIR[a.hair], a.hair_color, HAIR);
    add(BEARD[a.beard], a.hair_color);
  }
  add(TOP[a.top], a.top_color, base === "child" ? { child: "torso_clothes_child_shirt" } : TOP);
  add(OUTER[a.outer], a.outer_color);
  add(BOTTOM[a.bottom], a.bottom_color, base === "child" ? { child: "legs_childpants" } : BOTTOM);
  add(SHOES[a.shoes], "black");
  add(HAT[a.hat], a.hat_color);
  add(FACE[a.face], "black");
  add(NECK[a.neck], a.top_color);
  add(HELD[a.held], null);
  add(WOUND[a.wound], null);
  return layers.sort((p, q) => p.z - q.z);
}

function headStem(a: Appearance): string {
  const base = BODIES[a.body];
  if (a.body === "skeleton" && a.head === "human") return "heads_skeleton";
  if (a.body === "zombie" && a.head === "human") return "heads_zombie";
  if (base === "child") return a.head === "human" || a.head === "elderly" ? "heads_human_child" : HEADS[a.head] || "heads_human_child";
  const female = base === "female";
  if (a.head === "human") return female ? "heads_human_female" : "heads_human_male";
  if (a.head === "elderly") return female ? "heads_human_female_elderly" : "heads_human_male_elderly";
  return HEADS[a.head];
}

const VARIANT_NEAR: Record<string, string[]> = {
  black: ["charcoal", "navy", "black"],
  white: ["gray", "white"],
  gray: ["charcoal", "white", "gray"],
};
function nearestVariant(color: string | null, variants: string[]): string {
  for (const c of (color && VARIANT_NEAR[color]) ?? []) if (variants.includes(c)) return c;
  return variants.includes("black") ? "black" : variants[0];
}

export function lookKey(a: Appearance) {
  return Object.values(a).join("-");
}

export const DEFAULT_PLAYER: Appearance = {
  body: "female",
  skin: "amber",
  head: "human",
  hair: "ponytail",
  hair_color: "dark_brown",
  beard: "none",
  top: "longsleeve",
  top_color: "maroon",
  outer: "none",
  outer_color: "black",
  bottom: "pants",
  bottom_color: "navy",
  shoes: "boots",
  hat: "none",
  hat_color: "black",
  face: "none",
  neck: "scarf",
  held: "none",
  wound: "none",
};
