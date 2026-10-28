// Bootstrap, game loop and the Build / Run / Won phase state machine.
import level1 from "./levels/level1.js";
import level2 from "./levels/level2.js";
import level3 from "./levels/level3.js";
import { typeDef } from "./items.js";
import { createSim, stepSim, levelFixedItems } from "./physics.js";
import {
  VIEW,
  makeCamera,
  fitCamera,
  fitZoom,
  clampCamera,
  drawWorld,
  drawItemOutline,
} from "./render.js";
import { initInput, staticObstacles } from "./input.js";
import { initUI } from "./ui.js";

const STORAGE_KEY = "balltrack.progress.v1";
const MINIMAP_W = 260;

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress(p) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable: progress lasts for this session only
  }
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const G = {
  screen: "select",
  canvas,
  cam: makeCamera(),
  levels: [level1, level2, level3],
  levelIndex: 0,
  level: null,
  fixed: [],
  obstacles: [],
  items: [],
  inventory: {},
  phase: "build",
  sim: null,
  selected: null,
  drag: null,
  followBall: false,
  buildCam: null, // camera to restore on Reset after following the ball
  light: 0,
  keys: new Set(),
  flash: null,
  nextId: 1,
  progress: loadProgress(),
  saved: {}, // per-level placements kept while switching levels
  winTimer: null,
  minimap: null,
};

G.levelIsLarge = () => fitZoom(G.level) < 0.999;

G.createItem = (type) => ({
  id: `i${G.nextId++}`,
  type,
  x: 0,
  y: 0,
  angle: 0,
  flip: 1,
  category: typeDef(type).category,
});

G.changed = () => {
  G.ui.renderInventory();
  G.minimap = null;
};

G.returnToInventory = (item) => {
  const i = G.items.indexOf(item);
  if (i >= 0) G.items.splice(i, 1);
  G.inventory[item.type] = (G.inventory[item.type] || 0) + 1;
  if (G.selected === item) G.selected = null;
};

G.flashInvalid = (item) => {
  G.flash = { item, until: performance.now() + 350 };
};

function initialItems(level) {
  return level.moveable.map((m) => ({ ...G.createItem(m.type), ...m, angle: m.angle || 0, flip: m.flip || 1 }));
}

G.loadLevel = (index) => {
  if (G.level) G.saved[G.level.id] = { items: G.items, inventory: G.inventory };
  stopRun();
  G.levelIndex = index;
  G.level = G.levels[index];
  G.fixed = levelFixedItems(G.level);
  G.obstacles = staticObstacles(G.level, G.fixed);
  const saved = G.saved[G.level.id];
  if (saved) {
    G.items = saved.items;
    G.inventory = saved.inventory;
  } else {
    G.items = initialItems(G.level);
    G.inventory = { ...G.level.inventory };
  }
  if (new URLSearchParams(location.search).has("solution") && G.level.solution) applySolution();
  G.selected = null;
  G.drag = null;
  G.screen = "game";
  G.ui.hideLevelSelect();
  fitCamera(G.cam, G.level);
  G.changed();
  G.ui.syncButtons();
};

// Dev aid (?solution in the URL): load the level's verified solution.
function applySolution() {
  G.items = initialItems(G.level);
  G.inventory = { ...G.level.inventory };
  const sol = G.level.solution;
  for (const m of sol.moveable || []) {
    const it = G.items.find((i) => i.type === m.type);
    Object.assign(it, { ...m, angle: ((m.deg || 0) * Math.PI) / 180 });
  }
  for (const p of sol.items || []) {
    G.items.push({ ...G.createItem(p.type), x: p.x, y: p.y, angle: ((p.deg || 0) * Math.PI) / 180, flip: p.flip || 1 });
    G.inventory[p.type]--;
  }
}

G.showLevelSelect = () => {
  if (G.level) G.saved[G.level.id] = { items: G.items, inventory: G.inventory };
  stopRun();
  G.screen = "select";
  G.ui.showLevelSelect(G.levels, G.progress);
};

G.nextLevel = () => {
  if (G.levelIndex >= G.levels.length - 1) G.showLevelSelect();
  else G.loadLevel(G.levelIndex + 1);
};

G.fitView = () => {
  fitCamera(G.cam, G.level);
  G.followBall = false;
  G.ui.syncButtons();
};

function stopRun() {
  G.sim = null;
  G.phase = "build";
  G.light = 0;
  clearTimeout(G.winTimer);
  G.ui.showWin(false);
  G.ui.showHint(false);
}

G.go = () => {
  if (G.phase !== "build") return;
  G.drag = null;
  G.selected = null;
  G.ui.hideTooltip();
  G.sim = createSim(G.level, [...G.fixed, ...G.items]);
  G.buildCam = { ...G.cam };
  G.phase = "run";
  G.acc = 0;
  G.ui.syncButtons();
};

// Back to Build: placements were never touched by the simulation.
G.reset = () => {
  if (G.buildCam && G.camFollowed) Object.assign(G.cam, G.buildCam);
  G.camFollowed = false;
  stopRun();
  G.ui.syncButtons();
  G.ui.renderInventory();
};

G.toggleRun = () => {
  if (G.screen !== "game") return;
  if (G.phase === "build") G.go();
  else G.reset();
};

G.restart = () => {
  stopRun();
  G.items = initialItems(G.level);
  G.inventory = { ...G.level.inventory };
  G.selected = null;
  G.changed();
  G.ui.syncButtons();
};

function onWin() {
  G.phase = "won";
  G.progress[G.level.id] = true;
  saveProgress(G.progress);
  G.ui.showHint(false);
  G.winTimer = setTimeout(() => G.ui.showWin(true), 1100);
  G.ui.syncButtons();
}

// ---- layout ---------------------------------------------------------------

function resize() {
  const stage = document.getElementById("stage");
  const r = stage.getBoundingClientRect();
  const w = Math.max(100, Math.min(r.width, (r.height * VIEW.w) / VIEW.h));
  const h = (w * VIEW.h) / VIEW.w;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  G.cam.scale = w / VIEW.w;
  G.dpr = dpr;
  G.minimap = null;
}

// ---- minimap (large levels) ------------------------------------------------

function minimapRect() {
  const lv = G.level;
  const w = MINIMAP_W;
  const h = (w * lv.size.h) / lv.size.w;
  const cw = canvas.width / G.dpr;
  return { x: cw - w - 12, y: 12, w, h, s: w / lv.size.w };
}

G.minimapHit = (sx, sy) => {
  if (G.cam.zoom <= fitZoom(G.level) + 1e-3) return null;
  const m = minimapRect();
  if (sx < m.x || sy < m.y || sx > m.x + m.w || sy > m.y + m.h) return null;
  return { x: (sx - m.x) / m.s, y: (sy - m.y) / m.s };
};

G.centerOn = (wx, wy) => {
  G.cam.x = wx - VIEW.w / G.cam.zoom / 2;
  G.cam.y = wy - VIEW.h / G.cam.zoom / 2;
  clampCamera(G.cam, G.level);
};

function drawMinimap() {
  const m = minimapRect();
  const dpr = G.dpr;
  if (!G.minimap) {
    const off = document.createElement("canvas");
    off.width = Math.round(m.w * dpr);
    off.height = Math.round(m.h * dpr);
    const c = off.getContext("2d");
    c.scale(m.s * dpr, m.s * dpr);
    drawWorld(c, { level: G.level, fixed: G.fixed, items: G.items, light: 1, spawnMarker: false });
    G.minimap = off;
  }
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
  ctx.drawImage(G.minimap, m.x, m.y, m.w, m.h);
  ctx.globalAlpha = 1;
  const vw = VIEW.w / G.cam.zoom;
  const vh = VIEW.h / G.cam.zoom;
  ctx.strokeStyle = "#ffe27a";
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x + G.cam.x * m.s, m.y + G.cam.y * m.s, vw * m.s, vh * m.s);
  const b = G.sim ? G.sim.ball.position : G.level.spawn;
  ctx.fillStyle = "#ff5a3c";
  ctx.beginPath();
  ctx.arc(m.x + b.x * m.s, m.y + b.y * m.s, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe27a";
  ctx.fillRect(m.x + G.level.switch.x * m.s - 3, m.y + G.level.switch.y * m.s - 4, 6, 8);
  ctx.restore();
}

// ---- main loop ------------------------------------------------------------

let lastT = performance.now();

function update(dt) {
  if (G.screen !== "game") return;
  // keyboard panning
  const k = G.keys;
  const sp = (900 / G.cam.zoom) * dt;
  let dx = 0;
  let dy = 0;
  if (k.has("arrowleft") || k.has("a")) dx -= sp;
  if (k.has("arrowright") || k.has("d")) dx += sp;
  if (k.has("arrowup") || k.has("w")) dy -= sp;
  if (k.has("arrowdown") || k.has("s")) dy += sp;
  if (dx || dy) {
    G.cam.x += dx;
    G.cam.y += dy;
    clampCamera(G.cam, G.level);
    if (G.phase !== "build") G.followBall = false;
    G.ui.syncButtons();
  }

  if (G.sim) {
    G.acc += Math.min(dt, 0.1);
    while (G.acc >= 1 / 60) {
      stepSim(G.sim);
      G.acc -= 1 / 60;
      if (G.sim.won && G.phase === "run") onWin();
    }
    if (G.phase === "run") G.ui.showHint(G.sim.stopped);
    if (G.followBall && G.levelIsLarge()) {
      // following is pointless when the whole level is on screen
      G.cam.zoom = Math.max(G.cam.zoom, Math.min(1, G.cam.zoom + dt * 1.5));
      G.camFollowed = true;
      const b = G.sim.ball.position;
      const tx = b.x - VIEW.w / G.cam.zoom / 2;
      const ty = b.y - VIEW.h / G.cam.zoom / 2;
      const f = 1 - Math.pow(0.002, dt);
      G.cam.x += (tx - G.cam.x) * f;
      G.cam.y += (ty - G.cam.y) * f;
      clampCamera(G.cam, G.level);
    }
  }
  if (G.phase === "won") G.light = Math.min(1, G.light + dt / 1.2);
}

function render() {
  const dpr = G.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#14110f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (G.screen !== "game") return;
  const k = G.cam.scale * G.cam.zoom * dpr;
  ctx.setTransform(k, 0, 0, k, -G.cam.x * k, -G.cam.y * k);
  drawWorld(ctx, {
    level: G.level,
    fixed: G.fixed,
    items: G.items,
    sim: G.sim,
    light: G.light,
    trail: true,
  });

  if (G.phase === "build") {
    const d = G.drag;
    if (G.selected && !G.selected.hidden && !(d && !d.valid && d.item === G.selected)) {
      ctx.setLineDash([6, 4]);
      drawItemOutline(ctx, G.selected, "rgba(140,210,255,0.95)");
      ctx.setLineDash([]);
    }
    if (d && d.snap && d.valid) {
      ctx.strokeStyle = "#7dffb0";
      ctx.lineWidth = 3 / (G.cam.zoom * G.cam.scale);
      ctx.beginPath();
      ctx.arc(d.snap.x, d.snap.y, 7 / (G.cam.zoom * G.cam.scale), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (d && !d.item.hidden && !d.valid && (d.moved || d.isNew)) {
      drawItemOutline(ctx, d.item, "#ff3b3b", "rgba(255,40,40,0.45)");
    }
    if (G.flash && performance.now() < G.flash.until) {
      drawItemOutline(ctx, G.flash.item, "#ff3b3b", "rgba(255,40,40,0.35)");
    }
  }
  // the minimap only helps when part of the level is off screen
  if (G.cam.zoom > fitZoom(G.level) + 1e-3) drawMinimap();
}

function frame(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

G.ui = initUI(G);
initInput(G);
window.addEventListener("resize", resize);
resize();
G.showLevelSelect();
requestAnimationFrame(frame);
window.__balltrack = G;
