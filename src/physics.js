// Matter.js world setup, body factories, collision handling and the scripted
// domino fall. Matter is taken from the global loaded by index.html.
import { typeDef, materialOf, BALL_RADIUS, DOMINO } from "./items.js";
import { transformPoly, centroid, bounds, boundsOverlap, polysOverlap, rect, toLocal } from "./geometry.js";

export const GRAVITY = 1.5;
export const SUBSTEPS = 4;
export const FRAME_MS = 1000 / 60;
const MAX_SPEED = 28;
const STILL_SPEED = 0.15;
const STILL_FRAMES = 120;
const DOMINO_ALPHA = (2 * (Math.PI / 2)) / (0.3 * 0.3); // 90° in ~0.3 s from rest
const SWITCH_SIZE = { w: 28, h: 46 };

export function switchPoly(level) {
  return rect(level.switch.x, level.switch.y, SWITCH_SIZE.w, SWITCH_SIZE.h);
}

// World-space parts of an item: [{ poly, mat, floor }].
export function itemParts(item) {
  const def = typeDef(item.type);
  return def.parts(item).map((p) => ({
    poly: transformPoly(p.v, item),
    mat: materialOf(def, p),
    floor: !!p.floor,
  }));
}

// Fixed items for a level: walls (given as top-left rects) plus furniture.
export function levelFixedItems(level) {
  const out = [];
  let n = 0;
  for (const w of level.walls) {
    out.push({
      id: `w${n++}`,
      type: "wall",
      x: w.x + w.w / 2,
      y: w.y + w.h / 2,
      w: w.w,
      h: w.h,
      floor: !!w.floor,
      angle: 0,
      flip: 1,
    });
  }
  for (const f of level.fixed) out.push({ id: `f${n++}`, angle: 0, flip: 1, ...f });
  return out;
}

function M() {
  return globalThis.Matter;
}

function staticBody(poly, mat, extra) {
  const c = centroid(poly);
  const body = M().Bodies.fromVertices(c.x, c.y, [poly.map((p) => ({ x: p.x, y: p.y }))], {
    isStatic: true,
    slop: 0.02,
    ...extra,
  });
  // Body.setStatic() overwrites restitution/friction, so apply them afterwards.
  body.restitution = mat.restitution;
  body.friction = mat.friction;
  body.frictionStatic = mat.frictionStatic;
  body.drag = mat.drag || 0;
  return body;
}

function dominoPoly(pose) {
  return transformPoly(rect(0, 0, DOMINO.w, DOMINO.h), pose);
}

// Pose of a domino tipped by theta around its bottom corner in direction dir.
function dominoPose(d, theta) {
  const p0 = d.pose0;
  const c0 = Math.cos(p0.angle);
  const s0 = Math.sin(p0.angle);
  const lx = (d.dir * DOMINO.w) / 2;
  const ly = DOMINO.h / 2;
  const px = p0.x + lx * c0 - ly * s0;
  const py = p0.y + lx * s0 + ly * c0;
  const a = p0.angle + d.dir * theta;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: px - lx * c + ly * s, y: py - lx * s - ly * c, angle: a, flip: 1 };
}

/**
 * Build a fresh simulation from the level and the current placements.
 * Building from scratch on every Go makes Reset trivially exact.
 */
export function createSim(level, items) {
  const { Engine, Bodies, Body, Composite, Events } = M();
  const engine = Engine.create({ gravity: { x: 0, y: GRAVITY } });
  engine.positionIterations = 10;
  engine.velocityIterations = 8;

  const bodies = [];
  const solids = []; // non-domino polygons for the domino sweep test
  const dominoes = [];
  const dragBodies = []; // rugs, pillows: slow a rolling ball directly
  for (const item of items) {
    if (item.type === "domino") {
      const pose = { x: item.x, y: item.y, angle: item.angle || 0, flip: 1 };
      const poly = dominoPoly(pose);
      const mat = materialOf(typeDef("domino"));
      const body = staticBody(poly, mat, { label: "domino" });
      const d = { item, body, pose0: pose, pose, poly, state: "standing", theta: 0, omega: 0, dir: 1 };
      body.plugin = { domino: d };
      dominoes.push(d);
      bodies.push(body);
      continue;
    }
    for (const part of itemParts(item)) {
      const body = staticBody(part.poly, part.mat, { label: item.type });
      bodies.push(body);
      if (part.mat.drag) dragBodies.push(body);
      solids.push({ poly: part.poly, b: bounds(part.poly) });
    }
  }

  const sw = switchPoly(level);
  const switchBody = Bodies.rectangle(level.switch.x, level.switch.y, SWITCH_SIZE.w, SWITCH_SIZE.h, {
    isStatic: true,
    isSensor: true,
    label: "switch",
  });
  bodies.push(switchBody);

  // A 32-gon rather than Bodies.circle (which uses only 12 sides at this
  // size): fewer corners means much less energy lost while rolling.
  const ball = Bodies.polygon(level.spawn.x, level.spawn.y, 32, BALL_RADIUS, {
    label: "ball",
    restitution: 0,
    friction: 1,
    frictionStatic: 0,
    frictionAir: 0.001,
    density: 0.002,
    slop: 0.02,
  });
  // Matter scales inertia by 4 for stability; a real ball (solid sphere,
  // I = 0.4·m·r²) rolls far better.
  Body.setInertia(ball, 0.4 * ball.mass * BALL_RADIUS * BALL_RADIUS);
  bodies.push(ball);
  Composite.add(engine.world, bodies);

  const sim = {
    engine,
    ball,
    level,
    dominoes,
    solids,
    dragBodies,
    switchPoly: sw,
    frame: 0,
    won: false,
    winFrame: -1,
    stillFrames: 0,
    stopped: false,
    trail: [],
  };

  Events.on(engine, "collisionStart", (ev) => {
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const other = a === ball ? b : b === ball ? a : null;
      if (!other) continue;
      if (other === switchBody && !sim.won) {
        sim.won = true;
        sim.winFrame = sim.frame;
      } else if (other.label === "domino") {
        const d = other.plugin.domino;
        if (d.state === "standing") {
          const local = toLocal(ball.position, d.pose0);
          let dir;
          if (local.y < -DOMINO.h / 2 + 2) dir = d.item.flip || 1; // hit on top: preferred side
          else dir = local.x < 0 ? 1 : -1;
          triggerDomino(d, dir);
        }
      }
    }
  });

  return sim;
}

function triggerDomino(d, dir) {
  d.state = "falling";
  d.dir = dir;
  d.omega = 0;
}

function updateDominoes(sim, dt) {
  const { Body } = M();
  for (const d of sim.dominoes) {
    if (d.state !== "falling") continue;
    d.omega += DOMINO_ALPHA * dt;
    const nt = Math.min(Math.PI / 2, d.theta + d.omega * dt);
    const pose = dominoPose(d, nt);
    const poly = dominoPoly(pose);
    const pb = bounds(poly);
    let stop = false;
    let hold = false;
    for (const s of sim.solids) {
      if (boundsOverlap(pb, s.b) && polysOverlap(poly, s.poly, 1.5)) {
        stop = true;
        break;
      }
    }
    if (!stop) {
      for (const o of sim.dominoes) {
        if (o === d || !polysOverlap(poly, o.poly, 1.5)) continue;
        if (o.state === "standing") {
          triggerDomino(o, d.dir);
          hold = true;
        } else if (o.state === "falling") {
          hold = true;
        } else {
          stop = true;
        }
      }
    }
    if (stop) {
      d.state = "stopped";
    } else if (hold) {
      d.omega = 0;
    } else {
      d.theta = nt;
      d.pose = pose;
      d.poly = poly;
      Body.setAngle(d.body, pose.angle);
      Body.setPosition(d.body, { x: pose.x, y: pose.y });
      if (nt >= Math.PI / 2) d.state = "fallen";
    }
  }
}

// Advance one 1/60 s frame.
export function stepSim(sim) {
  const { Engine, Body } = M();
  for (let i = 0; i < SUBSTEPS; i++) {
    Engine.update(sim.engine, FRAME_MS / SUBSTEPS);
    const v = Body.getVelocity(sim.ball);
    const sp = Math.hypot(v.x, v.y);
    if (sp > MAX_SPEED) Body.setVelocity(sim.ball, { x: (v.x * MAX_SPEED) / sp, y: (v.y * MAX_SPEED) / sp });
  }
  // Matter's friction barely affects a rolling ball, so soft and rug
  // surfaces damp it explicitly while touching.
  let drag = 0;
  for (const c of M().Query.collides(sim.ball, sim.dragBodies)) {
    const other = c.bodyA === sim.ball ? c.bodyB : c.bodyA;
    drag = Math.max(drag, other.drag);
  }
  if (drag > 0) {
    const v = Body.getVelocity(sim.ball);
    Body.setVelocity(sim.ball, { x: v.x * (1 - drag), y: v.y * (1 - drag) });
    Body.setAngularVelocity(sim.ball, Body.getAngularVelocity(sim.ball) * (1 - drag));
  }
  updateDominoes(sim, 1 / 60);
  sim.frame++;

  const b = sim.ball.position;
  if (sim.frame % 3 === 0) {
    sim.trail.push({ x: b.x, y: b.y });
    if (sim.trail.length > 60) sim.trail.shift();
  }
  const speed = Body.getSpeed(sim.ball);
  sim.stillFrames = speed < STILL_SPEED ? sim.stillFrames + 1 : 0;
  const { w, h } = sim.level.size;
  const out = b.x < -60 || b.x > w + 60 || b.y > h + 120 || b.y < -400;
  sim.stopped = out || sim.stillFrames > STILL_FRAMES;
}

export function dominoState(sim, item) {
  return sim.dominoes.find((d) => d.item === item);
}
