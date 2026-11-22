# VICE HARBOR — dossier

## Premise

Sunset County, dusk. You are the courier every crew in Vice Harbor
calls when a package has to move and nobody wants their own name on
it. The city is yours to cross — avenues, back blocks, the Neon Docks
on the south shore — but the sheriff's department keeps score in
stars, and every star brings another cruiser onto the street.

## How it plays

- **Walk or drive.** On foot you cross the city at a jog. Press **E**
  next to any car — yours, parked, or rolling in traffic — to take
  the wheel; press **E** again to step out.
- **Follow the beacon.** Each job marks its next step with a golden
  pillar of light and an edge arrow with the distance when it is
  off-screen. Drive (or walk) into the ring to advance the job.
- **Mind the stars.** Clipping traffic, knocking down a pedestrian,
  lifting a package, or boosting a stranger's car all raise your
  wanted level, one star at a time. Police cruisers spawn to match
  the heat and chase you down. Break their line of sight and keep it
  broken, and the stars cool off one by one.
- **Don't get pinned.** A cruiser in contact while you are barely
  moving fills the bust meter. Let it fill and the night ends in
  handcuffs, a fine, and a long walk from the safehouse.

## Systems

- **Driving.** A simple arcade model: acceleration, braking and
  reverse, speed-sensitive steering, a handbrake, and circle-versus-
  building collision with a bounce. Cars are drawn from primitives —
  body, glass, wheels, headlights — and the hero coupe is teal so it
  is always findable in traffic.
- **Traffic.** Civilian cars drive the road grid lane by lane,
  choosing straight / left / right at each intersection and braking
  for the car ahead. Parked cars line the avenues, and every one of
  them can be taken.
- **Wanted & police.** A five-star meter. Incidents add stars on a
  short cooldown so one scrape is not five stars; cruisers spawn at
  intersections out of sight to match the current heat, steer after
  the player, and back off when the heat dies. The bust meter fills
  while a cruiser is in contact and the player is slow or on foot and
  cornered.
- **Missions.** Three jobs scripted as stage lists in the city data:
  a pickup-and-deliver run to the docks, an escape-and-lie-low job
  that starts at three stars, and a timed three-crate delivery round.
  Finishing a job banks its reward and offers the next; finishing the
  last one leaves the city in free roam.
- **The city.** A 40×30-tile grid generated from a fixed seed:
  avenues and streets, procedurally filled building blocks with lit
  windows, palm-lined dock row, and harbor water to the south.

## Tech

Plain JavaScript and canvas 2D. No frameworks, no libraries, no
images, no fonts, no network requests — the whole game is four text
files (`index.html`, `style.css`, `city.js`, `game.js`). The layout
is deterministic (one fixed seed), which is also what makes the
screenshot modes below reproducible.

## The screenshots

- `1-start.jpg` — the title card over the dusk city: VICE HARBOR, the
  premise, and the controls, with the lit streets behind it.
- `2-play.jpg` — live play mid-chase: the hero coupe on the dock road
  with traffic ahead, a cruiser with flashing lights behind, the
  mission beacon down the road, and the HUD showing banked cash and
  two wanted stars.
- `3-end.jpg` — the mission-complete card over the harbor: jobs done,
  cash banked, and the night summarized.
