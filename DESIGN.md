# Haunt Engine: design

Hacktoberfest 2026 DEV challenge, week 4 ("Ghost in the Machine").

You write a premise in plain language. An open-weight model turns it into a **blueprint**, a
seeded procedural generator builds a playable level from it, and every death is buried in that
haunt's cemetery, where your next visit walks past it.

## Principle: the model designs, code builds

The model never touches tiles, pixels or game state. It writes structured content (validated
with zod, constrained with a JSON schema), and deterministic code turns that into a level and
owns all the rules.

```
prompt
  → LLM: HauntBlueprint      (src/haunt/schema.ts)
  → validate + repair        (src/haunt/repair.ts)
  → generate(blueprint, seed) → HauntMap   (src/haunt/generate.ts)
  → Phaser runtime           (src/game/)
       ├─ LLM: character dialogue (persona from the cast entry)
       ├─ events from a fixed vocabulary
       └─ on death → LLM: epitaph → headstone in this haunt
```

`blueprint + seed` is deterministic, so a stored haunt is the same building every visit, and
headstones stand where you fell.

## Blueprint

- **rooms**: name, size (`small|medium|large|hall`), condition, floor and wall style,
  furniture, mood text
- **connections**: `door|open|locked|vent|hidden`; locked doors name a key item
- **items**: name and description, placed in a room
- **cast**: name, role, lore, kind (`ghost|human|creature|shadow`), behavior, appearance,
  persona for dialogue
- **objectives**: 3 to 5 of `find|bring|talk|escape|survive`
- **events**: a trigger (`pickup|enter|talk|objective`) and an effect from a fixed list

Everything that has to be drawn (floors, walls, furniture, every piece of a character's
appearance) is a closed enum over the real art, so the model can only ask for things that exist.

## Repair

Small models get references wrong. `repair` fixes the blueprint deterministically instead of
asking again: it drops dangling connections, connects orphan rooms, creates missing keys and
moves any key locked behind its own door. A short haunt is topped up to at least three
objectives, ending in an escape from the room farthest from the start, with at least one hostile.

## Generator

Rooms are laid out by walking the connection graph from the start room, attaching each new
room to its parent through a short corridor. Extra (cyclic) connections are carved with A*
through empty space, or dropped if the corridor would be too long. Rooms are drawn in 3/4 view:
the top two rows are the north wall's face. Furniture follows per-prop placement rules
(`wall|mount|rows|center|corner|scatter`), and a blocking prop is rejected if it would cut off
part of a room.

## Art

LPC (Liberated Pixel Cup) for characters and interiors, one consistent 32px style. Characters
are recipes of LPC layers composited and recoloured in the browser, so the model can introduce
anyone. Lighting is per-tile line of sight, blurred into soft darkness, under a cold moonlight
grade with the player's lantern added back in.

## Gameplay

Exploration horror, real-time, top-down. No combat: objectives, characters to talk to, and
entities that wander, patrol, stalk or chase. Being caught costs a candle; losing the last one
kills you.

## Difficulty

Mourner, Visitor and Restless set candles, enemy speed and light radius. Mourner also lays a
trail of marigold petals to the current objective (the petals that guide spirits home on Día de
los Muertos). The choice is stored per browser.

## Local only

Everything runs on one machine: Ollama for the model, a JSON file in `.data/` for haunts and
graves. A summon is saved the moment it's generated, and the same prompt returns the stored
haunt instead of generating again. Each death keeps its epitaph and the spot it happened.
`/s/<id>` is a stored haunt with your record in it, and the home page lists your haunts. The end
screen renders a grave card (1200x630 PNG) to save.

## Sound

All Web Audio synthesis (`src/game/audio.ts`): a drone and wind through a generated reverb,
footsteps by floor surface, a heartbeat that quickens near a hostile, door creaks, bells,
whispers and stings. M mutes.

## Credits

`/credits` is generated from the packs' own credits files (shipped verbatim) and the LPC
generator's per-layer metadata. `scripts/build_assets.py` and `scripts/build_characters.py`
rebuild the art from the original packs.
