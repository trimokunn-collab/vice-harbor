"use strict";
/* VICE HARBOR — city data.
   A hand-laid grid city on a harbor: avenues run north-south, streets
   run east-west, the Neon Docks sit on the south shore. Everything is
   generated from one fixed seed, so the city is the same on every
   visit and in every screenshot. Plain globals, no modules. */

const VH_TILE = 64;
const VH_COLS = 40;
const VH_ROWS = 30;
const VH_WORLD_W = VH_COLS * VH_TILE;   /* 2560 */
const VH_WORLD_H = VH_ROWS * VH_TILE;   /* 1920 */

/* Deterministic little RNG (mulberry32). */
function vhMulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const vhRng = vhMulberry32(20261122);

/* The street plan: tile columns / rows that are roads. */
const VH_ROAD_COLS = [3, 9, 15, 21, 27, 33, 38];
const VH_ROAD_ROWS = [3, 9, 15, 21, 25];
const VH_DOCK_ROW = 26;                 /* wooden pier promenade */
const VH_WATER_ROWS = [27, 28, 29];     /* the harbor itself */

function vhIsRoadCol(tx) { return VH_ROAD_COLS.indexOf(tx) >= 0; }
function vhIsRoadRow(ty) { return VH_ROAD_ROWS.indexOf(ty) >= 0; }

function vhTileKind(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= VH_COLS || ty >= VH_ROWS) return "water";
  if (VH_WATER_ROWS.indexOf(ty) >= 0) return "water";
  if (ty === VH_DOCK_ROW) return "dock";
  if (vhIsRoadCol(tx) || vhIsRoadRow(ty)) return "road";
  return "block";
}

/* City blocks = the rectangles of land between roads. Returned as
   [firstTile, lastTile] spans along each axis. */
function vhSpans(count, lines) {
  const spans = [];
  let s = 0;
  for (const L of lines) {
    if (L - s >= 1) spans.push([s, L - 1]);
    s = L + 1;
  }
  if (s <= count - 1) spans.push([s, count - 1]);
  return spans;
}
const VH_SPANS_X = vhSpans(VH_COLS, VH_ROAD_COLS);
const VH_SPANS_Y = vhSpans(27, VH_ROAD_ROWS.concat([VH_DOCK_ROW]));

/* ---------- Buildings ---------- */

const VH_BUILDING_COLORS = ["#2b2d5c", "#3a2b5c", "#243b55", "#40284a", "#1f3a4d", "#513252", "#2e4057", "#37284f"];
const VH_WINDOW_WARM = "#ffd97a";
const VH_WINDOW_COOL = "#9be7ff";

const VH_BUILDINGS = [];
(function buildBlocks() {
  let seedBump = 0;
  for (const [x0, x1] of VH_SPANS_X) {
    for (const [y0, y1] of VH_SPANS_Y) {
      const wTiles = x1 - x0 + 1;
      const hTiles = y1 - y0 + 1;
      if (wTiles < 2 || hTiles < 2) continue;
      const plotsX = Math.max(1, Math.round(wTiles / 2));
      const plotsY = Math.max(1, Math.round(hTiles / 2));
      const pw = (wTiles * VH_TILE) / plotsX;
      const ph = (hTiles * VH_TILE) / plotsY;
      for (let i = 0; i < plotsX; i++) {
        for (let j = 0; j < plotsY; j++) {
          if (vhRng() < 0.14) continue;   /* plaza / parking gap */
          const inset = 8 + vhRng() * 8;
          VH_BUILDINGS.push({
            x: x0 * VH_TILE + i * pw + inset,
            y: y0 * VH_TILE + j * ph + inset,
            w: pw - inset * 2,
            h: ph - inset * 2,
            floors: 2 + Math.floor(vhRng() * 8),
            color: VH_BUILDING_COLORS[Math.floor(vhRng() * VH_BUILDING_COLORS.length)],
            winSeed: 31007 + (seedBump += 613),
          });
        }
      }
    }
  }
})();

/* ---------- Palms ---------- */

const VH_PALMS = [];
(function plantPalms() {
  for (let tx = 1; tx < VH_COLS; tx += 2) {
    VH_PALMS.push({ x: tx * VH_TILE + 12, y: VH_DOCK_ROW * VH_TILE + 50 });
  }
  for (let tx = 2; tx < VH_COLS; tx += 3) {
    VH_PALMS.push({ x: tx * VH_TILE + 32, y: 25 * VH_TILE - 12 });
    VH_PALMS.push({ x: tx * VH_TILE + 8, y: 3 * VH_TILE + VH_TILE + 10 });
  }
})();

/* ---------- Parked cars, intersections, places ---------- */

const VH_CAR_COLORS = ["#e74c3c", "#f39c12", "#9b59b6", "#ecf0f1", "#e84393", "#00b894", "#fdcb6e", "#6c5ce7", "#d63031", "#74b9ff"];

const VH_PARKED = [];
(function parkCars() {
  for (const c of VH_ROAD_COLS) {
    for (let i = 0; i < 3; i++) {
      const ty = 1 + Math.floor(vhRng() * 24);
      if (VH_ROAD_ROWS.indexOf(ty) >= 0 || ty === VH_DOCK_ROW) continue;
      VH_PARKED.push({
        x: c * VH_TILE + 15,
        y: ty * VH_TILE + 32,
        angle: Math.PI / 2,
        color: VH_CAR_COLORS[Math.floor(vhRng() * VH_CAR_COLORS.length)],
      });
    }
  }
})();

const VH_INTERSECTIONS = [];
for (const c of VH_ROAD_COLS) {
  for (const r of VH_ROAD_ROWS) {
    VH_INTERSECTIONS.push({ x: c * VH_TILE + 32, y: r * VH_TILE + 32, col: c, row: r });
  }
}

const VH_PLACES = {
  market:    { name: "Harbor Market",      x: 9 * VH_TILE + 32,  y: 9 * VH_TILE + 32 },
  docks:     { name: "Neon Docks",         x: 21 * VH_TILE + 32, y: VH_DOCK_ROW * VH_TILE + 32 },
  safehouse: { name: "Palm Ave Safehouse", x: 33 * VH_TILE + 32, y: 21 * VH_TILE + 32 },
  garage:    { name: "Westside Garage",    x: 3 * VH_TILE + 32,  y: 15 * VH_TILE + 32 },
  hotel:     { name: "Hotel Marisol",      x: 27 * VH_TILE + 32, y: 3 * VH_TILE + 32 },
  start:     { name: "Courthouse Corner",  x: 15 * VH_TILE + 32, y: 21 * VH_TILE + 32 },
};

/* ---------- Missions ----------
   Each mission is a list of stages. A stage is finished by reaching
   its place (pickup / goto / deliver) or, for "escape", by cooling
   the wanted level back to zero. addWanted is applied when a stage
   completes; startWanted is applied when the mission begins;
   timeLimit (seconds) covers the whole mission. */

const VH_MISSIONS = [
  {
    title: "Harbor Run",
    brief: "Pick up the package at Harbor Market, then get it to the Neon Docks.",
    reward: 500,
    stages: [
      { kind: "pickup", place: "market", label: "Pick up the package at Harbor Market", addWanted: 1 },
      { kind: "goto", place: "docks", label: "Deliver the package to the Neon Docks" },
    ],
  },
  {
    title: "Cool Down",
    brief: "You are hot — three stars hot. Lose the heat, then lie low at the safehouse.",
    reward: 750,
    startWanted: 3,
    stages: [
      { kind: "escape", label: "Lose the heat (cool down to zero stars)" },
      { kind: "goto", place: "safehouse", label: "Reach the Palm Ave Safehouse" },
    ],
  },
  {
    title: "Crate Expectations",
    brief: "Three crates, three drops, one clock. Move.",
    reward: 1200,
    timeLimit: 150,
    stages: [
      { kind: "deliver", place: "garage", label: "Drop crate 1 at the Westside Garage" },
      { kind: "deliver", place: "hotel", label: "Drop crate 2 at the Hotel Marisol" },
      { kind: "deliver", place: "docks", label: "Drop crate 3 at the Neon Docks", addWanted: 1 },
    ],
  },
];
