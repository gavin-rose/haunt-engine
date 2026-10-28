import { chatJson } from "@/llm/client";
import { HauntBlueprint, hauntBlueprintJsonSchema } from "./schema";

const SYSTEM = `You are the Architect for a top-down exploration horror game. The player gives you a premise in their own words. You turn it into a haunted place they can walk through.

If the premise isn't spooky, make it spooky while keeping what they asked for recognisable: a cozy bakery becomes a bakery where the bread rises at midnight and breathes. Lean into Halloween and Día de los Muertos: the dead, memory, things left behind. Eerie and sad beats gory.

Design rules:
- 5 to 9 rooms. Give rooms real names ("Room 12B: Mrs. Okafor's Class", "East Stairwell"), not "Room 1".
- Mix sizes. Use "hall" for corridors and hallways. Pick each room's floor and walls to fit what it is (a classroom: tile or wood floor, institutional or wallpaper walls; a crypt: stone and dark_stone).
- Furniture: 2-6 pieces per room from the allowed list, chosen to make the room recognisable. Mounted pieces (chalkboard, painting, portrait, mirror, window) hang on the wall; graves, pews and desks are set out in rows.
- Connections form one building. Use mostly "door" and "open"; use "locked" (with a key item) once or twice, "vent" or "hidden" at most once.
- Every locked door's key must be an item placed in a room the player can reach before that door.
- Cast: 1 to 4 characters. At least one should be a ghost who talks and wants something. At most two hostile. Dress each character from the appearance options so they look like who they were: a 1950s janitor in overalls and a cap, a Victorian widow in a long dark dress. Ghosts should have pale skin (light, lavender, blue, pale_green). Use skeleton, zombie, vampire or pumpkin heads only for things that aren't people anymore.
- Objectives: 3 to 5 that chain into a small story that crosses the whole building: find a clue, talk to someone, bring them something, and finally escape. The last objective is ALWAYS "escape", targeting a room at least three rooms away from the start. Don't make it short: the player should have to visit most rooms.
- At least one character is hostile and hunts the player (stalk, chase or hide).
- Events make the place react: picking something up kills the lights, entering a room makes a ghost start chasing, finishing an objective calms a spirit. Only reference ids you defined.
- All ids are short snake_case and every reference (room, item, character, objective) must match an id you defined.
- Write "mood", "intro", "win" and item descriptions in second person, present tense, specific and sensory.`;

export async function designHaunt(prompt: string, onProgress?: (text: string) => void): Promise<HauntBlueprint> {
  return chatJson(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Premise: ${prompt}` },
    ],
    HauntBlueprint,
    { name: "haunt_blueprint", schema: hauntBlueprintJsonSchema },
    { temperature: 0.9, maxTokens: 6000, onProgress },
  );
}
