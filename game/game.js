// VICE HARBOR — engine. Plain canvas 2D, no assets, no modules.
// Reads the world from city.js (BUILDINGS, PALMS, PARKED_SPOTS, MISSIONS...).
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const el = (id) => document.getElementById(id);
const hudCash = el("hud-cash"), hudStars = el("hud-stars"), hudJob = el("hud-job"), hudSpeed = el("hud-speed");
const pill = el("pill");
const screenStart = el("screen-start"), screenBusted = el("screen-busted"), screenDone = el("screen-done");

// Screenshot modes: ?shot=start|play|end draws exactly one composed frame
// and never starts the update loop.
const SHOT = new URLSearchParams(location.search).get("shot");

// ---------- small helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// Right-hand lane offset for a heading: traffic drives on the right.
function lanePoint(x, y, angle, lane) {
  const rx = Math.cos(angle + Math.PI / 2), ry = Math.sin(angle + Math.PI / 2);
  return { x: x + rx * lane, y: y + ry * lane };
}
const LANE = 15;

// ---------- input ----------
const keys = {};
let enterPressed = false;
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  if (e.key === "Enter") enterPressed = true;
  keys[e.key.toLowerCase()] = true;
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
function keyDown(...names) { return names.some((n) => keys[n]); }

// ---------- game state ----------
let mode = "menu"; // menu | play | busted | done
let player, traffic, police, peds;
let cash, jobsDone, wanted, bustMeter, clock;
let missionIdx, stageIdx, stageTimeLeft, heatCooldown, lastIncidentAt, gameTime;

function resetWorld() {
  cash = 0; jobsDone = 0; wanted = 0; bustMeter = 0; clock = 0;
  missionIdx = 0; stageIdx = 0; stageTimeLeft = 0; heatCooldown = 0;
  lastIncidentAt = -99; gameTime = 0;

  const market = place("Harbor Market");
  player = {
    x: market.x + 40, y: market.y + 30, angle: -Math.PI / 2,
    r: 11, speed: 0, car: null, walkPhase: 0
  };

  traffic = [];
  for (let i = 0; i < 14; i++) traffic.push(spawnTrafficCar(i));
  // The player's starter coupe, parked by the market.
  traffic.push(makeCar(market.x - 60, market.y + 46, 0, "#ff2e88"));

  police = [];
  peds = [];
  for (let i = 0; i < 10; i++) peds.push(spawnPed(i));
  updateHUD();
}

// ---------- entities ----------
function makeCar(x, y, angle, color) {
  return { x, y, angle, speed: 0, color, w: 44, h: 22, parked: false, cruise: 120 + vhRand() * 60, turnCd: 0 };
}
function spawnTrafficCar() {
  // Pick a random road tile and a heading along its road.
  for (let tries = 0; tries < 40; tries++) {
    const tx = Math.floor(vhRand() * COLS), ty = Math.floor(vhRand() * ROWS);
    const k = tileKind(tx, ty);
    if (k !== "road" && k !== "dock") continue;
    const horizontal = isStreet(ty) || ty === DOCK_ROW;
    const angle = horizontal ? (vhRand() < 0.5 ? 0 : Math.PI) : (vhRand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const c = lanePoint((tx + 0.5) * TILE, (ty + 0.5) * TILE, angle, LANE);
    const car = makeCar(c.x, c.y, angle, vhPick(CAR_COLORS));
    car.speed = car.cruise * 0.7;
    return car;
  }
  return makeCar(WORLD_W / 2, WORLD_H / 2, 0, "#888888");
}
function spawnPed() {
  for (let tries = 0; tries < 40; tries++) {
    const tx = Math.floor(vhRand() * COLS), ty = Math.floor(vhRand() * ROWS);
    if (tileKind(tx, ty) !== "block") continue;
    const x = (tx + 0.5) * TILE + vhRange(-18, 18), y = (ty + 0.5) * TILE + vhRange(-18, 18);
    if (buildingAt(x, y)) continue;
    return { x, y, angle: vhRange(0, Math.PI * 2), speed: 0, phase: vhRange(0, 6), wanderCd: vhRange(1, 4) };
  }
  return { x: 200, y: 200, angle: 0, speed: 0, phase: 0, wanderCd: 2 };
}
function spawnCop() {
  // Cruisers roll in from a road at the edge of the camera view.
  const cam = cameraPos();
  const side = Math.floor(vhRand() * 4);
  let x = cam.x + VIEW_W / 2, y = cam.y + VIEW_H / 2;
  if (side === 0) { x = cam.x - 60; y = player.y; }
  if (side === 1) { x = cam.x + VIEW_W + 60; y = player.y; }
  if (side === 2) { y = cam.y - 60; x = player.x; }
  if (side === 3) { y = cam.y + VIEW_H + 60; x = player.x; }
  x = clamp(x, 40, WORLD_W - 40); y = clamp(y, 40, WORLD_H - 40);
  const cop = makeCar(x, y, Math.atan2(player.y - y, player.x - x), "#dfe9ff");
  cop.cop = true; cop.cruise = 235;
  return cop;
}

// ---------- movement & collision ----------
function carCorners(c) {
  const ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  const pts = [];
  for (const [lx, ly] of [[c.w / 2, c.h / 2], [c.w / 2, -c.h / 2], [-c.w / 2, c.h / 2], [-c.w / 2, -c.h / 2]]) {
    pts.push({ x: c.x + lx * ca - ly * sa, y: c.y + lx * sa + ly * ca });
  }
  return pts;
}
function carBlocked(c) {
  for (const p of carCorners(c)) {
    if (p.x < 6 || p.y < 6 || p.x > WORLD_W - 6 || p.y > WORLD_H - 6) return true;
    if (tileAtPx(p.x, p.y) === "water") return true;
    if (circleHitsBuilding(p.x, p.y, 3)) return true;
  }
  return false;
}
function tryMoveCar(c, nx, ny, na) {
  const ox = c.x, oy = c.y, oa = c.angle;
  c.x = nx; c.y = ny; c.angle = na;
  if (carBlocked(c)) { c.x = ox; c.y = oy; c.angle = oa; return false; }
  return true;
}
function moveOnFoot(e, dx, dy, dt, runSpeed) {
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return false;
  const vx = (dx / len) * runSpeed * dt, vy = (dy / len) * runSpeed * dt;
  const nx = e.x + vx, ny = e.y + vy;
  if (!circleHitsBuilding(nx, e.y, e.r) && tileAtPx(nx, e.y) !== "water") e.x = nx;
  if (!circleHitsBuilding(e.x, ny, e.r) && tileAtPx(e.x, ny) !== "water") e.y = ny;
  e.x = clamp(e.x, 12, WORLD_W - 12); e.y = clamp(e.y, 12, WORLD_H - 12);
  e.angle = Math.atan2(dy, dx);
  return true;
}

// ---------- wanted / incidents ----------
function addHeat(stars, why) {
  if (gameTime - lastIncidentAt < 1.2) return; // incident cooldown
  lastIncidentAt = gameTime;
  const before = wanted;
  wanted = clamp(wanted + stars, 0, 5);
  if (wanted > before && why) showPill(why);
}
function anyCopSeesPlayer() {
  for (const cop of police) {
    if (dist(cop, player) < 430) return true;
  }
  return false;
}

// ---------- player ----------
let eLatch = false;
function updatePlayer(dt) {
  // Enter / exit cars with E (latched so one press = one action).
  const eDown = !!keys["e"];
  if (eDown && !eLatch) {
    if (player.car) {
      const c = player.car;
      player.car = null; c.parked = true; c.speed = 0;
      player.x = c.x + Math.cos(c.angle + Math.PI / 2) * 30;
      player.y = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
      if (circleHitsBuilding(player.x, player.y, player.r)) { player.x = c.x; player.y = c.y - 30; }
      showPill("On foot");
    } else {
      let best = null, bestD = 52;
      for (const c of traffic.concat(police)) {
        const d = dist(c, player);
        if (d < bestD) { best = c; bestD = d; }
      }
      if (best) {
        if (best.cop) { showPill("Stealing a cruiser? Bold. Locked."); }
        else {
          player.car = best; best.parked = false;
          if (traffic.indexOf(best) !== -1) { /* your own coupe counts too */ }
          addHeat(1, "Boosted a ride — heat rising");
          showPill("Wheels up. WASD to drive, E to ditch it");
        }
      } else showPill("No car in reach — stand next to one and press E");
    }
  }
  eLatch = eDown;

  if (player.car) {
    const c = player.car;
    const accel = 260, maxF = 305, maxR = -110;
    if (keyDown("w", "arrowup")) c.speed += accel * dt;
    else if (keyDown("s", "arrowdown")) c.speed -= (c.speed > 10 ? 340 : 150) * dt;
    else c.speed -= c.speed * 0.6 * dt; // engine drag
    if (keys[" "]) c.speed -= c.speed * 2.4 * dt; // handbrake
    c.speed = clamp(c.speed, maxR, maxF);
    if (Math.abs(c.speed) > 1) {
      const steer = (keyDown("a", "arrowleft") ? -1 : 0) + (keyDown("d", "arrowright") ? 1 : 0);
      const na = c.angle + steer * 1.9 * dt * (c.speed >= 0 ? 1 : -1) * clamp(Math.abs(c.speed) / 120, 0.25, 1);
      const nx = c.x + Math.cos(c.angle) * c.speed * dt;
      const ny = c.y + Math.sin(c.angle) * c.speed * dt;
      if (!tryMoveCar(c, nx, ny, na)) {
        if (Math.abs(c.speed) > 150) addHeat(1, "Hard hit — witnesses everywhere");
        c.speed *= -0.25;
      }
    }
    player.x = c.x; player.y = c.y; player.angle = c.angle;
    // Shoving traffic or clipping peds draws heat.
    for (const o of traffic) {
      if (o !== c && Math.abs(o.x - c.x) < 40 && Math.abs(o.y - c.y) < 40 && Math.abs(c.speed) > 90) {
        o.x += Math.cos(c.angle) * 14; o.y += Math.sin(c.angle) * 14;
        addHeat(1, "You rammed a civilian car");
      }
    }
  } else {
    const dx = (keyDown("d", "arrowright") ? 1 : 0) - (keyDown("a", "arrowleft") ? 1 : 0);
    const dy = (keyDown("s", "arrowdown") ? 1 : 0) - (keyDown("w", "arrowup") ? 1 : 0);
    if (moveOnFoot(player, dx, dy, dt, 150)) player.walkPhase += dt * 11;
  }
}

// ---------- traffic AI ----------
function updateTraffic(dt) {
  for (const c of traffic) {
    if (c === player.car || c.parked) continue;
    c.turnCd -= dt;
    // Slow for a car ahead.
    let target = c.cruise;
    const aheadX = c.x + Math.cos(c.angle) * 58, aheadY = c.y + Math.sin(c.angle) * 58;
    for (const o of traffic.concat(police)) {
      if (o !== c && Math.abs(o.x - aheadX) < 30 && Math.abs(o.y - aheadY) < 30) target = 0;
    }
    c.speed += clamp(target - c.speed, -300 * dt, 130 * dt);
    // At an intersection, sometimes pick a new heading.
    const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE);
    const atCrossing = (isAvenue(tx) && isStreet(ty)) || ty === DOCK_ROW;
    if (atCrossing && c.turnCd <= 0 && vhRand() < 0.35) {
      const opts = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter((a) => {
        const p = lanePoint((tx + 0.5) * TILE + Math.cos(a) * TILE, (ty + 0.5) * TILE + Math.sin(a) * TILE, a, LANE);
        return isDrivable(p.x, p.y);
      });
      if (opts.length) c.angle = vhPick(opts);
      c.turnCd = 2.5;
    }
    // Steer toward this car's lane point on the road it is on.
    const lp = lanePoint(c.x, c.y, c.angle, LANE);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!tryMoveCar(c, nx, ny, c.angle)) {
      // Blocked: nudge into the lane and slow down.
      tryMoveCar(c, lp.x, lp.y, c.angle);
      c.speed = Math.min(c.speed, 30);
    }
  }
}

// ---------- police AI ----------
function updatePolice(dt) {
  const wantCount = wanted; // one cruiser per star, roughly
  while (police.length < wantCount) police.push(spawnCop());
  while (police.length > wantCount + 1) police.pop();
  for (const cop of police) {
    const toPlayer = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle = angleLerp(cop.angle, toPlayer, clamp(dt * 2.4, 0, 1));
    const d = dist(cop, player);
    const target = d > 70 ? cop.cruise : 60;
    cop.speed += clamp(target - cop.speed, -320 * dt, 200 * dt);
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    if (!tryMoveCar(cop, nx, ny, cop.angle)) cop.speed = Math.min(cop.speed, 20);
  }
  // Bust meter: a cruiser in contact while you crawl is bad news.
  const mySpeed = player.car ? Math.abs(player.car.speed) : 0;
  let pinned = false;
  for (const cop of police) if (dist(cop, player) < 58) pinned = true;
  if (pinned && mySpeed < 45) bustMeter += dt / 2.6;
  else bustMeter = Math.max(0, bustMeter - dt / 3.5);
  if (bustMeter >= 1) return endNight(false);
  // Heat decays while no cruiser has eyes on you.
  if (wanted > 0) {
    if (!anyCopSeesPlayer()) {
      heatCooldown += dt;
      if (heatCooldown > 9) { wanted -= 1; heatCooldown = 0; showPill("Heat fading — " + wanted + " star(s) left"); }
    } else heatCooldown = 0;
  }
}

// ---------- pedestrians ----------
function updatePeds(dt) {
  for (const p of peds) {
    p.wanderCd -= dt;
    const d = dist(p, player);
    const carThreat = player.car && Math.abs(player.car.speed) > 40;
    if (d < 90 && (carThreat || d < 42)) {
      // Flee directly away from the player.
      const away = Math.atan2(p.y - player.y, p.x - player.x);
      moveOnFoot(p, Math.cos(away), Math.sin(away), dt, 165);
      if (d < 26 && carThreat) addHeat(1, "You clipped a pedestrian!");
    } else {
      if (p.wanderCd <= 0) { p.angle = vhRange(0, Math.PI * 2); p.wanderCd = vhRange(1.5, 4); }
      moveOnFoot(p, Math.cos(p.angle), Math.sin(p.angle), dt, 42);
    }
    p.phase += dt * 8;
  }
}

// ---------- missions ----------
function curMission() { return MISSIONS[missionIdx] || null; }
function curStage() { const m = curMission(); return m ? m.stages[stageIdx] : null; }
function stageTarget() { const s = curStage(); return s ? place(s.at) : null; }

function startMission(i) {
  missionIdx = i; stageIdx = 0;
  const m = curMission();
  if (!m) return;
  if (m.startStars) wanted = Math.max(wanted, m.startStars);
  stageTimeLeft = m.timeLimit || 0;
  showPill("New job: " + m.title + " — $" + m.reward);
  updateHUD();
}
function completeStage() {
  const m = curMission();
  stageIdx += 1;
  if (stageIdx < m.stages.length) {
    showPill("Got it. Next: " + m.stages[stageIdx].label);
  } else {
    cash += m.reward; jobsDone += 1;
    showPill(m.title + " complete — $" + m.reward + " banked");
    if (jobsDone >= MISSIONS.length) return endNight(true);
    startMission(missionIdx + 1);
  }
  updateHUD();
}
function updateMissions(dt) {
  const m = curMission(), s = curStage();
  if (!m || !s) return;
  if (m.timeLimit) {
    stageTimeLeft -= dt;
    if (stageTimeLeft <= 0) {
      showPill("Out of time — the crates go back on the shelf. Job restarted.");
      startMission(missionIdx);
      return;
    }
  }
  const t = stageTarget();
  if (!t) return;
  const near = dist(player, t) < 58;
  if (!near) return;
  if (s.kind === "cooldown" && wanted > 0) {
    showPill("Too hot — lose the heat first (" + wanted + " star(s))");
    return;
  }
  if (s.pickup) addHeat(1, "Package in hand — the harbor watches");
  completeStage();
}

// ---------- HUD & pill ----------
let pillTimer = 0;
function showPill(text) { pill.textContent = text; pill.classList.remove("hidden"); pillTimer = 3.4; }
function fmtTime(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ":" + String(ss).padStart(2, "0"); }
function updateHUD() {
  hudCash.textContent = "$" + cash.toLocaleString("en-US");
  hudStars.textContent = "★★★★★".slice(0, wanted) + "☆☆☆☆☆".slice(0, 5 - wanted);
  const s = curStage();
  if (mode === "done") hudJob.textContent = "All jobs done — Vice Harbor is yours";
  else if (s) hudJob.textContent = curMission().title + ": " + s.label + (curMission().timeLimit ? " (" + fmtTime(Math.max(0, stageTimeLeft)) + ")" : "");
  else hudJob.textContent = "Free roam — the night is yours";
  hudSpeed.textContent = player && player.car ? Math.round(Math.abs(player.car.speed) * 0.32) + " mph" : "—";
}

// ---------- night flow ----------
function startNight() {
  resetWorld();
  mode = "play";
  screenStart.classList.add("hidden");
  screenBusted.classList.add("hidden");
  screenDone.classList.add("hidden");
  startMission(0);
  showPill("Job one: Harbor Run. Follow the golden beacon.");
}
function endNight(won) {
  if (won) {
    mode = "done";
    el("done-cash").textContent = "$" + cash.toLocaleString("en-US");
    el("done-jobs").textContent = jobsDone + " / " + MISSIONS.length;
    el("done-time").textContent = fmtTime(clock);
    screenDone.classList.remove("hidden");
  } else {
    mode = "busted";
    el("busted-cash").textContent = "$" + cash.toLocaleString("en-US");
    el("busted-jobs").textContent = jobsDone + " / " + MISSIONS.length;
    screenBusted.classList.remove("hidden");
  }
  updateHUD();
}
el("btn-start").addEventListener("click", startNight);
el("btn-retry").addEventListener("click", startNight);
el("btn-again").addEventListener("click", startNight);

// ---------- main loop ----------
let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (mode === "play") {
    gameTime += dt; clock += dt;
    if (enterPressed) enterPressed = false;
    updatePlayer(dt);
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    if (mode === "play") updateMissions(dt);
    if (pillTimer > 0) { pillTimer -= dt; if (pillTimer <= 0) pill.classList.add("hidden"); }
    updateHUD();
  } else if ((mode === "menu" || mode === "busted" || mode === "done") && enterPressed) {
    enterPressed = false;
    startNight();
  } else if (mode === "menu") {
    updateTraffic(dt); // the city idles behind the start card
    updatePeds(dt);
  }
  draw();
  requestAnimationFrame(frame);
}

// ---------- drawing ----------
function cameraPos() {
  return {
    x: clamp(player.x - VIEW_W / 2, 0, Math.max(0, WORLD_W - VIEW_W)),
    y: clamp(player.y - VIEW_H / 2, 0, Math.max(0, WORLD_H - VIEW_H))
  };
}

function drawTiles(cam) {
  const tx0 = Math.max(0, Math.floor(cam.x / TILE)), ty0 = Math.max(0, Math.floor(cam.y / TILE));
  const tx1 = Math.min(COLS - 1, tx0 + Math.ceil(VIEW_W / TILE) + 1);
  const ty1 = Math.min(ROWS - 1, ty0 + Math.ceil(VIEW_H / TILE) + 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const x = tx * TILE - cam.x, y = ty * TILE - cam.y, k = tileKind(tx, ty);
      if (k === "water") {
        ctx.fillStyle = (tx + ty) % 2 ? "#0b2a4a" : "#0d3054";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(46,230,255,0.16)";
        ctx.fillRect(x + ((tx * 37 + ty * 13) % 40), y + 30, 16, 2);
      } else if (k === "dock") {
        ctx.fillStyle = (tx % 2) ? "#6b4a2b" : "#755231";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(x, y, TILE, 3); ctx.fillRect(x, y + 32, TILE, 3);
      } else if (k === "road") {
        ctx.fillStyle = "#23202e";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(255,201,60,0.5)";
        if (isStreet(ty)) ctx.fillRect(x + 8, y + TILE / 2 - 1, 12, 2);
        if (isAvenue(tx)) ctx.fillRect(x + TILE / 2 - 1, y + 8, 2, 12);
        if (ty === STREETS[STREETS.length - 1]) { /* boardwalk edge */ ctx.fillStyle = "rgba(46,230,255,0.25)"; ctx.fillRect(x, y + TILE - 5, TILE, 3); }
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? "#1d1430" : "#201736";
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }
}

function drawBuildings(cam) {
  for (const b of BUILDINGS) {
    const x = b.x - cam.x, y = b.y - cam.y;
    if (x + b.w < 0 || y + b.h < 0 || x > VIEW_W || y > VIEW_H) continue;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 6, y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.strokeStyle = b.trim;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
    // Lit windows, laid out from the building's own seed.
    const rnd = vhMulberry32(b.seed);
    ctx.fillStyle = "rgba(255,214,120,0.85)";
    const cols = Math.max(2, Math.floor(b.w / 18)), rowsW = Math.max(2, Math.floor(b.h / 18));
    for (let r = 0; r < rowsW; r++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.45) ctx.fillRect(x + 7 + c * 18, y + 7 + r * 18, 7, 9);
      }
    }
    ctx.lineWidth = 1;
  }
}

function drawPalms(cam, t) {
  for (const p of PALMS) {
    const x = p.x - cam.x, y = p.y - cam.y;
    if (x < -30 || y < -30 || x > VIEW_W + 30 || y > VIEW_H + 30) continue;
    ctx.strokeStyle = "#5a4028";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2, y - 9); ctx.stroke();
    ctx.strokeStyle = "#2fae5f";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.sin(t * 0.001 + p.sway) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 9);
      ctx.lineTo(x + 2 + Math.cos(a) * 11, y - 9 + Math.sin(a) * 5 - 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
}

function drawCar(c, cam, t) {
  const x = c.x - cam.x, y = c.y - cam.y;
  if (x < -70 || y < -70 || x > VIEW_W + 70 || y > VIEW_H + 70) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(c.angle);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 5, c.w, c.h);
  ctx.fillStyle = c.cop ? "#e8efff" : c.color;
  ctx.beginPath();
  ctx.roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 6);
  ctx.fill();
  ctx.fillStyle = c.cop ? "#12244d" : "rgba(10,10,30,0.55)";
  ctx.fillRect(-6, -c.h / 2 + 3, 15, c.h - 6); // windshield + cabin
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(10, -c.h / 2 + 3, 5, c.h - 6); // rear window
  if (c.cop) {
    ctx.fillStyle = "#12244d";
    ctx.fillRect(-c.w / 2, -4, c.w, 8);
    const flash = Math.floor(t / 280) % 2 === 0;
    ctx.fillStyle = flash ? "#ff4444" : "#ff9a9a";
    ctx.fillRect(-3, -c.h / 2 + 1, 7, 5);
    ctx.fillStyle = flash ? "#7ab5ff" : "#2e6bff";
    ctx.fillRect(-3, c.h / 2 - 6, 7, 5);
  }
  // Headlights at dusk.
  ctx.fillStyle = "rgba(255,240,180,0.9)";
  ctx.fillRect(c.w / 2 - 2, -c.h / 2 + 2, 3, 4);
  ctx.fillRect(c.w / 2 - 2, c.h / 2 - 6, 3, 4);
  ctx.restore();
}

function drawPlayerFigure(cam, t) {
  if (player.car) return;
  const x = player.x - cam.x, y = player.y - cam.y;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath(); ctx.ellipse(x, y + 4, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  const bob = Math.sin(player.walkPhase) * 1.6;
  ctx.fillStyle = "#ff2e88";
  ctx.beginPath(); ctx.arc(x, y + bob * 0.3, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffc93c";
  ctx.beginPath(); ctx.arc(x, y - 4 + bob * 0.3, 4.6, 0, Math.PI * 2); ctx.fill();
}

function drawPeds(cam) {
  for (const p of peds) {
    const x = p.x - cam.x, y = p.y - cam.y;
    if (x < -20 || y < -20 || x > VIEW_W + 20 || y > VIEW_H + 20) continue;
    const bob = Math.sin(p.phase) * 1.2;
    ctx.fillStyle = "#2ee6ff";
    ctx.beginPath(); ctx.arc(x, y + bob * 0.3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f6ecff";
    ctx.beginPath(); ctx.arc(x, y - 3 + bob * 0.3, 3.6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBeacon(cam, t) {
  const target = stageTarget();
  if (!target || mode !== "play") return;
  const x = target.x - cam.x, y = target.y - cam.y;
  const pulse = 1 + Math.sin(t / 300) * 0.15;
  if (x >= -40 && x <= VIEW_W + 40 && y >= -40 && y <= VIEW_H + 40) {
    ctx.strokeStyle = "#ffc93c";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(255,201,60,0.85)";
    ctx.beginPath();
    ctx.moveTo(x, y - 44 - Math.sin(t / 300) * 4);
    ctx.lineTo(x - 10, y - 62 - Math.sin(t / 300) * 4);
    ctx.lineTo(x + 10, y - 62 - Math.sin(t / 300) * 4);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1;
  } else {
    // Off-screen edge arrow with distance.
    const cx = clamp(x, 44, VIEW_W - 44), cy = clamp(y, 44, VIEW_H - 44);
    const a = Math.atan2(y - cy, x - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = "#ffc93c";
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#ffc93c";
    ctx.font = "bold 13px Verdana, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(Math.round(dist(player, target) / 10) + "m", cx, cy + 26);
  }
}

function drawPlaceLabels(cam) {
  ctx.font = "600 12px Verdana, sans-serif";
  ctx.textAlign = "center";
  for (const name of Object.keys(PLACES)) {
    const p = PLACES[name];
    const x = p.x - cam.x, y = p.y - cam.y;
    if (x < -60 || y < -20 || x > VIEW_W + 60 || y > VIEW_H + 20) continue;
    ctx.fillStyle = "rgba(246,236,255,0.55)";
    ctx.fillText(name, x, y - 34);
  }
}

function drawMinimap() {
  const mw = 204, mh = 153, mx = VIEW_W - mw - 14, my = 14;
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.fillStyle = "rgba(10,5,22,0.78)";
  ctx.fillRect(mx, my, mw, mh);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const k = tileKind(tx, ty);
      ctx.fillStyle = k === "water" ? "#0d3054" : k === "road" ? "#4a4360" : k === "dock" ? "#755231" : "#241640";
      ctx.fillRect(mx + tx * TILE * sx, my + ty * TILE * sy, TILE * sx + 0.5, TILE * sy + 0.5);
    }
  }
  const t = stageTarget();
  if (t && mode === "play") {
    ctx.fillStyle = "#ffc93c";
    ctx.beginPath(); ctx.arc(mx + t.x * sx, my + t.y * sy, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  for (const cop of police) ctx.fillRect(mx + cop.x * sx - 2, my + cop.y * sy - 2, 4, 4);
  ctx.fillStyle = "#ff2e88";
  ctx.beginPath(); ctx.arc(mx + player.x * sx, my + player.y * sy, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(46,230,255,0.6)";
  ctx.strokeRect(mx, my, mw, mh);
}

function drawBustMeter() {
  if (bustMeter <= 0.02 || mode !== "play") return;
  const w = 260, x = VIEW_W / 2 - w / 2, y = 16;
  ctx.fillStyle = "rgba(10,5,22,0.8)";
  ctx.fillRect(x - 8, y - 8, w + 16, 34);
  ctx.fillStyle = "#571414";
  ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = bustMeter > 0.7 ? "#ff4444" : "#ff9a3c";
  ctx.fillRect(x, y, w * clamp(bustMeter, 0, 1), 10);
  ctx.fillStyle = "#ffd7d7";
  ctx.font = "bold 11px Verdana, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GET MOVING — THEY'RE PINNING YOU", VIEW_W / 2, y + 24);
}

function draw() {
  const t = performance.now();
  const cam = cameraPos();
  ctx.fillStyle = "#08131f";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTiles(cam);
  drawPalms(cam, t);
  drawBuildings(cam);
  drawPlaceLabels(cam);
  for (const c of traffic) drawCar(c, cam, t);
  for (const cop of police) drawCar(cop, cam, t);
  drawPeds(cam);
  drawPlayerFigure(cam, t);
  drawBeacon(cam, t);
  drawMinimap();
  drawBustMeter();
}

// ---------- screenshot scenes (one frozen frame, no update loop; play and end hide the start card) ----------
function setupShot(kindShot) {
  resetWorld();
  traffic = [];
  police = [];
  peds = [spawnPed(), spawnPed(), spawnPed()];
  mode = "play";

  if (kindShot === "start") {
    const market = place("Harbor Market");
    player.x = market.x; player.y = market.y + 60; player.car = null;
    traffic.push(makeCar(market.x - 120, market.y + 16, 0, "#2ee6ff"));
    traffic.push(makeCar(market.x + 200, market.y + 16, Math.PI, "#ffc93c"));
    missionIdx = 0; stageIdx = 0;
    screenStart.classList.remove("hidden");
  }

  if (kindShot === "play") {
    screenStart.classList.add("hidden");
    // Dock-road chase: hero coupe eastbound on the boardwalk street,
    // traffic ahead and oncoming, a cruiser on its tail, docks beacon lit.
    const hero = makeCar(1230, 1617, 0, "#ff2e88");
    hero.speed = 190;
    traffic.push(hero);
    traffic.push(makeCar(1560, 1617, 0, "#2ee6ff"));
    traffic.push(makeCar(1660, 1647, Math.PI, "#ffc93c"));
    traffic.push(makeCar(880, 1647, Math.PI, "#7dff9a"));
    const cop = makeCar(1010, 1617, 0, "#dfe9ff");
    cop.cop = true;
    police.push(cop);
    player.car = hero;
    player.x = hero.x; player.y = hero.y; player.angle = 0;
    cash = 650; wanted = 2;
    missionIdx = 0; stageIdx = 1; // package aboard: "Deliver ... to the Neon Docks"
  }

  if (kindShot === "end") {
    screenStart.classList.add("hidden");
    const docks = place("Neon Docks");
    const hero = makeCar(docks.x - 90, 1617, 0, "#ff2e88");
    traffic.push(hero);
    traffic.push(makeCar(docks.x + 220, 1647, Math.PI, "#2ee6ff"));
    player.car = hero;
    player.x = hero.x; player.y = hero.y; player.angle = 0;
    cash = 2450; jobsDone = 3; wanted = 0;
    mode = "done";
    el("done-cash").textContent = "$2,450";
    el("done-jobs").textContent = "3 / 3";
    el("done-time").textContent = "6:12";
    screenDone.classList.remove("hidden");
  }
  updateHUD();
  draw();
}

// ---------- boot ----------
if (SHOT === "start" || SHOT === "play" || SHOT === "end") {
  setupShot(SHOT);
} else {
  resetWorld();
  mode = "menu";
  requestAnimationFrame(frame);
}
