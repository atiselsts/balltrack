// Drag & drop, selection, rotation, camera pan/zoom and placement validation.
import { typeDef, isRotatable, BALL_RADIUS } from "./items.js";
import { itemParts, switchPoly } from "./physics.js";
import { bounds, boundsOverlap, polysOverlap, circle, distToPoly, toLocal, toWorld } from "./geometry.js";
import { screenToWorld, clampCamera, fitZoom, localBounds } from "./render.js";

const ROT_STEP = Math.PI / 12; // 15°
const RUG_HALF_T = 3;
const SNAP_PX = 14; // screen pixels
// Items may touch and slightly interpenetrate at snapped joints between
// pieces at different angles; anything deeper counts as overlap.
const ITEM_OVERLAP_EPS = 4;

// ---- validation (pure, no DOM) -----------------------------------------------

/**
 * Obstacles that never move during Build: fixed parts plus the spawn marker
 * and the switch. Returns [{ poly, b, floor }].
 */
export function staticObstacles(level, fixedItems) {
  const out = [];
  for (const it of fixedItems) {
    for (const p of itemParts(it)) out.push({ poly: p.poly, b: bounds(p.poly), floor: p.floor });
  }
  const spawn = circle(level.spawn.x, level.spawn.y, BALL_RADIUS + 8, 12);
  out.push({ poly: spawn, b: bounds(spawn), floor: false });
  const sw = switchPoly(level);
  out.push({ poly: sw, b: bounds(sw), floor: false });
  return out;
}

// Rugs hug floors: move the rug onto the nearest floor top below it.
export function snapToFloor(item, obstacles) {
  const half = (localBounds(item).maxX - localBounds(item).minX - 8) / 2;
  let best = null;
  for (const o of obstacles) {
    if (!o.floor) continue;
    if (o.b.minX > item.x - half || o.b.maxX < item.x + half) continue;
    const top = o.b.minY;
    if (top < item.y - 40) continue;
    if (best === null || top < best) best = top;
  }
  if (best === null) return false;
  item.y = best - RUG_HALF_T;
  return true;
}

// Returns true if the item may stay where it is.
export function placementValid(item, level, obstacles, items) {
  const def = typeDef(item.type);
  const parts = itemParts(item);
  const { w, h } = level.size;
  for (const p of parts) {
    for (const v of p.poly) if (v.x < 0 || v.y < 0 || v.x > w || v.y > h) return false;
  }
  if (def.floorOnly) {
    const probe = { ...item };
    if (!snapToFloor(probe, obstacles) || Math.abs(probe.y - item.y) > 0.5) return false;
  }
  for (const p of parts) {
    const pb = bounds(p.poly);
    for (const o of obstacles) {
      if (boundsOverlap(pb, o.b) && polysOverlap(p.poly, o.poly, 1)) return false;
    }
    for (const other of items) {
      if (other === item || other.hidden) continue;
      for (const q of itemParts(other)) {
        if (boundsOverlap(pb, bounds(q.poly)) && polysOverlap(p.poly, q.poly, ITEM_OVERLAP_EPS)) return false;
      }
    }
  }
  return true;
}

// Move the item so one of its track ends meets the nearest other track end
// within tol. Returns the joint point or null.
export function snapEnds(item, items, tol) {
  const def = typeDef(item.type);
  if (!def.ends) return null;
  let best = null;
  for (const e of def.ends) {
    const we = toWorld(e, item);
    for (const o of items) {
      if (o === item || o.hidden) continue;
      const od = typeDef(o.type);
      if (!od.ends) continue;
      for (const f of od.ends) {
        const wf = toWorld(f, o);
        const d = Math.hypot(wf.x - we.x, wf.y - we.y);
        if (d < tol && (!best || d < best.d)) best = { d, dx: wf.x - we.x, dy: wf.y - we.y, at: wf };
      }
    }
  }
  if (!best) return null;
  item.x += best.dx;
  item.y += best.dy;
  return best.at;
}

// ---- picking -------------------------------------------------------------

export function pickItem(items, pt, tol) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hidden) continue;
    for (const p of itemParts(it)) if (distToPoly(pt, p.poly) <= tol) return it;
  }
  // second pass: anywhere inside the item's box (doll house, basket, tube...)
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.hidden) continue;
    const l = toLocal(pt, it);
    const b = localBounds(it);
    if (l.x > b.minX + 4 && l.x < b.maxX - 4 && l.y > b.minY + 14 && l.y < b.maxY - 14) return it;
  }
  return null;
}

// ---- event handling ---------------------------------------------------------

export function initInput(G) {
  const canvas = G.canvas;
  let pan = null;
  let lastPointer = null;

  const canvasPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom,
    };
  };
  const worldPoint = (e) => {
    const p = canvasPoint(e);
    return { ...screenToWorld(G.cam, p.x, p.y), inside: p.inside };
  };

  function updateDrag(e) {
    const d = G.drag;
    const wp = worldPoint(e);
    const overPanel = G.ui.isOverPanel(e.clientX, e.clientY);
    d.item.x = Math.round(wp.x + d.off.x);
    d.item.y = Math.round(wp.y + d.off.y);
    d.item.hidden = !wp.inside && d.isNew;
    d.snap = null;
    if (!wp.inside || overPanel) {
      d.valid = false;
      d.overPanel = overPanel;
      return;
    }
    d.overPanel = false;
    d.snap = snapEnds(d.item, G.items, SNAP_PX / (G.cam.zoom * G.cam.scale));
    if (typeDef(d.item.type).floorOnly && !snapToFloor(d.item, G.obstacles)) {
      d.valid = false;
      return;
    }
    d.valid = placementValid(d.item, G.level, G.obstacles, G.items);
  }

  function revalidateDrag() {
    if (G.drag && lastPointer) updateDrag(lastPointer);
  }

  // Start dragging a fresh item out of the inventory panel.
  G.startNewDrag = (type, e) => {
    if (G.phase !== "build" || (G.inventory[type] || 0) <= 0) return;
    const item = G.createItem(type);
    G.inventory[type]--;
    G.items.push(item);
    G.selected = item;
    G.drag = { item, isNew: true, orig: null, off: { x: 0, y: 0 }, valid: false };
    lastPointer = e;
    updateDrag(e);
    G.changed();
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    lastPointer = e;
    const cp = canvasPoint(e);
    const mm = G.minimapHit(cp.x, cp.y);
    if (mm) {
      G.centerOn(mm.x, mm.y);
      G.followBall = false;
      G.ui.syncButtons();
      return;
    }
    const wp = worldPoint(e);
    if (G.phase === "build" && e.button === 0) {
      const tol = 6 / (G.cam.zoom * G.cam.scale);
      const hit = pickItem(G.items, wp, Math.max(tol, 4));
      if (hit) {
        G.selected = hit;
        G.drag = {
          item: hit,
          isNew: false,
          orig: { x: hit.x, y: hit.y, angle: hit.angle, flip: hit.flip },
          off: { x: hit.x - wp.x, y: hit.y - wp.y },
          valid: true,
          moved: false,
        };
        G.ui.hideTooltip();
        return;
      }
      G.selected = null;
    }
    pan = { sx: e.clientX, sy: e.clientY, cx: G.cam.x, cy: G.cam.y };
    canvas.classList.add("panning");
  });

  window.addEventListener("pointermove", (e) => {
    lastPointer = e;
    if (G.drag) {
      if (!G.drag.isNew && !G.drag.moved) {
        const wp = worldPoint(e);
        const d = G.drag;
        if (Math.hypot(wp.x + d.off.x - d.orig.x, wp.y + d.off.y - d.orig.y) < 2) return;
        d.moved = true;
      }
      updateDrag(e);
      return;
    }
    if (pan) {
      const k = G.cam.zoom * G.cam.scale;
      G.cam.x = pan.cx - (e.clientX - pan.sx) / k;
      G.cam.y = pan.cy - (e.clientY - pan.sy) / k;
      clampCamera(G.cam, G.level);
      G.followBall = false;
      G.ui.syncButtons();
      return;
    }
    // hover tooltip for items in the room
    if (G.phase === "build" && e.target === canvas) {
      const wp = worldPoint(e);
      const hit = pickItem([...G.fixed.filter((f) => f.type !== "wall"), ...G.items], wp, 3);
      if (hit) G.ui.showItemTooltip(hit.type, e.clientX, e.clientY);
      else G.ui.hideTooltip();
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (pan) {
      pan = null;
      canvas.classList.remove("panning");
    }
    const d = G.drag;
    if (!d) return;
    G.drag = null;
    const item = d.item;
    const def = typeDef(item.type);
    if (d.overPanel && def.category === "inventory") {
      G.returnToInventory(item);
    } else if (!d.isNew && !d.moved) {
      Object.assign(item, d.orig);
    } else if (!d.valid) {
      if (d.isNew) G.returnToInventory(item);
      else Object.assign(item, d.orig);
    }
    item.hidden = false;
    G.changed();
  });

  window.addEventListener("pointercancel", () => {
    pan = null;
    if (G.drag) {
      const d = G.drag;
      G.drag = null;
      if (d.isNew) G.returnToInventory(d.item);
      else Object.assign(d.item, d.orig);
      G.changed();
    }
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (G.drag) {
        rotate(G.drag.item, e.deltaY > 0 ? 1 : -1, true);
        return;
      }
      const p = canvasPoint(e);
      const before = screenToWorld(G.cam, p.x, p.y);
      const minZ = fitZoom(G.level);
      const z = G.cam.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      G.cam.zoom = Math.max(minZ, Math.min(Math.max(2, minZ), z));
      const after = screenToWorld(G.cam, p.x, p.y);
      G.cam.x += before.x - after.x;
      G.cam.y += before.y - after.y;
      clampCamera(G.cam, G.level);
    },
    { passive: false }
  );

  function rotate(item, dir, dragging) {
    if (!item || !isRotatable(typeDef(item.type))) return;
    const old = item.angle;
    item.angle = Math.round((item.angle + dir * ROT_STEP) / ROT_STEP) * ROT_STEP;
    item.angle = Math.atan2(Math.sin(item.angle), Math.cos(item.angle));
    if (dragging) revalidateDrag();
    else if (!placementValid(item, G.level, G.obstacles, G.items)) {
      item.angle = old;
      G.flashInvalid(item);
    }
    G.changed();
  }

  function flip(item, dragging) {
    if (!item || !typeDef(item.type).flippable) return;
    item.flip = -(item.flip || 1);
    if (dragging) revalidateDrag();
    else if (!placementValid(item, G.level, G.obstacles, G.items)) {
      item.flip = -item.flip;
      G.flashInvalid(item);
    }
    G.changed();
  }

  window.addEventListener("keydown", (e) => {
    if (G.screen !== "game" || G.ui.modalOpen()) return;
    const k = e.key.toLowerCase();
    G.keys.add(k);
    if (k === " ") {
      e.preventDefault();
      if (!e.repeat) G.toggleRun();
      return;
    }
    if (k === "r" && G.phase !== "build") {
      G.reset();
      return;
    }
    if (k === "escape") {
      if (G.drag) {
        const d = G.drag;
        G.drag = null;
        if (d.isNew) G.returnToInventory(d.item);
        else Object.assign(d.item, d.orig);
        d.item.hidden = false;
      }
      G.selected = null;
      G.changed();
      return;
    }
    if (G.phase !== "build") return;
    const target = G.drag ? G.drag.item : G.selected;
    if (k === "q") rotate(target, -1, !!G.drag);
    else if (k === "e") rotate(target, 1, !!G.drag);
    else if (k === "f") flip(target, !!G.drag);
    else if ((k === "delete" || k === "backspace") && target) {
      e.preventDefault();
      if (typeDef(target.type).category === "inventory") {
        G.drag = null;
        G.returnToInventory(target);
        G.changed();
      } else {
        G.flashInvalid(target);
      }
    }
  });
  window.addEventListener("keyup", (e) => G.keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => G.keys.clear());
}
