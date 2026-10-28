import { z } from "zod";
import tiles from "@/game/assets/tiles.json";
import { Appearance } from "@/game/look";
import { PROP_NAMES } from "./furniture";

// The blueprint is the only thing the model produces for a level. Anything that has to be
// drawn is a closed enum over the real art (furniture, floors, walls, character layers), so
// the model can only ask for things that exist; the free text is what it writes.

const id = z.string().min(1).max(40).describe("short snake_case id, unique within its list");

export const RoomSize = z.enum(["small", "medium", "large", "hall"]);
export const Condition = z.enum([
  "intact",
  "dusty",
  "flooded",
  "burned",
  "overgrown",
  "collapsed",
  "bloodstained",
  "frozen",
]);

export const FloorStyle = z.enum(Object.keys(tiles.floors) as [string, ...string[]]);
export const WallStyle = z.enum(Object.keys(tiles.walls) as [string, ...string[]]);

export const Room = z.object({
  id,
  name: z.string().max(60),
  size: RoomSize,
  condition: Condition,
  floor: FloorStyle,
  walls: WallStyle,
  dark: z.boolean().describe("true if the room has no working light"),
  furniture: z.array(z.enum(PROP_NAMES)).max(8).describe("what's in the room; mounted pieces hang on the north wall"),
  mood: z.string().max(160).describe("one eerie sensory detail shown when the player enters"),
});

export const ConnectionKind = z.enum(["door", "open", "locked", "vent", "hidden"]);

export const Connection = z.object({
  from: id,
  to: id,
  kind: ConnectionKind,
  key: z.string().max(40).optional().describe("item id that unlocks it; only for kind 'locked'"),
});

export const Item = z.object({
  id,
  name: z.string().max(60),
  description: z.string().max(200).describe("text shown when picked up; can hold a clue"),
  room: id,
});

export const CastKind = z.enum(["ghost", "human", "creature", "shadow"]);
export const Behavior = z.enum(["wander", "patrol", "stalk", "chase", "stationary", "hide"]);

export const Character = z.object({
  id,
  name: z.string().max(60),
  kind: CastKind,
  role: z.string().max(80).describe("who they were, e.g. 'school janitor, died 1958'"),
  appearance: Appearance,
  behavior: Behavior,
  hostile: z.boolean().describe("touching a hostile character kills the player"),
  room: id,
  persona: z.string().max(300).describe("how they talk and what they want; drives dialogue"),
});

export const ObjectiveKind = z.enum(["find", "bring", "talk", "escape", "survive"]);

export const Objective = z.object({
  id,
  kind: ObjectiveKind,
  target: z.string().max(40).describe("item id for find/bring, character id for talk/bring, room id for escape"),
  seconds: z.number().int().min(10).max(600).optional().describe("only for survive"),
  text: z.string().max(120).describe("what the HUD shows"),
});

export const Trigger = z.object({
  on: z.enum(["pickup", "enter", "talk", "objective"]),
  ref: z.string().max(40).describe("id of the item, room, character or objective"),
});

export const Effect = z.object({
  do: z.enum(["lights_out", "flicker", "door_slam", "spawn", "whisper", "chase", "calm"]),
  ref: z.string().max(40).optional().describe("character id for spawn/chase/calm"),
  text: z.string().max(160).optional().describe("message shown to the player"),
});

export const HauntEvent = z.object({ trigger: Trigger, effects: z.array(Effect).min(1).max(4) });

export const HauntBlueprint = z.object({
  title: z.string().max(60),
  premise: z.string().max(400).describe("the haunted version of the player's prompt, second person"),
  setting: z.string().max(60).describe("kind of place, e.g. 'abandoned elementary school'"),
  rooms: z.array(Room).min(3).max(12),
  connections: z.array(Connection).min(2).max(18),
  start: id.describe("room id the player starts in"),
  items: z.array(Item).max(10),
  cast: z.array(Character).min(1).max(6),
  objectives: z.array(Objective).min(3).max(5).describe("3 to 5 steps; the last is always an escape"),
  events: z.array(HauntEvent).max(10),
  intro: z.string().max(400),
  win: z.string().max(300),
});

export type HauntBlueprint = z.infer<typeof HauntBlueprint>;
export type Room = z.infer<typeof Room>;
export type Connection = z.infer<typeof Connection>;
export type Item = z.infer<typeof Item>;
export type Character = z.infer<typeof Character>;
export type Objective = z.infer<typeof Objective>;
export type HauntEvent = z.infer<typeof HauntEvent>;
export type Effect = z.infer<typeof Effect>;
export type Condition = z.infer<typeof Condition>;

export const hauntBlueprintJsonSchema = z.toJSONSchema(HauntBlueprint);
