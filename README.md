# Haunt Engine

Describe a place. Walk through what's waiting in it.

You type a premise ("a cozy bakery", "the classroom where my grandmother taught"). An
open-weight model (Gemma, running on your own machine) turns it into a haunted building: rooms,
furniture, characters with things to say, a chain of objectives, something that hunts you.
The game builds that into a top-down horror level you play in the browser. When you die, the
model carves your epitaph, and your grave stays in that haunt for your next visit.

Everything runs locally. There are no accounts, no API keys and no server besides your own.

## What you need

- **Node.js 20.9 or newer**
- **[Ollama](https://ollama.com) 0.30.5 or newer**
- **About 10 GB of free memory and 8 GB of disk** for the 12B model. Developed on an Apple
  Silicon MacBook Pro with 24 GB of memory.
- A browser with WebGL (any current Chrome, Firefox, Safari or Edge)

## Run it

```bash
git clone <this repo> haunt-engine
cd haunt-engine
npm install

# with Ollama running (open the app, or `ollama serve`):
npm run setup:model    # pulls gemma4:12b-it-qat, creates "haunt-gemma" with a 16k context

npm run dev
```

Open <http://localhost:3000>.

The first `npm run dev` needs an internet connection once, to fetch the fonts. After that,
everything works offline.

### Your first visit

**St. Agnes Elementary** is a hand-written haunt you can enter right away. Characters you speak
to and the epitaph on your grave still come from the model, so Ollama needs to be running.

**Summoning** a new haunt has the model write the whole building in one go. On a laptop this
takes several minutes; a progress bar shows it working. Every summoned haunt is saved, so
coming back to it, or typing the same prompt again, is instant. Your haunts are listed on the
home page.

### Playing

| | |
|---|---|
| Move | WASD or arrow keys |
| Talk to someone | E or Space, next to them; type, then Enter; Esc to walk away |
| Pick something up | walk over it |
| Unlock a door | walk into it carrying the key |
| Sound on/off | M |

Something in each haunt hunts you. Being caught costs a candle; losing your last candle kills
you. Difficulty is chosen on the home page:

- **Mourner**: three candles, slow monsters, more light, and marigold petals that lead you to
  your next objective
- **Visitor**: two candles
- **Restless**: one candle and a small light

## Your data

Haunts and graves are stored in `.data/store.json` in the project folder. Delete it to start
over with an empty cemetery.

## Configuration

Nothing needs configuring for the default setup. To change models or point at a different
endpoint, copy `.env.example` to `.env.local` and edit it:

| Variable | Default | |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | any OpenAI-compatible chat endpoint |
| `LLM_MODEL` | `haunt-gemma` | designs the haunts |
| `LLM_DIALOGUE_MODEL` | same as `LLM_MODEL` | dialogue and epitaphs; a smaller model makes replies faster |
| `LLM_API_KEY` | `ollama` | only needed for hosted endpoints |
| `LLM_REASONING_EFFORT` | `none` | turns off Gemma 4's thinking; leave empty for endpoints that don't support it |

Restart `npm run dev` after changing these.

The game was built and tested with `haunt-gemma` (Gemma 4 12B). Other models will work if they
follow a JSON schema reliably; anything the model gets wrong (a door to a room that doesn't
exist, a key locked behind its own door, a haunt with no way out) is repaired before you play.

For a faster game, `npm run build && npm start` serves a production build on the same port.

## Troubleshooting

- **Summoning never finishes, or fails with a JSON error.** Check `ollama ps` shows
  `haunt-gemma` loaded. If you pulled the model yourself rather than running
  `npm run setup:model`, the default 4k context is too small for a whole haunt; run the setup
  script.
- **Characters answer "…(the voice fades)".** Ollama isn't reachable at `LLM_BASE_URL`.
- **Port 3000 is taken.** `npm run dev -- --port 3210`

## For developers

- `npm run haunt -- "an abandoned lighthouse"` designs a haunt from the command line and prints
  its map as text. `--from file.json` skips the model, `--seed abc` picks a layout, and
  `--out file.json` saves the blueprint.
- [DESIGN.md](DESIGN.md) explains how it fits together. In short:
  - the model writes a blueprint, validated against a schema whose furniture, floors, walls
    and character clothing are closed lists of the real art (`src/haunt/schema.ts`)
  - `repair.ts` fixes broken references and tops up short haunts
  - `generate.ts` lays the building out from the blueprint and a seed, deterministically
  - `src/game/` is the Phaser 4 game; characters are composited from LPC sprite layers in
    the browser (`compose.ts`)
- The art in `public/assets` and `src/game/assets` is generated. To rebuild it, download the
  packs listed on the credits page and run `scripts/build_assets.py <packs dir>` and
  `scripts/build_characters.py <LPC generator clone>`.

## License and credits

The code is MIT licensed; see [LICENSE](LICENSE). The art is not: it comes from the Liberated
Pixel Cup community under CC-BY-SA (with GPL or OGA-BY alternatives for some pieces). See
[ASSETS.md](ASSETS.md) for what that covers, and the in-game **Credits** page (`/credits`) for
full attribution, including every pack's own credits file.

Fonts: IM Fell English by Igino Marini (SIL Open Font License), loaded from Google Fonts. Sound
is synthesised in the browser.
