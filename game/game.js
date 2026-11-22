"use strict";
/* VICE HARBOR — engine.
   Canvas 2D, one follow camera, three ways to move (on foot, in your
   coupe, in somebody else's car), and a sheriff's department that
   treats the whole map as its office. Depends on city.js globals. */

/* ---------- DOM ---------- */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const elCash = document.getElementById("hud-cash");
const elStars = document.getElementById("hud-stars");
const elMission = document.getElementById("hud-mission");
const elSpeed = document.getElementById("hud-speed");
const elMsg = document.getElementById("hud-msg");
const ovStart = document.getElementById("ov-start");
const ovBusted = document.getElementById("ov-busted");
const ovDone = document.getElementById("ov-done");
const elBustedStats = document.getElementById("busted-stats");
const elDoneTitle = document.getElementById("done-title");
const elDoneStats = document.getElementById("done-stats");
const btnStart = document.getElementById("btn-start");
const btnRetry = document.getElementById("btn-retry");
const btnNext = document.getElementById("btn-next");

/* ---------- Small helpers ---------- */

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

function turnToward(a, b, maxStep) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss;
}

/* ---------- Input ---------- */

const keys = {};
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].indexOf(e.key) >= 0) e.preventDefault();
  const k = e.key.toLowerCase();
  if (!e.repeat && k === "e") tryEnterExit();
  if (!e.repeat && e.key === "Enter" && G.mode === "start") startGame();
  keys[k] = true;
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
function keyDown() {
  for (let i = 0; i < arguments.length; i++) if (keys[arguments[i]]) return true;
  return false;
}

/* ---------- Game state ---------- */

const G = {
  mode: "start",          /* start | play | busted | done */
  time: 0,
  cash: 0,
  wanted: 0,
  wantedCd: 0,            /* cooldown between incident stars */
  seenTimer: 0,           /* time since a cruiser last had eyes on us */
  bustTimer: 0,
  spawnCd: 0,
  missionIdx: 0,
  stageIdx: 0,
  timeLeft: null,         /* per-mission countdown, when the job has one */
  freeRoam: false,
  jobsDone: 0,
  busts: 0,
  msgT: 0,
  camX: 0,
  camY: 0,
};

const player = {
  x: VH_PLACES.start.x,
  y: VH_PLACES.start.y + 44,
  angle: -Math.PI / 2,
  speed: 0,               /* on-foot speed, for the bust check */
  car: null,
};

/* ---------- Cars ---------- */

let cars = [];
let peds = [];

function makeCar(x, y, angle, color, kind) {
  return { x: x, y: y, angle: angle, speed: 0, color: color, kind: kind, guide: null, stolen: false, leaving: false, hitCd: 0 };
}

function nextIntersection(x, y, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let best = null, bd = Infinity;
  for (const I of VH_INTERSECTIONS) {
    const rx = I.x - x, ry = I.y - y;
    const ahead = rx * dx + ry * dy;
    const side = Math.abs(-rx * dy + ry * dx);
    if (ahead > 30 && side < 30 && ahead < bd) { bd = ahead; best = I; }
  }
  return best;
}

function buildWorld() {
  cars = [];
  const hero = makeCar(VH_PLACES.start.x - 52, VH_PLACES.start.y, 0, "#17c3b2", "hero");
  cars.push(hero);
  for (const p of VH_PARKED) cars.push(makeCar(p.x, p.y, p.angle, p.color, "parked"));
  for (let i = 0; i < 9; i++) {
    const I = VH_INTERSECTIONS[Math.floor(Math.random() * VH_INTERSECTIONS.length)];
    const ang = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(Math.random() * 4)];
    const c = makeCar(I.x + (-Math.sin(ang)) * 18, I.y + (Math.cos(ang)) * 18, ang,
      VH_CAR_COLORS[Math.floor(Math.random() * VH_CAR_COLORS.length)], "traffic");
    c.guide = nextIntersection(c.x, c.y, c.angle);
    cars.push(c);
  }
  peds = [];
  for (let i = 0; i < 14; i++) {
    const I = VH_INTERSECTIONS[Math.floor(Math.random() * VH_INTERSECTIONS.length)];
    const a = Math.random() * Math.PI * 2;
    peds.push({
      x: clamp(I.x + Math.cos(a) * 52, 20, VH_WORLD_W - 20),
      y: clamp(I.y + Math.sin(a) * 52, 20, VH_WORLD_H - 20),
      tx: 0, ty: 0, down: 0, seed: Math.random() * 10,
    });
    peds[i].tx = peds[i].x; peds[i].ty = peds[i].y;
  }
}

/* ---------- Messages & wanted ---------- */

function setMsg(text, dur) {
  elMsg.textContent = text;
  elMsg.classList.remove("hidden-msg");
  G.msgT = dur || 2.6;
}

function addWanted(n, why) {
  if (n > 0 && G.wantedCd > 0) return;
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  if (n > 0) G.wantedCd = 1.4;
  if (G.wanted > before && why) setMsg(why + " — wanted " + G.wanted + "★", 2.4);
}

/* ---------- Collision & movement ---------- */

function collideBuildings(o, r) {
  let hit = false;
  for (const b of VH_BUILDINGS) {
    const nx = clamp(o.x, b.x, b.x + b.w);
    const ny = clamp(o.y, b.y, b.y + b.h);
    const dx = o.x - nx, dy = o.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      if (d2 === 0) { o.y = b.y - r; }
      else { const d = Math.sqrt(d2); o.x = nx + (dx / d) * r; o.y = ny + (dy / d) * r; }
    }
  }
  return hit;
}

function onWater(x, y) {
  return vhTileKind(Math.floor(x / VH_TILE), Math.floor(y / VH_TILE)) === "water";
}

/* Move a car by its speed/angle; returns true if it hit something solid. */
function moveCar(c, dt) {
  const px = c.x, py = c.y;
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  c.x = clamp(c.x, 16, VH_WORLD_W - 16);
  c.y = clamp(c.y, 16, VH_WORLD_H - 16);
  if (onWater(c.x, c.y)) { c.x = px; c.y = py; return true; }
  return collideBuildings(c, 16);
}

/* ---------- Traffic ---------- */

function updateTraffic(c, dt) {
  if (!c.guide) {
    c.guide = nextIntersection(c.x, c.y, c.angle);
    if (!c.guide) { c.angle += Math.PI; return; }
  }
  const gx = c.guide.x + (-Math.sin(c.angle)) * 18;
  const gy = c.guide.y + (Math.cos(c.angle)) * 18;
  c.angle = turnToward(c.angle, Math.atan2(gy - c.y, gx - c.x), 3.0 * dt);
  let sp = 138;
  for (const o of cars) {
    if (o === c || o.kind === "parked") continue;
    const ahead = (o.x - c.x) * Math.cos(c.angle) + (o.y - c.y) * Math.sin(c.angle);
    if (ahead > 0 && ahead < 54 && Math.abs((o.x - c.x) * -Math.sin(c.angle) + (o.y - c.y) * Math.cos(c.angle)) < 22) { sp = 36; break; }
  }
  c.speed = sp;
  moveCar(c, dt);
  if (dist2(c.x, c.y, c.guide.x, c.guide.y) < 30 * 30) {
    const opts = [c.angle, c.angle - Math.PI / 2, c.angle + Math.PI / 2];
    const na = opts[Math.floor(Math.random() * opts.length)];
    const ni = nextIntersection(c.guide.x, c.guide.y, na);
    if (ni) { c.angle = na; c.guide = ni; }
    else c.guide = nextIntersection(c.guide.x, c.guide.y, c.angle) || c.guide;
  }
}

/* ---------- Police ---------- */

function policeCount() {
  let n = 0;
  for (const c of cars) if (c.kind === "police" && !c.leaving) n++;
  return n;
}

function spawnPolice() {
  const px = player.car ? player.car.x : player.x;
  const py = player.car ? player.car.y : player.y;
  let best = null, bd = Infinity;
  for (const I of VH_INTERSECTIONS) {
    const d = Math.hypot(I.x - px, I.y - py);
    if (d > 500 && d < 820 && d < bd) { bd = d; best = I; }
  }
  if (!best) return;
  const c = makeCar(best.x, best.y, Math.atan2(py - best.y, px - best.x), "#dfe3ee", "police");
  cars.push(c);
}

function updatePolice(c, dt) {
  const tx = player.car ? player.car.x : player.x;
  const ty = player.car ? player.car.y : player.y;
  const d = Math.hypot(tx - c.x, ty - c.y);
  if (c.leaving) {
    const away = Math.atan2(c.y - ty, c.x - tx);
    c.angle = turnToward(c.angle, away, 2.0 * dt);
    c.speed = 240;
    moveCar(c, dt);
    if (d > 640) c.dead = true;
    return;
  }
  c.angle = turnToward(c.angle, Math.atan2(ty - c.y, tx - c.x), 2.4 * dt);
  c.speed = d > 210 ? 322 : 246;
  moveCar(c, dt);
}

/* ---------- Pedestrians ---------- */

function updatePeds(dt) {
  const threat = player.car && Math.abs(player.car.speed) > 90 ? player.car : null;
  for (const p of peds) {
    if (p.down > 0) { p.down -= dt; continue; }
    if (threat && dist2(p.x, p.y, threat.x, threat.y) < 95 * 95) {
      const away = Math.atan2(p.y - threat.y, p.x - threat.x);
      p.x += Math.cos(away) * 210 * dt;
      p.y += Math.sin(away) * 210 * dt;
    } else {
      if (dist2(p.x, p.y, p.tx, p.ty) < 8 * 8 || Math.random() < 0.002) {
        p.tx = clamp(p.x + (Math.random() - 0.5) * 220, 16, VH_WORLD_W - 16);
        p.ty = clamp(p.y + (Math.random() - 0.5) * 220, 16, VH_WORLD_H - 16);
        if (onWater(p.tx, p.ty)) { p.tx = p.x; p.ty = p.y; }
      }
      const a = Math.atan2(p.ty - p.y, p.tx - p.x);
      const nx = p.x + Math.cos(a) * 46 * dt;
      const ny = p.y + Math.sin(a) * 46 * dt;
      if (!onWater(nx, ny)) { p.x = nx; p.y = ny; }
    }
    p.x = clamp(p.x, 10, VH_WORLD_W - 10);
    p.y = clamp(p.y, 10, VH_WORLD_H - 10);
  }
}

/* ---------- Getting in and out of cars ---------- */

function tryEnterExit() {
  if (G.mode !== "play") return;
  if (player.car) {
    const c = player.car;
    const rx = -Math.sin(c.angle), ry = Math.cos(c.angle);
    player.x = clamp(c.x + rx * 30, 12, VH_WORLD_W - 12);
    player.y = clamp(c.y + ry * 30, 12, VH_WORLD_H - 12);
    player.angle = c.angle;
    c.speed = 0;
    if (c.kind === "traffic") c.guide = nextIntersection(c.x, c.y, c.angle);
    player.car = null;
    return;
  }
  let best = null, bd = 50 * 50;
  for (const c of cars) {
    if (c.kind === "police") continue;
    const d = dist2(player.x, player.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) {
    player.car = best;
    if (best.kind !== "hero" && !best.stolen) {
      best.stolen = true;
      addWanted(1, "You boosted a ride!");
    }
  }
}

/* ---------- Player ---------- */

function updatePlayer(dt) {
  if (player.car) {
    const c = player.car;
    const fwd = keyDown("w", "arrowup");
    const back = keyDown("s", "arrowdown");
    if (fwd) c.speed += 265 * dt;
    if (back) c.speed -= (c.speed > 5 ? 430 : 165) * dt;
    if (keyDown(" ")) {
      c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 620 * dt);
    }
    c.speed -= c.speed * 0.65 * dt;
    if (!fwd && !back) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 26 * dt);
    c.speed = clamp(c.speed, -125, 352);
    let steer = 0;
    if (keyDown("a", "arrowleft")) steer -= 1;
    if (keyDown("d", "arrowright")) steer += 1;
    if (steer !== 0 && c.speed !== 0) c.angle += steer * 1.75 * dt * clamp(c.speed / 95, -1, 1);
    const before = Math.abs(c.speed);
    const hit = moveCar(c, dt);
    if (hit && before > 130) {
      c.speed = -c.speed * 0.22;
      addWanted(1, "You smashed into a building!");
      setMsg("You smashed into a building!", 1.8);
    }
    player.x = c.x; player.y = c.y; player.angle = c.angle;
    player.speed = Math.abs(c.speed);
  } else {
    let mx = 0, my = 0;
    if (keyDown("a", "arrowleft")) mx -= 1;
    if (keyDown("d", "arrowright")) mx += 1;
    if (keyDown("w", "arrowup")) my -= 1;
    if (keyDown("s", "arrowdown")) my += 1;
    player.speed = (mx !== 0 || my !== 0) ? 176 : 0;
    if (player.speed > 0) {
      const a = Math.atan2(my, mx);
      player.angle = a;
      const px = player.x, py = player.y;
      player.x += Math.cos(a) * player.speed * dt;
      player.y += Math.sin(a) * player.speed * dt;
      player.x = clamp(player.x, 10, VH_WORLD_W - 10);
      player.y = clamp(player.y, 10, VH_WORLD_H - 10);
      if (onWater(player.x, player.y)) { player.x = px; player.y = py; }
      collideBuildings(player, 10);
    }
  }
}

/* ---------- Incidents: car vs car, car vs pedestrian ---------- */

function updateIncidents(dt) {
  for (const c of cars) if (c.hitCd > 0) c.hitCd -= dt;
  const hero = player.car;
  if (hero) {
    for (const o of cars) {
      if (o === hero) continue;
      const d2 = dist2(hero.x, hero.y, o.x, o.y);
      if (d2 < 35 * 35) {
        const d = Math.sqrt(d2) || 1;
        const push = (35 - d) / 2;
        const ux = (hero.x - o.x) / d, uy = (hero.y - o.y) / d;
        hero.x += ux * push; hero.y += uy * push;
        if (o.kind !== "parked") { o.x -= ux * push; o.y -= uy * push; }
        if (Math.abs(hero.speed) > 95 && hero.hitCd <= 0) {
          hero.hitCd = 1.6;
          if (o.kind === "police") addWanted(1, "You rammed a cruiser!");
          else addWanted(1, "You clipped a car!");
        }
        hero.speed *= 0.55;
      }
    }
    if (Math.abs(hero.speed) > 70) {
      for (const p of peds) {
        if (p.down <= 0 && dist2(hero.x, hero.y, p.x, p.y) < 21 * 21) {
          p.down = 6;
          addWanted(1, "You ran someone down!");
        }
      }
    }
  }
}

/* ---------- Heat: spawning, cooling, busting ---------- */

function updateHeat(dt) {
  if (G.wantedCd > 0) G.wantedCd -= dt;
  if (G.spawnCd > 0) G.spawnCd -= dt;

  let nearestPolice = Infinity;
  for (const c of cars) {
    if (c.kind !== "police" || c.leaving) continue;
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < nearestPolice) nearestPolice = d;
  }

  if (G.wanted > 0) {
    if (policeCount() < Math.min(4, G.wanted) && G.spawnCd <= 0) {
      spawnPolice();
      G.spawnCd = 2.2;
    }
    if (nearestPolice < 470) G.seenTimer = 0;
    else {
      G.seenTimer += dt;
      if (G.seenTimer > 7) {
        G.wanted -= 1;
        G.seenTimer = 0;
        if (G.wanted === 0) {
          setMsg("You lost the heat.", 2.2);
          for (const c of cars) if (c.kind === "police") c.leaving = true;
        } else setMsg("Heat cooling — " + G.wanted + "★ left.", 2.0);
      }
    }
    /* The bust meter: pinned by a cruiser while slow. */
    if (nearestPolice < 36 && player.speed < 55) {
      G.bustTimer += dt;
      if (G.bustTimer > 0.4) setMsg("BUSTED in " + Math.max(0, 2.2 - G.bustTimer).toFixed(1) + "… move!", 0.3);
      if (G.bustTimer >= 2.2) doBusted();
    } else {
      G.bustTimer = Math.max(0, G.bustTimer - dt * 2);
    }
  } else {
    G.bustTimer = 0;
    for (const c of cars) if (c.kind === "police" && !c.leaving) c.leaving = true;
  }
}

/* ---------- Missions ---------- */

function currentMission() {
  if (G.freeRoam) return null;
  return VH_MISSIONS[G.missionIdx] || null;
}

function currentStage() {
  const m = currentMission();
  if (!m) return null;
  return m.stages[G.stageIdx] || null;
}

function stageTarget() {
  const s = currentStage();
  if (!s || s.kind === "escape") return null;
  return VH_PLACES[s.place];
}

function startMission(i) {
  G.missionIdx = i;
  G.stageIdx = 0;
  const m = VH_MISSIONS[i];
  G.timeLeft = (typeof m.timeLimit === "number") ? m.timeLimit : null;
  if (m.startWanted) G.wanted = Math.max(G.wanted, m.startWanted);
  setMsg("New job: " + m.title + " — " + m.brief, 4.2);
}

function completeStage() {
  const m = currentMission();
  const s = currentStage();
  if (!m || !s) return;
  if (s.addWanted) { G.wantedCd = 0; addWanted(s.addWanted, "Job step done, but somebody saw that"); }
  G.stageIdx += 1;
  if (G.stageIdx >= m.stages.length) completeMission();
  else setMsg("Nice. Next: " + m.stages[G.stageIdx].label, 3.0);
}

function completeMission() {
  const m = currentMission();
  G.cash += m.reward;
  G.jobsDone += 1;
  G.timeLeft = null;
  G.mode = "done";
  const last = G.missionIdx >= VH_MISSIONS.length - 1;
  elDoneTitle.textContent = last ? "ALL JOBS DONE" : "JOB DONE — " + m.title.toUpperCase();
  elDoneStats.textContent =
    "The " + m.title + " job pays $" + m.reward + ". Cash banked: $" + G.cash +
    " · Jobs " + G.jobsDone + "/" + VH_MISSIONS.length + " · Time " + fmtTime(G.time) +
    (G.busts > 0 ? " · Busted " + G.busts + "×" : " · Never busted");
  btnNext.textContent = last ? "Keep cruising" : "Take the next job";
  ovDone.classList.remove("hidden");
}

function failMission() {
  setMsg("Job blown — the clock ran out. Back to the start of it.", 3.4);
  startMission(G.missionIdx);
}

function updateMission(dt) {
  const m = currentMission();
  if (!m) return;
  if (G.timeLeft !== null) {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { failMission(); return; }
  }
  const s = currentStage();
  if (!s) return;
  if (s.kind === "escape") {
    if (G.wanted === 0) completeStage();
    return;
  }
  const t = stageTarget();
  if (t && dist2(player.x, player.y, t.x, t.y) < 54 * 54) completeStage();
}

/* ---------- Round flow ---------- */

function startGame() {
  buildWorld();
  G.mode = "play";
  G.time = 0;
  G.cash = 0;
  G.wanted = 0;
  G.wantedCd = 0;
  G.seenTimer = 0;
  G.bustTimer = 0;
  G.spawnCd = 0;
  G.jobsDone = 0;
  G.busts = 0;
  G.freeRoam = false;
  player.car = null;
  player.x = VH_PLACES.start.x;
  player.y = VH_PLACES.start.y + 44;
  player.angle = -Math.PI / 2;
  ovStart.classList.add("hidden");
  ovBusted.classList.add("hidden");
  ovDone.classList.add("hidden");
  startMission(0);
}

function doBusted() {
  G.mode = "busted";
  G.busts += 1;
  const fine = Math.min(150, G.cash);
  elBustedStats.textContent =
    "They boxed you in at " + fmtTime(G.time) + " with " + G.wanted + "★ on your head. " +
    "The fine is $" + fine + " and the coupe gets towed — you walk out of the Palm Ave Safehouse.";
  ovBusted.classList.remove("hidden");
  btnRetry.dataset.fine = String(fine);
}

function afterBusted() {
  const fine = parseInt(btnRetry.dataset.fine || "0", 10);
  G.cash -= fine;
  G.wanted = 0;
  G.bustTimer = 0;
  G.seenTimer = 0;
  cars = cars.filter((c) => c.kind !== "police");
  player.car = null;
  player.x = VH_PLACES.safehouse.x;
  player.y = VH_PLACES.safehouse.y + 44;
  const hero = cars.find((c) => c.kind === "hero");
  if (hero) { hero.x = VH_PLACES.safehouse.x - 52; hero.y = VH_PLACES.safehouse.y; hero.angle = 0; hero.speed = 0; }
  ovBusted.classList.add("hidden");
  G.mode = "play";
  if (!G.freeRoam) startMission(G.missionIdx);
}

btnStart.addEventListener("click", startGame);
btnRetry.addEventListener("click", afterBusted);
btnNext.addEventListener("click", () => {
  ovDone.classList.add("hidden");
  G.mode = "play";
  if (G.missionIdx >= VH_MISSIONS.length - 1) {
    G.freeRoam = true;
    setMsg("Every job is done. The city is yours — cruise.", 3.6);
  } else {
    startMission(G.missionIdx + 1);
  }
});

/* ---------- The tick ---------- */

function update(dt) {
  G.time += dt;
  if (G.msgT > 0) {
    G.msgT -= dt;
    if (G.msgT <= 0) elMsg.classList.add("hidden-msg");
  }
  updatePlayer(dt);
  for (const c of cars) {
    if (c === player.car) continue;
    if (c.kind === "traffic") updateTraffic(c, dt);
    else if (c.kind === "police") updatePolice(c, dt);
  }
  cars = cars.filter((c) => !c.dead);
  updatePeds(dt);
  updateIncidents(dt);
  updateHeat(dt);
  updateMission(dt);
}

/* ---------- Rendering ---------- */

function drawGround(cx, cy) {
  ctx.fillStyle = "#1d1d2b";
  ctx.fillRect(cx, cy, canvas.width, canvas.height);
  const tx0 = Math.max(0, Math.floor(cx / VH_TILE));
  const tx1 = Math.min(VH_COLS - 1, Math.floor((cx + canvas.width) / VH_TILE));
  const ty0 = Math.max(0, Math.floor(cy / VH_TILE));
  const ty1 = Math.min(VH_ROWS - 1, Math.floor((cy + canvas.height) / VH_TILE));
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const kind = vhTileKind(tx, ty);
      const x = tx * VH_TILE, y = ty * VH_TILE;
      if (kind === "road") {
        ctx.fillStyle = "#26262f";
        ctx.fillRect(x, y, VH_TILE, VH_TILE);
      } else if (kind === "dock") {
        ctx.fillStyle = "#5b4632";
        ctx.fillRect(x, y, VH_TILE, VH_TILE);
        ctx.fillStyle = "rgba(0,0,0,0.20)";
        for (let i = 1; i < 4; i++) ctx.fillRect(x, y + i * 16, VH_TILE, 2);
      } else if (kind === "water") {
        ctx.fillStyle = "#0d2b4d";
        ctx.fillRect(x, y, VH_TILE, VH_TILE);
        const r = vhMulberry32(tx * 131 + ty * 977 + 5);
        ctx.fillStyle = "rgba(140,200,255,0.20)";
        for (let i = 0; i < 3; i++) ctx.fillRect(x + r() * 44, y + 8 + r() * 48, 14, 2);
      }
    }
  }
  ctx.fillStyle = "rgba(216,190,90,0.50)";
  for (const c of VH_ROAD_COLS) {
    const x = c * VH_TILE + 30;
    for (let y = Math.floor(cy / 48) * 48; y < cy + canvas.height; y += 48) {
      if (vhTileKind(c, Math.floor((y + 12) / VH_TILE)) === "road") ctx.fillRect(x, y + 6, 4, 24);
    }
  }
  for (const r of VH_ROAD_ROWS) {
    const y = r * VH_TILE + 30;
    for (let x = Math.floor(cx / 48) * 48; x < cx + canvas.width; x += 48) {
      if (vhTileKind(Math.floor((x + 12) / VH_TILE), r) === "road") ctx.fillRect(x + 6, y, 24, 4);
    }
  }
}

function drawBuildings(cx, cy) {
  for (const b of VH_BUILDINGS) {
    if (b.x + b.w < cx - 20 || b.x > cx + canvas.width + 20 || b.y + b.h < cy - 20 || b.y > cy + canvas.height + 20) continue;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
    if (b.floors >= 7) {
      ctx.strokeStyle = (b.winSeed % 2 === 0) ? "rgba(255,46,136,0.75)" : "rgba(55,224,255,0.75)";
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.lineWidth = 1;
    }
    const cols = Math.max(1, Math.floor(b.w / 15));
    const rows = Math.max(1, Math.floor(b.h / 15));
    const rng = vhMulberry32(b.winSeed);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rng() < 0.42) {
          ctx.fillStyle = rng() < 0.72 ? "rgba(255,217,122,0.92)" : "rgba(155,231,255,0.92)";
          ctx.fillRect(b.x + 6 + i * 15, b.y + 6 + j * 15, 6, 8);
        }
      }
    }
  }
}

function drawPalms() {
  ctx.lineCap = "round";
  for (const p of VH_PALMS) {
    ctx.strokeStyle = "#6e4f2a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 3, p.y - 15);
    ctx.stroke();
    ctx.strokeStyle = "#2fae5f";
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 5; i++) {
      const a = -0.4 - i * 0.5;
      ctx.beginPath();
      ctx.moveTo(p.x + 3, p.y - 15);
      ctx.lineTo(p.x + 3 + Math.cos(a) * 13, p.y - 15 + Math.sin(a) * 9 - 2);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
}

function drawCar(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  rr(-18, -7, 38, 19, 6); ctx.fill();
  ctx.fillStyle = "#101018";
  ctx.fillRect(9, -13, 9, 5); ctx.fillRect(9, 8, 9, 5);
  ctx.fillRect(-18, -13, 9, 5); ctx.fillRect(-18, 8, 9, 5);
  ctx.fillStyle = c.kind === "police" ? "#dfe3ee" : c.color;
  rr(-19, -10, 38, 20, 6); ctx.fill();
  if (c.kind === "police") {
    ctx.fillStyle = "#20306e";
    ctx.fillRect(-19, -3, 38, 6);
  }
  if (c.kind === "hero") {
    ctx.fillStyle = "rgba(10,10,18,0.85)";
    ctx.fillRect(-19, -2.5, 38, 5);
  }
  ctx.fillStyle = "rgba(160,220,255,0.55)";
  ctx.fillRect(4, -8, 5, 16);
  ctx.fillStyle = "rgba(160,220,255,0.32)";
  ctx.fillRect(-11, -8, 4, 16);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  rr(-7, -8, 13, 16, 4); ctx.fill();
  ctx.fillStyle = "#fff6c9";
  ctx.beginPath(); ctx.arc(19, -6, 2.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(19, 6, 2.2, 0, 7); ctx.fill();
  if (c.kind === "police") {
    const phase = (G.time * 2.2) % 1;
    const redA = phase < 0.5 ? 1 : 0.22;
    const blueA = phase < 0.5 ? 0.22 : 1;
    ctx.fillStyle = "rgba(255,60,60," + (redA * 0.35) + ")";
    ctx.beginPath(); ctx.arc(-4, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(70,140,255," + (blueA * 0.35) + ")";
    ctx.beginPath(); ctx.arc(4, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,60,60," + redA + ")";
    ctx.fillRect(-8, -3, 6, 6);
    ctx.fillStyle = "rgba(70,140,255," + blueA + ")";
    ctx.fillRect(2, -3, 6, 6);
  }
  ctx.restore();
}

function drawPeds() {
  const cols = ["#e17055", "#00cec9", "#fdcb6e", "#a29bfe", "#fd79a8", "#81ecec"];
  for (const p of peds) {
    if (p.down > 0) {
      ctx.fillStyle = "rgba(120,120,130,0.65)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, 7); ctx.fill();
      continue;
    }
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = cols[Math.floor(p.seed) % cols.length];
    ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#f1c27d";
    ctx.beginPath(); ctx.arc(p.x, p.y - 1, 3, 0, 7); ctx.fill();
  }
}

function drawPlayerFoot() {
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath(); ctx.arc(player.x + 2, player.y + 4, 9, 0, 7); ctx.fill();
  ctx.fillStyle = "#ffb347";
  ctx.beginPath(); ctx.arc(player.x, player.y, 9, 0, 7); ctx.fill();
  ctx.fillStyle = "#f1c27d";
  ctx.beginPath();
  ctx.arc(player.x + Math.cos(player.angle) * 3.5, player.y + Math.sin(player.angle) * 3.5, 4.6, 0, 7);
  ctx.fill();
  ctx.strokeStyle = "#ffe9c9";
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(player.x + Math.cos(player.angle) * 13, player.y + Math.sin(player.angle) * 13);
  ctx.stroke();
}

function drawMarkerWorld(cx, cy) {
  const t = stageTarget();
  if (!t || G.mode !== "play") return;
  if (t.x < cx - 60 || t.x > cx + canvas.width + 60 || t.y < cy - 240 || t.y > cy + canvas.height + 60) return;
  const grad = ctx.createLinearGradient(0, t.y - 210, 0, t.y);
  grad.addColorStop(0, "rgba(255,217,77,0)");
  grad.addColorStop(1, "rgba(255,217,77,0.30)");
  ctx.fillStyle = grad;
  ctx.fillRect(t.x - 11, t.y - 210, 22, 210);
  ctx.strokeStyle = "rgba(255,217,77,0.45)";
  ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.arc(t.x, t.y, 54, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "#ffd94d";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(t.x, t.y, 30 + Math.sin(G.time * 3) * 5, 0, 7); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = "#ffd94d";
  ctx.beginPath();
  ctx.moveTo(t.x, t.y - 210);
  ctx.lineTo(t.x + 20, t.y - 200);
  ctx.lineTo(t.x, t.y - 190);
  ctx.closePath(); ctx.fill();
  ctx.font = "700 13px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffeeb0";
  ctx.fillText(t.name, t.x, t.y - 222);
  ctx.textAlign = "left";
}

function drawMarkerScreen(cx, cy) {
  const t = stageTarget();
  if (!t || G.mode !== "play") return;
  const sx = t.x - cx, sy = t.y - cy;
  if (sx > 30 && sx < canvas.width - 30 && sy > 30 && sy < canvas.height - 30) return;
  const ex = clamp(sx, 40, canvas.width - 40);
  const ey = clamp(sy, 46, canvas.height - 40);
  const a = Math.atan2(sy - ey, sx - ex);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.fillStyle = "#ffd94d";
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-9, -9);
  ctx.lineTo(-9, 9);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = "700 12px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffeeb0";
  ctx.fillText(Math.round(Math.hypot(t.x - player.x, t.y - player.y) / 10) + "m", ex, ey + 28);
  ctx.textAlign = "left";
}

function drawMinimap() {
  const mw = 150, mh = 112;
  const mx = canvas.width - mw - 12, my = 12;
  const sx = mw / VH_WORLD_W, sy = mh / VH_WORLD_H;
  ctx.save();
  ctx.fillStyle = "rgba(6,6,18,0.78)";
  rr(mx, my, mw, mh, 8); ctx.fill();
  ctx.strokeStyle = "rgba(55,224,255,0.5)";
  ctx.stroke();
  ctx.fillStyle = "rgba(50,110,190,0.65)";
  ctx.fillRect(mx, my + 27 * VH_TILE * sy, mw, mh - 27 * VH_TILE * sy);
  ctx.fillStyle = "rgba(150,160,200,0.55)";
  for (const c of VH_ROAD_COLS) ctx.fillRect(mx + c * VH_TILE * sx, my, 2, mh);
  for (const r of VH_ROAD_ROWS) ctx.fillRect(mx, my + r * VH_TILE * sy, mw, 2);
  const t = stageTarget();
  if (t && G.mode === "play") {
    ctx.fillStyle = "#ffd94d";
    ctx.beginPath(); ctx.arc(mx + t.x * sx, my + t.y * sy, 3.4, 0, 7); ctx.fill();
  }
  for (const c of cars) {
    if (c.kind !== "police") continue;
    ctx.fillStyle = Math.floor(G.time * 2) % 2 === 0 ? "#ff4747" : "#37e0ff";
    ctx.fillRect(mx + c.x * sx - 1.6, my + c.y * sy - 1.6, 3.2, 3.2);
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(mx + player.x * sx, my + player.y * sy, 3, 0, 7); ctx.fill();
  ctx.restore();
}

function updateHUD() {
  elCash.textContent = "$" + G.cash;
  elStars.textContent = "★".repeat(G.wanted) + "☆".repeat(5 - G.wanted);
  let mtxt;
  if (G.mode === "start") mtxt = "Press Enter or hit Start";
  else if (G.freeRoam) mtxt = "Free roam — the city is yours";
  else {
    const m = currentMission();
    const s = currentStage();
    if (m && s) {
      mtxt = m.title + ": " + s.label;
      if (G.timeLeft !== null) mtxt += " · " + Math.ceil(G.timeLeft) + "s left";
    } else mtxt = "—";
  }
  elMission.textContent = mtxt;
  elSpeed.textContent = player.car ? Math.round(Math.abs(player.car.speed) * 0.24) + " mph" : "—";
}

function render() {
  const focus = shotFocus || player;
  let cx, cy;
  if (VH_WORLD_W <= canvas.width) cx = (VH_WORLD_W - canvas.width) / 2;
  else cx = clamp(focus.x - canvas.width / 2, 0, VH_WORLD_W - canvas.width);
  if (VH_WORLD_H <= canvas.height) cy = (VH_WORLD_H - canvas.height) / 2;
  else cy = clamp(focus.y - canvas.height / 2, 0, VH_WORLD_H - canvas.height);
  G.camX = cx; G.camY = cy;
  ctx.save();
  ctx.translate(-cx, -cy);
  drawGround(cx, cy);
  drawBuildings(cx, cy);
  drawPalms();
  drawMarkerWorld(cx, cy);
  drawPeds();
  for (const c of cars) drawCar(c);
  if (!player.car) drawPlayerFoot();
  ctx.restore();
  drawMarkerScreen(cx, cy);
  drawMinimap();
  updateHUD();
}

/* ---------- Screenshot modes & boot ----------
   ?shot=start  title card over a downtown backdrop
   ?shot=play   composed chase scene on the dock road, frozen frame
   ?shot=end    mission-complete card over the harbor
   In every shot mode the world is not updated (dt = 0), so the frame
   is stable, and the layout comes from the fixed city seed. */

const SHOT = new URLSearchParams(location.search).get("shot");
let shotFocus = null;

function setupShot() {
  if (SHOT === "start") {
    shotFocus = { x: VH_PLACES.market.x + 130, y: VH_PLACES.market.y + 90 };
  } else if (SHOT === "play") {
    G.mode = "play";
    G.cash = 650;
    G.wanted = 2;
    G.missionIdx = 0;
    G.stageIdx = 1;                 /* package aboard — deliver to the docks */
    G.timeLeft = null;
    const hero = cars.find((c) => c.kind === "hero");
    hero.x = 1150; hero.y = 25 * VH_TILE + 50; hero.angle = 0; hero.speed = 168;
    player.car = hero;
    player.x = hero.x; player.y = hero.y; player.angle = 0;
    const traffic = cars.filter((c) => c.kind === "traffic");
    if (traffic[0]) { traffic[0].x = 1335; traffic[0].y = 25 * VH_TILE + 50; traffic[0].angle = 0; }
    if (traffic[1]) { traffic[1].x = 1570; traffic[1].y = 25 * VH_TILE + 14; traffic[1].angle = Math.PI; }
    cars.push(makeCar(1006, 25 * VH_TILE + 57, 0, "#dfe3ee", "police"));
    G.time = 0.45;                  /* a fixed, flattering light-bar phase */
    ovStart.classList.add("hidden");
  } else if (SHOT === "end") {
    G.mode = "done";
    G.cash = 2450;
    G.jobsDone = 3;
    G.time = 372;
    G.freeRoam = true;
    shotFocus = { x: VH_PLACES.docks.x, y: VH_PLACES.docks.y - 60 };
    const hero = cars.find((c) => c.kind === "hero");
    hero.x = VH_PLACES.docks.x - 140;
    hero.y = VH_DOCK_ROW * VH_TILE + 28;
    hero.angle = 0.5;
    elDoneTitle.textContent = "ALL JOBS DONE";
    elDoneStats.textContent = "Three jobs, three payouts. Cash banked: $2,450 · Jobs 3/3 · Time 06:12 · Never busted";
    btnNext.textContent = "Keep cruising";
    ovStart.classList.add("hidden");
    ovDone.classList.remove("hidden");
  }
}

buildWorld();
if (SHOT) setupShot();

let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000;
  let dt = lastTs ? Math.min(0.033, now - lastTs) : 0;
  lastTs = now;
  if (SHOT) dt = 0;
  if (G.mode === "play" && dt > 0) update(dt);
  render();
}
requestAnimationFrame(frame);
