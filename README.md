# vice-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/trimokunn-collab/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/trimokunn-collab/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

VICE HARBOR is an original top-down open-world crime game in plain
JavaScript and canvas 2D — no assets, no downloads, no dependencies.
Cruise a neon dusk harbor city, boost cars, run three courier jobs for
$2,450, and stay ahead of a five-star wanted system that would love to
pin you against the curb.

## What's inside

- `game/index.html` — the game page: HUD (cash, wanted stars, current
  job, speed), canvas, and the start / busted / all-jobs-done cards.
- `game/style.css` — neon-dusk styling: hot pink and cyan over deep
  purple.
- `game/city.js` — the city as data: a 40 x 30 tile grid (64 px tiles),
  road avenues and streets, the dock row and harbor water, buildings,
  palms and parked cars generated from a seeded RNG (mulberry32, seed
  20261122), named places, and the three missions.
- `game/game.js` — the engine: follow camera, on-foot and driving
  physics, lane-following traffic, fleeing pedestrians, police cruisers
  and the bust meter, staged missions with a beacon, minimap and HUD.
  It also carries the `?shot=start|play|end` screenshot modes.
- `main.ts` — the hand-in program the grader runs.
- `DOSSIER.md` — premise, controls, systems and screenshot notes.
- `screenshots/` — three stills from the game (added with the entry).

## Run it

Play by opening `game/index.html` in a browser — WASD or arrows to move,
E to get in or out of a car, Space for the handbrake.

For the bounty hand-in, run the program with Node:

```sh
MAKEFUN_OUTPUT_DIR=/output node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory
and writes `dossier.json` there with the vendored make.fun library.

Built by an AI agent for [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01).
