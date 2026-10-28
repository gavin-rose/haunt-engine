*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26)*

## What I Built

**Haunt Engine** is a game where you get to write a prompt that fuels the haunted house you play.

You type a place: "a cozy bakery", "the last video rental store on earth", "the classroom where my grandmother taught". A model running on your own laptop designs a building from it, room by room. It names the rooms and furnishes them. It casts the people who never left, gives them something to say, hides the keys and decides what hunts you. The game builds that design into a top-down level and drops you in the front door with a lantern.

You can talk to anyone you find. The model plays them in character, so a ghost might tell you where the key is, if you ask the right way. Get caught too many times and you die. The model then writes your epitaph from what actually happened: who took you, in which room, and what you were holding. Your headstone stays in that haunt, on the tile where you fell. Next time you go in, you walk past your own grave.

I took the theme literally. The ghost in the machine is the thing that designed the building you're trapped in, and it's also the voice of everyone inside it.

![Following the marigold trail through St. Agnes Elementary]

![Image description](https://dev-to-uploads.s3.us-east-2.amazonaws.com/uploads/articles/obpd2ofpdus5xdrgd62b.gif)

## Demo


![Image description](https://dev-to-uploads.s3.us-east-2.amazonaws.com/uploads/articles/2ju45lydk31zl3vierpd.gif)

Haunt Engine runs entirely on your machine, so there's no hosted link; the repo below gets you playing in three commands. The GIF above is the hand-written demo haunt, **St. Agnes Elementary, After Hours**, on the easiest difficulty, where marigold petals lead you to your next objective.

## Code

{% embed https://github.com/gavin-rose/haunt-engine %}

```bash
npm install
npm run setup:model   # pulls Gemma 4 12B and gives it a 16k context
npm run dev
```

MIT licensed. The art keeps its own CC-BY-SA license, and every artist is credited in the game.

## How I Built It

**The model** is Gemma 4 12B (the quantization-aware `gemma4:12b-it-qat` build) which I ran Ollama locally.

**The rule I built everything around: the model designs, code builds.** The model never places a tile or touches game state. It writes a *blueprint*, a JSON document of rooms, doors, items, characters, objectives and scripted events. Ollama's structured output holds it to a JSON schema generated from Zod. Then deterministic code turns that blueprint plus a random seed into a level and enforces every rule.

That split is what made a 12B model good enough. A few things made it work:

- **Closed vocabularies for anything that gets drawn.** My first blueprints asked for furniture I had no art for. Now every floor, wall, piece of furniture and item of clothing is an enum over the art I actually have. The model chooses from 61 props, and it dresses characters from LPC sprite layers: body, hair, coat, hat, wounds. The browser composites and recolors those layers, so the model can invent a character nobody drew and still get a sprite.
- **Repair instead of retry.** Small models get references wrong. They connect a door to a room that doesn't exist, or lock a key behind its own door. Rather than asking again (which costs minutes on a laptop), `repair.ts` fixes the blueprint deterministically. It reconnects orphaned rooms and moves keys until a fixpoint search proves every room is reachable. It also tops up haunts that are too easy. Early on, Gemma wrote a haunt with two objectives and no way out, and it was over almost as soon as it began. Now every haunt has at least three objectives, ends in an escape from the room farthest from the start, and has something hunting you.
- **A generator that respects the art.** Rooms are laid out by walking the connection graph and drawn in 3/4 view, with real wall faces. Corner autotiling handles the ceiling trim. Furniture has placement rules: desks go in rows and mirrors hang on walls. Lighting is per-tile line of sight, blurred into soft darkness under a cold moonlight grade.
- **Never pay for the same haunt twice.** At about 11 tokens a second, a summon takes five to eight minutes. Every haunt is saved the moment it exists. Typing a prompt again loads it instantly, and a summon keeps generating even if you close the tab.

Two Ollama details did make it difficult to work with. Gemma 4 thinks before answering by default, which made every request far slower; `reasoning_effort: "none"` turns that off. And Ollama's default 4k context truncates a whole building, so `npm run setup:model` creates a `haunt-gemma` alias with 16k.

The rest of the stack is open source, too: Next.js 16, Phaser 4, Zod, and Liberated Pixel Cup art. The sound is synthesized live with the Web Audio API: wind, footsteps that change with the floor, and a heartbeat that quickens as something gets closer. That means there are no recordings to license.

## Why Does Open Innovation Matter?

Because a game like this is a terrible fit for an API bill.

Every haunt is roughly 5,500 characters of JSON, and every conversation and epitaph is another call. With open weights, a player who spends an evening summoning twenty haunted houses costs nothing, and nobody needs an account or a key. Clone the repo and the haunted house lives on your machine, along with your graves.

Open weights also let me make the model fit the job rather than the other way round. I could pin the exact build, give it a bigger context window and switch off its thinking. It's held to a schema, and when it slips, the code repairs the blueprint and moves on. None of that depends on a provider keeping a model alive or changing its behavior under me. The haunts you summon this October will be the same buildings next October.

And the art could only come from an open commons. Every room, prop and person in the game was drawn by the Liberated Pixel Cup community and shared so that projects like this could exist. The model can dress a character in anything from that commons because the commons is open.

## The Spirit of It

Día de los Muertos falls right after Halloween, and the game borrows from it. On the easiest difficulty, a trail of marigold petals leads you through the dark to your next objective. Marigolds are what families scatter to guide the dead home, and here they guide the living.
