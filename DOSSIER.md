# VICE HARBOR — dossier

## Premise

Vice Harbor is a tiny top-down open-world crime game set in Sunset County, a
neon dusk harbor city of avenues, palm trees and lit windows. You are a
courier with a borrowed coupe and three jobs to close before the night is
yours: a package run to the Neon Docks, a cool-down dash to the safehouse
with three stars on your tail, and a timed crate route across town. Bank
$2,450, keep the wheels turning, and never let a cruiser pin you against
the curb.

## How it plays

- **Move / drive** — WASD or arrow keys.
- **Enter or exit a car** — E, next to any car. Boosting a ride adds a star.
- **Handbrake** — Space. **Start / restart** — Enter or the on-screen button.
- Follow the golden beacon (an edge arrow with distance when it is
  off-screen) to each job stage.

## Systems

- **Driving** — arcade car physics: acceleration, braking and reverse,
  speed-sensitive steering, handbrake slides, and corner-based collision
  against buildings, the map edge and the water.
- **Traffic** — civilian cars cruise the road grid in right-hand lanes,
  slow for the car ahead, and pick new headings at intersections.
  Pedestrians stroll the blocks and flee from fast cars.
- **Wanted & police** — a five-star system. Boosting cars, ramming traffic,
  clipping pedestrians, hard crashes and grabbing packages all raise heat
  (with an incident cooldown). One cruiser rolls in per star; cruisers
  chase and try to pin you. The bust meter fills while a cruiser is in
  contact and you are crawling — a full meter ends the night. Heat decays
  one star at a time while no cruiser has eyes on you.
- **Missions** — three chained jobs with staged objectives: Harbor Run
  (pickup, then deliver to the Neon Docks, $650), Cool Down (starts at
  three stars; reach the Sunset Safehouse only once the heat is gone,
  $800), and Crate Expectations (three deliveries against a 150-second
  clock, $1,000). Finishing all three wins the night.
- **Presentation** — follow camera, minimap with mission target and
  cruisers, HUD (cash, wanted stars, current job, speed), message pill,
  and start / busted / all-jobs-done cards.

## Tech

Plain JavaScript and canvas 2D. Zero assets, zero downloads, zero
dependencies: the city (40 x 30 tiles of 64 px), its buildings, palms and
parked cars are generated from a seeded RNG (mulberry32, seed 20261122),
so the harbor is identical on every load. `main.ts` copies `game/` and
`screenshots/` into the output directory and writes `dossier.json` with
the vendored make.fun library.

## The screenshots

- `1-start.jpg` — title card over the dusk city: the VICE HARBOR start
  overlay with premise and controls, the Harbor Market streets behind it.
- `2-play.jpg` — dock-road chase: the player's pink coupe at speed on the
  boardwalk street, traffic ahead and oncoming, a police cruiser with its
  light bar on its tail, the golden Neon Docks beacon lit, HUD showing
  $650 and two wanted stars.
- `3-end.jpg` — all-jobs-done card: the completion overlay over the docks
  with the night's totals, $2,450 banked and 3/3 jobs closed.
