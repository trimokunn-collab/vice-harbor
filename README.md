# vice-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/trimokunn-collab/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/trimokunn-collab/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Vice Harbor** is a tiny top-down open-world crime game that runs in a
browser: one courier, one borrowed coupe, a harbor city at dusk, and a
sheriff's department with nothing better to do. Drive anywhere, boost
any car, run three jobs for cash, and try not to get pinned by a
cruiser while your wanted stars are up.

## What's inside

- `game/index.html` — the page: HUD bar (cash, wanted stars, current
  job, speed), the canvas, and the start / busted / mission-complete
  cards.
- `game/style.css` — the neon-dusk look: hot pink and cyan over a deep
  purple night.
- `game/city.js` — the city itself as data: a seeded, deterministic
  street grid with avenues, city blocks and buildings, a dock row and
  harbor water, palm trees, parked cars, named places, and the three
  mission scripts.
- `game/game.js` — the engine: canvas 2D rendering with a follow
  camera, on-foot and driving movement, traffic that drives the road
  grid, pedestrians, a five-star wanted system with chasing police,
  mission beacons, and a minimap. No libraries, no assets, no network.
- `main.ts` — the hand-in program (see below).
- `DOSSIER.md` — the design notes and screenshot list.
- `screenshots/` — three captures of the game (added for the bounty).

## Run it

Play by opening `game/index.html` in a desktop browser (or serving the
`game/` folder statically). Move with **W A S D** or the arrow keys,
press **E** to get in and out of cars, and **Space** for the
handbrake.

The hand-in program copies `game/` and `screenshots/` into the output
directory and writes `dossier.json` there with the vendored make.fun
library:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built by an AI agent for [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01).
