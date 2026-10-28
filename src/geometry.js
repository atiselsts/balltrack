// Small 2D geometry helpers: convex polygons, poses and SAT overlap tests.
// Polygons are arrays of {x, y} points (convex, any winding).

export function rect(cx, cy, w, h, a = 0) {
  return rotatePoly(
    [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ],
    a,
    cx,
    cy
  );
}

// Box given by its corners (x1, y1) - (x2, y2).
export function box(x1, y1, x2, y2) {
  return rect((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1), Math.abs(y2 - y1));
}

// Thick line segment from (x1, y1) to (x2, y2).
export function seg(x1, y1, x2, y2, t) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return rect((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(dx, dy), t, Math.atan2(dy, dx));
}

export function circle(cx, cy, r, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// Arc built from n short quads between radius r (inner) and r + t (outer).
export function arc(cx, cy, r, t, a0, a1, n) {
  const polys = [];
  for (let i = 0; i < n; i++) {
    const s0 = a0 + ((a1 - a0) * i) / n;
    const s1 = a0 + ((a1 - a0) * (i + 1)) / n;
    polys.push([
      { x: cx + Math.cos(s0) * r, y: cy + Math.sin(s0) * r },
      { x: cx + Math.cos(s1) * r, y: cy + Math.sin(s1) * r },
      { x: cx + Math.cos(s1) * (r + t), y: cy + Math.sin(s1) * (r + t) },
      { x: cx + Math.cos(s0) * (r + t), y: cy + Math.sin(s0) * (r + t) },
    ]);
  }
  return polys;
}

export function rotatePoly(poly, a, dx = 0, dy = 0) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return poly.map((p) => ({ x: p.x * c - p.y * s + dx, y: p.x * s + p.y * c + dy }));
}

// Local -> world for a pose {x, y, angle, flip}.
export function toWorld(p, pose) {
  const lx = p.x * (pose.flip || 1);
  const c = Math.cos(pose.angle || 0);
  const s = Math.sin(pose.angle || 0);
  return { x: pose.x + lx * c - p.y * s, y: pose.y + lx * s + p.y * c };
}

export function toLocal(p, pose) {
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  const c = Math.cos(-(pose.angle || 0));
  const s = Math.sin(-(pose.angle || 0));
  return { x: (dx * c - dy * s) * (pose.flip || 1), y: dx * s + dy * c };
}

export function transformPoly(poly, pose) {
  return poly.map((p) => toWorld(p, pose));
}

export function centroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cr = p.x * q.y - q.x * p.y;
    a += cr;
    cx += (p.x + q.x) * cr;
    cy += (p.y + q.y) * cr;
  }
  if (Math.abs(a) < 1e-9) return { x: poly[0].x, y: poly[0].y };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function bounds(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a, b, pad = 0) {
  return a.minX - pad < b.maxX && b.minX - pad < a.maxX && a.minY - pad < b.maxY && b.minY - pad < a.maxY;
}

function project(poly, ax, ay) {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

// True if two convex polygons penetrate by more than eps (touching is allowed).
export function polysOverlap(A, B, eps = 1) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      let ax = -(q.y - p.y);
      let ay = q.x - p.x;
      const len = Math.hypot(ax, ay);
      if (len < 1e-9) continue;
      ax /= len;
      ay /= len;
      const [a0, a1] = project(A, ax, ay);
      const [b0, b1] = project(B, ax, ay);
      if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
    }
  }
  return true;
}

export function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function distToPoly(pt, poly) {
  if (pointInPoly(pt, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy)));
  }
  return best;
}
