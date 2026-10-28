// Headless check that every level's stored solution is a legal placement
// and makes the ball hit the switch.
//
// Usage: node tools/verify-levels.mjs path/to/matter.min.js
// Use the same pinned build as index.html:
//   https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js
import { createRequire } from "node:module";
import { resolve } from "node:path";

if (!process.argv[2]) {
  console.error("usage: node tools/verify-levels.mjs path/to/matter.min.js");
  process.exit(2);
}
globalThis.Matter = createRequire(import.meta.url)(resolve(process.argv[2]));

const { createSim, stepSim, levelFixedItems } = await import("../src/physics.js");
const { staticObstacles, placementValid } = await import("../src/input.js");

let failed = 0;
for (const n of [1, 2, 3]) {
  const level = (await import(`../src/levels/level${n}.js`)).default;
  const fixed = levelFixedItems(level);
  const obstacles = staticObstacles(level, fixed);
  const items = level.moveable.map((m, i) => ({ id: `m${i}`, angle: 0, flip: 1, ...m }));
  const used = {};
  for (const [i, p] of (level.solution.items || []).entries()) {
    items.push({ id: `s${i}`, type: p.type, x: p.x, y: p.y, angle: ((p.deg || 0) * Math.PI) / 180, flip: p.flip || 1 });
    used[p.type] = (used[p.type] || 0) + 1;
  }
  const problems = [];
  for (const [t, c] of Object.entries(used)) {
    if (c > (level.inventory[t] || 0)) problems.push(`uses ${c} × ${t}, inventory has ${level.inventory[t] || 0}`);
  }
  for (const it of items) {
    if (!placementValid(it, level, obstacles, items)) problems.push(`invalid placement: ${it.type} @ ${it.x},${it.y}`);
  }
  const sim = createSim(level, [...fixed, ...items]);
  for (let f = 0; f < 60 * 40 && !sim.won; f++) stepSim(sim);
  if (!sim.won) problems.push("ball never reached the switch");
  const status = problems.length ? "FAIL" : "ok";
  if (problems.length) failed++;
  console.log(`${status}  ${n}. ${level.name}${sim.won ? ` — switch hit after ${(sim.winFrame / 60).toFixed(1)} s` : ""}`);
  for (const p of problems) console.log(`      ${p}`);
}
process.exit(failed ? 1 : 0);
