// Canvas drawing of rooms, items, ball, switch, overlays and the minimap.
import { typeDef, BALL_RADIUS } from "./items.js";
import { itemParts } from "./physics.js";
import { bounds, boundsOverlap } from "./geometry.js";

// ---- camera ----------------------------------------------------------------

export const VIEW = { w: 1600, h: 900 };

export function makeCamera() {
  return { x: 0, y: 0, zoom: 1, scale: 1 };
}

// Smallest zoom at which the whole level is visible.
export function fitZoom(level) {
  return Math.min(VIEW.w / level.size.w, VIEW.h / level.size.h);
}

export function clampCamera(cam, level) {
  const vw = VIEW.w / cam.zoom;
  const vh = VIEW.h / cam.zoom;
  const { w, h } = level.size;
  cam.x = vw >= w ? (w - vw) / 2 : Math.max(0, Math.min(w - vw, cam.x));
  cam.y = vh >= h ? (h - vh) / 2 : Math.max(0, Math.min(h - vh, cam.y));
}

export function fitCamera(cam, level) {
  cam.zoom = fitZoom(level);
  clampCamera(cam, level);
}

// cam.scale = CSS pixels per logical view unit (letterbox scale).
export function screenToWorld(cam, sx, sy) {
  const k = cam.scale * cam.zoom;
  return { x: cam.x + sx / k, y: cam.y + sy / k };
}

export function worldToScreen(cam, wx, wy) {
  const k = cam.scale * cam.zoom;
  return { x: (wx - cam.x) * k, y: (wy - cam.y) * k };
}

// ---- primitives ----------------------------------------------------------------

function polyPath(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

export function drawItem(ctx, item, pose = item) {
  const def = typeDef(item.type);
  if (!def.draw) return;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle || 0);
  ctx.scale(pose.flip || 1, 1);
  def.draw(ctx, item);
  ctx.restore();
}

export function drawBall(ctx, x, y, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(3, 4, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, BALL_RADIUS);
  g.addColorStop(0, "#ff9a7a");
  g.addColorStop(1, "#e0262b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffe36e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_RADIUS - 4, -0.6, 0.9);
  ctx.stroke();
  ctx.restore();
}

function drawSwitch(ctx, level, on, glow) {
  const { x, y } = level.switch;
  ctx.save();
  ctx.translate(x, y);
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 70);
    g.addColorStop(0, `rgba(255,230,120,${0.55 * glow})`);
    g.addColorStop(1, "rgba(255,230,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-70, -70, 140, 140);
  }
  ctx.fillStyle = "#f4f1ea";
  ctx.strokeStyle = "#9a958a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-14, -23, 28, 46, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#d8d3c8";
  ctx.fillRect(-6, -13, 12, 26);
  ctx.fillStyle = on ? "#7ccf6a" : "#fbfaf6";
  ctx.strokeStyle = "#8f8a80";
  ctx.beginPath();
  if (on) ctx.roundRect(-5, -2, 10, 13, 2);
  else ctx.roundRect(-5, -11, 10, 13, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHand(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y - BALL_RADIUS - 6);
  ctx.fillStyle = "#f2c9a0";
  ctx.strokeStyle = "#a57552";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-16, -30, 32, 24, 8);
  ctx.fill();
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.roundRect(-15 + i * 8, -10, 7, 14, 3);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillRect(-10, -60, 20, 32);
  ctx.strokeRect(-10, -60, 20, 32);
  ctx.restore();
}

// ---- stars ---------------------------------------------------------------

const STAR_COLORS = ["#ffc21a", "#9b6bff", "#ff6fb5", "#ffffff", "#ffa53a", "#7cc8ff"];

function starPath(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// Small deterministic PRNG so every room keeps the same star pattern.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function inRect(x, y, r, pad) {
  return r && x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
}

const starCache = new WeakMap();

// Wall stickers in the upper part of a room, clear of the window and picture.
function roomStars(room) {
  let stars = starCache.get(room);
  if (stars) return stars;
  stars = [];
  const rand = rng(room.x * 7919 + room.y * 104729 + room.w);
  const n = Math.round((room.w * room.h) / 42000);
  for (let tries = 0; stars.length < n && tries < n * 20; tries++) {
    const r = 7 + rand() * 11;
    const x = room.x + 20 + rand() * (room.w - 40);
    const y = room.y + 24 + rand() * (room.h * 0.62);
    if (inRect(x, y, room.window, 30) || inRect(x, y, room.picture, 30)) continue;
    if (Math.abs(x - (room.x + room.w / 2)) < 60 && y < room.y + 110) continue; // lamp
    if (stars.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 26)) continue;
    stars.push({ x, y, r, rot: rand() * Math.PI, color: STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)] });
  }
  starCache.set(room, stars);
  return stars;
}

function drawStars(ctx, room) {
  ctx.lineJoin = "round";
  for (const st of roomStars(room)) {
    starPath(ctx, st.x, st.y, st.r, st.rot);
    ctx.fillStyle = st.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(90,40,160,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// Glow-in-the-dark: drawn over the darkness overlay, fading as the lights
// come on. Stars hidden behind furniture or items (blockers: bounds) don't glow.
function drawStarGlow(ctx, room, k, blockers) {
  ctx.save();
  ctx.globalAlpha = 0.7 * k;
  ctx.shadowColor = "rgba(200,255,180,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(225,255,200,0.7)";
  for (const st of roomStars(room)) {
    const sb = { minX: st.x - st.r, minY: st.y - st.r, maxX: st.x + st.r, maxY: st.y + st.r };
    if (blockers.some((b) => boundsOverlap(sb, b))) continue;
    starPath(ctx, st.x, st.y, st.r, st.rot);
    ctx.fill();
  }
  ctx.restore();
}

// ---- rooms ---------------------------------------------------------------

function drawRoom(ctx, room) {
  ctx.fillStyle = room.wallpaper;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  // sunny wash from the ceiling down
  const wash = ctx.createLinearGradient(0, room.y, 0, room.y + room.h);
  wash.addColorStop(0, "rgba(255,255,255,0.35)");
  wash.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  ctx.fillStyle = room.stripe;
  for (let x = room.x + 20; x < room.x + room.w; x += 60) ctx.fillRect(x, room.y, 18, room.h);
  // skirting board
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(room.x, room.y + room.h - 14, room.w, 14);
  ctx.fillStyle = "#e6d6ff";
  ctx.fillRect(room.x, room.y + room.h - 14, room.w, 3);
  // window: a sunny day outside
  if (room.window) {
    const wdw = room.window;
    const sky = ctx.createLinearGradient(0, wdw.y, 0, wdw.y + wdw.h);
    sky.addColorStop(0, "#5fb8ff");
    sky.addColorStop(1, "#c8ecff");
    ctx.fillStyle = sky;
    ctx.fillRect(wdw.x, wdw.y, wdw.w, wdw.h);
    const sx = wdw.x + wdw.w * 0.72;
    const sy = wdw.y + wdw.h * 0.3;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wdw.x, wdw.y, wdw.w, wdw.h);
    ctx.clip();
    ctx.strokeStyle = "#ffe066";
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * 26, sy + Math.sin(a) * 26);
      ctx.lineTo(sx + Math.cos(a) * 36, sy + Math.sin(a) * 36);
      ctx.stroke();
    }
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.arc(sx, sy, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    for (const [cx, cy, r] of [[0.22, 0.62, 16], [0.34, 0.58, 20], [0.46, 0.64, 14]]) {
      ctx.beginPath();
      ctx.arc(wdw.x + wdw.w * cx, wdw.y + wdw.h * cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.strokeRect(wdw.x, wdw.y, wdw.w, wdw.h);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(wdw.x + wdw.w / 2, wdw.y);
    ctx.lineTo(wdw.x + wdw.w / 2, wdw.y + wdw.h);
    ctx.moveTo(wdw.x, wdw.y + wdw.h / 2);
    ctx.lineTo(wdw.x + wdw.w, wdw.y + wdw.h / 2);
    ctx.stroke();
  }
  if (room.picture) {
    const p = room.picture;
    ctx.fillStyle = "#ffb000";
    ctx.fillRect(p.x - 6, p.y - 6, p.w + 12, p.h + 12);
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#ff8a3d";
    ctx.beginPath();
    ctx.arc(p.x + p.w * 0.75, p.y + p.h * 0.3, Math.min(p.w, p.h) * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9b6bff";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + p.h);
    ctx.lineTo(p.x + p.w * 0.4, p.y + p.h * 0.35);
    ctx.lineTo(p.x + p.w * 0.7, p.y + p.h * 0.7);
    ctx.lineTo(p.x + p.w, p.y + p.h * 0.45);
    ctx.lineTo(p.x + p.w, p.y + p.h);
    ctx.fill();
  }
  drawStars(ctx, room);
}

function drawLamp(ctx, room, light) {
  const x = room.x + room.w / 2;
  const y = room.y;
  ctx.strokeStyle = "#5b34c9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 40);
  ctx.stroke();
  if (light > 0) {
    const g = ctx.createRadialGradient(x, y + 50, 5, x, y + 50, 380);
    g.addColorStop(0, `rgba(255,226,120,${0.45 * light})`);
    g.addColorStop(1, "rgba(255,226,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(room.x, room.y, room.w, room.h);
  }
  ctx.fillStyle = light > 0.5 ? "#fff3b0" : "#e8e0f5";
  ctx.beginPath();
  ctx.arc(x, y + 50, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8f5bff";
  ctx.beginPath();
  ctx.moveTo(x - 30, y + 52);
  ctx.lineTo(x + 30, y + 52);
  ctx.lineTo(x + 14, y + 36);
  ctx.lineTo(x - 14, y + 36);
  ctx.closePath();
  ctx.fill();
}

function drawWall(ctx, it) {
  const x = it.x - it.w / 2;
  const y = it.y - it.h / 2;
  if (it.floor) {
    ctx.fillStyle = "#e09a4f";
    ctx.fillRect(x, y, it.w, it.h);
    ctx.fillStyle = "#f7bd6b";
    ctx.fillRect(x, y, it.w, Math.min(10, it.h));
    ctx.strokeStyle = "rgba(140,70,20,0.35)";
    ctx.lineWidth = 1;
    for (let px = x + 70; px < x + it.w; px += 140) {
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + Math.min(10, it.h));
      ctx.stroke();
    }
    if (it.h > 14) {
      ctx.fillStyle = WALL_COLOR;
      ctx.fillRect(x, y + 10, it.w, it.h - 10);
      wallStars(ctx, x, y + 10, it.w, it.h - 10);
    }
  } else {
    ctx.fillStyle = WALL_COLOR;
    ctx.fillRect(x, y, it.w, it.h);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, it.w - 2, it.h - 2);
    wallStars(ctx, x, y, it.w, it.h);
  }
}

const WALL_COLOR = "#6a3fd6";

// A row of tiny gold stars along a wall's long axis.
function wallStars(ctx, x, y, w, h) {
  const t = Math.min(w, h);
  if (t < 16) return;
  const r = Math.min(7, t * 0.24);
  const along = w >= h;
  const len = along ? w : h;
  ctx.fillStyle = "rgba(255,210,63,0.85)";
  for (let d = 40; d < len - 20; d += 90) {
    const sx = along ? x + d : x + w / 2;
    const sy = along ? y + h / 2 : y + d;
    starPath(ctx, sx, sy, r, 0);
    ctx.fill();
  }
}

// ---- scene -----------------------------------------------------------------

/**
 * scene: { level, fixed, items, sim, light, phase, spawnMarker, trail }
 * The caller has already applied the camera transform to ctx.
 */
export function drawWorld(ctx, scene) {
  const { level, fixed, items, sim } = scene;
  const light = scene.light || 0;
  ctx.fillStyle = "#4a2aa8";
  ctx.fillRect(0, 0, level.size.w, level.size.h);
  for (const room of level.rooms) drawRoom(ctx, room);
  for (const it of fixed) if (it.type === "wall") drawWall(ctx, it);
  for (const it of fixed) if (it.type !== "wall") drawItem(ctx, it);
  for (const room of level.rooms) drawLamp(ctx, room, light);
  drawSwitch(ctx, level, light > 0, light);

  for (const it of items) {
    if (it.hidden) continue;
    let pose = it;
    if (sim && it.type === "domino") {
      const d = sim.dominoes.find((dd) => dd.item === it);
      if (d) pose = d.pose;
    }
    drawItem(ctx, it, pose);
  }

  if (sim) {
    if (scene.trail) {
      ctx.fillStyle = "rgba(255,90,170,0.3)";
      for (const p of sim.trail) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawBall(ctx, sim.ball.position.x, sim.ball.position.y, sim.ball.angle);
  } else if (scene.spawnMarker !== false) {
    drawBall(ctx, level.spawn.x, level.spawn.y);
    drawHand(ctx, level.spawn.x, level.spawn.y);
  }

  // darkness overlay (lights off)
  const dark = 0.34 * (1 - light);
  if (dark > 0.001) {
    ctx.fillStyle = `rgba(48,16,120,${dark})`;
    ctx.fillRect(0, 0, level.size.w, level.size.h);
    const blockers = [];
    for (const it of [...fixed, ...items]) {
      if (it.type === "wall" || it.hidden) continue;
      for (const p of itemParts(it)) {
        const b = bounds(p.poly);
        // fixed furniture draws decor (desk lamp, plant) above its parts
        const top = it.category ? 16 : 70;
        blockers.push({ minX: b.minX - 6, minY: b.minY - top, maxX: b.maxX + 6, maxY: b.maxY + 6 });
      }
    }
    const bp = sim ? sim.ball.position : level.spawn;
    blockers.push({ minX: bp.x - 30, minY: bp.y - 100, maxX: bp.x + 30, maxY: bp.y + 30 });
    for (const room of level.rooms) drawStarGlow(ctx, room, 1 - light, blockers);
    // the switch stays faintly visible so the goal is clear
    drawSwitchHalo(ctx, level, 1 - light);
  }
}

function drawSwitchHalo(ctx, level, k) {
  const { x, y } = level.switch;
  ctx.save();
  ctx.globalAlpha = 0.85 * k;
  drawSwitch(ctx, level, false, 0);
  ctx.strokeStyle = "rgba(255,225,120,0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(x, y, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Highlight an item's parts (selection / invalid placement).
export function drawItemOutline(ctx, item, color, fill) {
  const parts = itemParts(item);
  for (const p of parts) {
    polyPath(ctx, p.poly);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Fit an item into a w×h box (inventory icons).
export function drawItemIcon(ctx, type, w, h) {
  const def = typeDef(type);
  const item = { id: 0, type, x: 0, y: 0, angle: 0, flip: 1 };
  const b = localBounds(item);
  const s = Math.min((w - 8) / (b.maxX - b.minX), (h - 8) / (b.maxY - b.minY), 1.2);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.translate(-(b.minX + b.maxX) / 2, -(b.minY + b.maxY) / 2);
  def.draw(ctx, item);
  ctx.restore();
}

export function localBounds(item) {
  const def = typeDef(item.type);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of def.parts(item)) {
    for (const v of p.v) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
  }
  // studs, wheels and sleepers are drawn slightly outside the physics shape
  return { minX: minX - 4, minY: minY - 14, maxX: maxX + 4, maxY: maxY + 14 };
}
