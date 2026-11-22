// VICE HARBOR — city data. Plain globals only; game.js reads everything here.
//
// The city is a grid of 40 x 30 tiles of 64 px: a 2560 x 1920 world.
// Avenues run north-south, streets run east-west; between them sit city
// blocks with buildings. The south edge is the harbor: a wooden dock row
// (tile row 26), a boardwalk street (row 25) and open water below that.

const TILE = 64;
const COLS = 40;
const ROWS = 30;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;

// Road tile coordinates. A tile is a road when its column is an avenue
// or its row is a street.
const AVENUES = [2, 9, 16, 23, 30, 37];
const STREETS = [2, 8, 14, 20, 25];

const DOCK_ROW = 26;   // wooden dock planks
const WATER_ROW = 27;  // rows 27..29 are water

// Seeded RNG (mulberry32) so the city is the same on every load.
function vhMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const vhRand = vhMulberry32(20261122);
function vhRange(lo, hi) { return lo + vhRand() * (hi - lo); }
function vhPick(list) { return list[Math.floor(vhRand() * list.length)]; }

function isAvenue(tx) { return AVENUES.indexOf(tx) !== -1; }
function isStreet(ty) { return STREETS.indexOf(ty) !== -1; }

// Tile kinds: "road", "dock", "water", "block".
function tileKind(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return "block";
  if (ty >= WATER_ROW) return "water";
  if (ty === DOCK_ROW) return "dock";
  if (isAvenue(tx) || isStreet(ty)) return "road";
  return "block";
}
function tileAtPx(x, y) { return tileKind(Math.floor(x / TILE), Math.floor(y / TILE)); }
function isDrivable(x, y) {
  const k = tileAtPx(x, y);
  return k === "road" || k === "dock";
}

// Buildings fill the city blocks: the roads cut the map into rectangular
// blocks, and each block is filled with a grid of buildings (some cells
// left empty as plazas and parking lots). Palms dot the leftover ground.
const BUILDING_COLORS = ["#2b1b4d", "#33205a", "#241640", "#3a2563", "#2e1e52", "#402a6b"];
const ROOF_TRIMS = ["#ff2e88", "#2ee6ff", "#ffc93c", "#7dff9a", "#ff7ab5"];

// Tile spans between two road lines, e.g. avenues at 2 and 9 -> span 3..8.
function vhSpans(lines, limit) {
  const spans = [];
  let start = 0;
  for (const line of lines) {
    if (line > start) spans.push([start, line - 1]);
    start = line + 1;
  }
  if (start < limit) spans.push([start, limit - 1]);
  return spans;
}
const BLOCK_COLS = vhSpans(AVENUES, COLS);
const BLOCK_ROWS = vhSpans(STREETS.concat([DOCK_ROW]), ROWS);

const BUILDINGS = [];
for (const [ry0, ry1] of BLOCK_ROWS) {
  for (const [rx0, rx1] of BLOCK_COLS) {
    for (let cy = ry0; cy <= ry1; cy += 2) {
      for (let cx = rx0; cx <= rx1; cx += 2) {
        if (vhRand() < 0.15) continue; // plaza / parking lot
        const cellW = Math.min(2, rx1 - cx + 1);
        const cellH = Math.min(2, ry1 - cy + 1);
        const inset = 7;
        BUILDINGS.push({
          x: cx * TILE + inset,
          y: cy * TILE + inset,
          w: cellW * TILE - inset * 2,
          h: cellH * TILE - inset * 2,
          color: vhPick(BUILDING_COLORS),
          trim: vhPick(ROOF_TRIMS),
          floors: 2 + Math.floor(vhRand() * 4),
          seed: Math.floor(vhRand() * 100000)
        });
      }
    }
  }
}

function buildingAt(x, y) {
  for (const b of BUILDINGS) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}
// Circle-vs-buildings test used by the player, cars and pedestrians.
function circleHitsBuilding(x, y, r) {
  for (const b of BUILDINGS) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

const PALMS = [];
for (let i = 0; i < 90; i++) {
  const tx = Math.floor(vhRange(0, COLS));
  const ty = Math.floor(vhRange(0, ROWS));
  const k = tileKind(tx, ty);
  if (k !== "block" && k !== "dock") continue;
  const x = tx * TILE + vhRange(10, TILE - 10);
  const y = ty * TILE + vhRange(10, TILE - 10);
  if (buildingAt(x, y)) continue;
  PALMS.push({ x, y, sway: vhRange(0, Math.PI * 2) });
}

// Parked cars: sitting on road tiles at the curb, ready to be "borrowed".
const CAR_COLORS = ["#ff2e88", "#2ee6ff", "#ffc93c", "#7dff9a", "#f6ecff", "#ff7a3c", "#9a7dff", "#3cd6ff"];
const PARKED_SPOTS = [];
for (const ax of AVENUES) {
  for (let ty = 0; ty < ROWS; ty++) {
    if (ty === DOCK_ROW || ty >= WATER_ROW) continue;
    if (vhRand() < 0.42) continue;
    PARKED_SPOTS.push({
      x: (ax + 0.5) * TILE + (vhRand() < 0.5 ? -14 : 14),
      y: (ty + 0.5) * TILE,
      angle: Math.PI / 2, // parked parallel to the avenue
      color: vhPick(CAR_COLORS)
    });
  }
}
for (const sy of STREETS) {
  for (let tx = 0; tx < COLS; tx++) {
    if (vhRand() < 0.55) continue;
    PARKED_SPOTS.push({
      x: (tx + 0.5) * TILE,
      y: (sy + 0.5) * TILE + (vhRand() < 0.5 ? -14 : 14),
      angle: 0, // parked parallel to the street
      color: vhPick(CAR_COLORS)
    });
  }
}

// Named places, in tile coordinates (converted to pixels by PLACES below).
const PLACE_DEFS = [
  { name: "Harbor Market", tx: 16, ty: 20 },
  { name: "Neon Docks", tx: 23, ty: 26 },
  { name: "The Pink Flamingo", tx: 9, ty: 8 },
  { name: "Sunset Safehouse", tx: 2, ty: 2 },
  { name: "Marina Point", tx: 37, ty: 25 },
  { name: "Crate Warehouse", tx: 30, ty: 14 },
  { name: "Vice General Hospital", tx: 23, ty: 8 },
  { name: "Old Town Garage", tx: 9, ty: 20 }
];
const PLACES = {};
for (const p of PLACE_DEFS) {
  PLACES[p.name] = { name: p.name, x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE };
}
function place(name) { return PLACES[name]; }

// The night's work. Each mission is a list of stages; a stage is either a
// "go" stage (reach the point) with an optional pickup flavour, or a
// "cooldown" stage (wanted level must reach zero before the point counts).
const MISSIONS = [
  {
    id: "harbor-run",
    title: "Harbor Run",
    reward: 650,
    stages: [
      { kind: "go", at: "Harbor Market", label: "Pick up the package at the Harbor Market", pickup: true },
      { kind: "go", at: "Neon Docks", label: "Deliver the package to the Neon Docks" }
    ]
  },
  {
    id: "cool-down",
    title: "Cool Down",
    reward: 800,
    startStars: 3,
    stages: [
      { kind: "cooldown", at: "Sunset Safehouse", label: "Lose the heat, then reach the Sunset Safehouse" }
    ]
  },
  {
    id: "crate-expectations",
    title: "Crate Expectations",
    reward: 1000,
    timeLimit: 150,
    stages: [
      { kind: "go", at: "Crate Warehouse", label: "Load the first crate at the Crate Warehouse", pickup: true },
      { kind: "go", at: "The Pink Flamingo", label: "Drop the crate at The Pink Flamingo" },
      { kind: "go", at: "Marina Point", label: "Final drop: Marina Point" }
    ]
  }
];
