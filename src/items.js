// Item type definitions: geometry (convex parts in local coords), material,
// category and a procedural draw function (also used for inventory icons).
import { rect, box, seg, circle, arc } from "./geometry.js";

export const BALL_RADIUS = 12;

// Matter.js combines restitution with max() and friction with min(), so the
// ball has restitution 0 / friction 1 and each surface material decides.
export const MATERIALS = {
  wall: { restitution: 0.8, friction: 0.2, frictionStatic: 0.3, hint: "hard — bouncy" },
  floor: { restitution: 0.78, friction: 0.25, frictionStatic: 0.3, hint: "hard — bouncy" },
  wood: { restitution: 0.72, friction: 0.25, frictionStatic: 0.3, hint: "hard surface" },
  mattress: { restitution: 0.3, friction: 0.5, frictionStatic: 0.5, drag: 0.02, hint: "soft — dampens bounce" },
  soft: { restitution: 0.1, friction: 0.9, frictionStatic: 0.9, drag: 0.04, hint: "soft — absorbs bounce" },
  lego: { restitution: 0.7, friction: 0.15, frictionStatic: 0.2, hint: "rigid — normal friction" },
  book: { restitution: 0.82, friction: 0.2, frictionStatic: 0.3, hint: "hard — slightly bouncy" },
  track: { restitution: 0.15, friction: 0, frictionStatic: 0, hint: "very low friction — fast" },
  cardboard: { restitution: 0.25, friction: 0, frictionStatic: 0, hint: "channel — keeps momentum" },
  rug: { restitution: 0.05, friction: 1, frictionStatic: 1, drag: 0.06, hint: "high friction — slows the ball" },
  metal: { restitution: 0.7, friction: 0.15, frictionStatic: 0.2, hint: "hard surface" },
  plastic: { restitution: 0.7, friction: 0.2, frictionStatic: 0.3, hint: "hard surface" },
};

// ---- drawing helpers -------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fillRR(ctx, x, y, w, h, r, fill, stroke) {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function polyPath(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

function fillPolys(ctx, polys, fill, stroke) {
  for (const p of polys) {
    polyPath(ctx, p);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function hashColor(id, palette) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

const BOOK_COLORS = ["#ff4f7b", "#2fa8ff", "#2ec27e", "#ffb000", "#8f5bff", "#ff7a2f"];
const LEGO_COLORS = { legoLong: "#ff3b4f", legoShort: "#ffc21a" };

// ---- type geometry ---------------------------------------------------------

const P = (v, extra) => ({ v, ...extra });

// Snap points: the two ends of the rolling surface (top face) of a beam.
const topEnds = (w, halfT) => [
  { x: -w / 2, y: -halfT },
  { x: w / 2, y: -halfT },
];

function legoParts(w) {
  return () => [P(rect(0, 0, w, 14))];
}

function drawLego(w, color) {
  return (ctx) => {
    const studs = Math.round(w / 22);
    for (let i = 0; i < studs; i++) {
      const sx = -w / 2 + (i + 0.5) * (w / studs);
      fillRR(ctx, sx - 6, -12, 12, 6, 2, color);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(sx - 5, -11, 3, 4);
    }
    fillRR(ctx, -w / 2, -7, w, 14, 2, color, "rgba(0,0,0,0.35)");
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(-w / 2 + 2, -6, w - 4, 3);
  };
}

const TRACK_W = 240;
function drawRail(ctx, x1, x2) {
  ctx.fillStyle = "#c27a3a";
  for (let x = x1 + 10; x < x2 - 4; x += 22) ctx.fillRect(x - 5, 3, 10, 9);
  fillRR(ctx, x1, -4, x2 - x1, 8, 2, "#a9b1b9", "#5b636b");
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(x1 + 2, -3, x2 - x1 - 4, 2);
}

// Curved track: arc around (0, -R) offset so the bbox is roughly centred.
const CURVE_R = 150;
const CURVE_A0 = Math.PI / 2; // bottom of the circle
const CURVE_A1 = Math.PI / 6; // 60° further: exits rising at 60°
const CURVE_C = { x: -69, y: -116 }; // circle centre, chosen so the bbox is centred
function curveParts() {
  // Polys from the bottom point going up the right side.
  return arc(CURVE_C.x, CURVE_C.y, CURVE_R, 8, CURVE_A0, CURVE_A1, 16).map((v) => P(v));
}

const TUBE_L = 200;
const TUBE_IN = 36;
const TUBE_T = 8;

const DOMINO_W = 14;
const DOMINO_H = 60;
export const DOMINO = { w: DOMINO_W, h: DOMINO_H };

// Doll house: enter through the upper-left window, roll right on the upper
// floor, drop through the gap, roll left on the ground floor and out the door.
function dollhouseParts() {
  return [
    P(seg(-140, -132, 0, -205, 10)),
    P(seg(0, -205, 140, -132, 10)),
    P(box(-120, -140, 120, -130)),
    P(box(-120, -130, -110, -100)),
    P(box(-120, -48, -110, 56)),
    P(box(110, -130, 120, 140)),
    P(seg(-110, -40, 72, -12, 8)),
    P(seg(110, 98, -110, 128, 8)),
    P(box(-120, 132, 120, 140)),
  ];
}

function drawDollhouse(ctx, item) {
  // back wall / rooms
  ctx.fillStyle = "#ffd6f0";
  ctx.fillRect(-110, -130, 220, 96);
  ctx.fillStyle = "#d8ecff";
  ctx.fillRect(-110, -34, 220, 168);
  // tiny furniture decor
  ctx.fillStyle = "rgba(120,80,60,0.35)";
  ctx.fillRect(40, -70, 30, 20);
  ctx.fillRect(-40, 40, 40, 30);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(-20, -115, 26, 20);
  // roof fill
  ctx.beginPath();
  ctx.moveTo(-140, -132);
  ctx.lineTo(0, -205);
  ctx.lineTo(140, -132);
  ctx.closePath();
  ctx.fillStyle = "#9b5cff";
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(0, -160, 14, 0, Math.PI * 2);
  ctx.fill();
  const parts = dollhouseParts().map((p) => p.v);
  fillPolys(ctx, parts.slice(2), "#f4f0e6", "#8a6d5a");
  fillPolys(ctx, parts.slice(0, 2), "#7c3cf0", "#4b1fa0");
  // window frame hint + door frame
  ctx.strokeStyle = "#8a6d5a";
  ctx.lineWidth = 2;
  ctx.strokeRect(-124, -100, 8, 52);
  ctx.strokeRect(-124, 56, 8, 76);
}

// ---- furniture -------------------------------------------------------------

function drawWoodBox(ctx, x, y, w, h, fill = "#d0904f") {
  fillRR(ctx, x, y, w, h, 3, fill, "rgba(70,30,20,0.35)");
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + 2, y + 2, w - 4, Math.min(4, h - 4));
}

function chairParts() {
  return [
    P(box(-55, -6, 55, 8)),
    P(box(42, -100, 54, -6)),
    P(box(-52, 8, -42, 100)),
    P(box(42, 8, 52, 100)),
  ];
}

function stoolParts() {
  return [P(box(-40, -55, 40, -41)), P(box(-36, -41, -28, 55)), P(box(28, -41, 36, 55))];
}

function basketParts() {
  return [P(box(-60, 42, 60, 52)), P(seg(-62, -50, -54, 46, 8)), P(seg(62, -50, 54, 46, 8))];
}

function stairsParts(item) {
  const n = item.steps;
  const W = n * item.stepW;
  const H = n * item.stepH;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + i * item.stepW;
    out.push(P(box(x, -H / 2 + i * item.stepH, x + item.stepW, H / 2)));
  }
  return out;
}

// ---- catalogue -------------------------------------------------------------

export const ITEM_TYPES = {
  // fixed ---------------------------------------------------------------
  wall: {
    name: "Wall",
    category: "fixed",
    material: "wall",
    parts: (it) => [P(rect(0, 0, it.w, it.h), it.floor ? { mat: "floor", floor: true } : undefined)],
    draw: null, // drawn by the room renderer
  },
  shelf: {
    name: "Shelf",
    category: "fixed",
    material: "wood",
    parts: (it) => [P(rect(0, 0, it.w, 14))],
    draw(ctx, it) {
      drawWoodBox(ctx, -it.w / 2, -7, it.w, 14, "#e8a35a");
      ctx.fillStyle = "#a8682f";
      ctx.fillRect(-it.w / 2 + 8, 7, 6, 18);
      ctx.fillRect(it.w / 2 - 14, 7, 6, 18);
    },
  },
  bed: {
    name: "Bed",
    category: "fixed",
    material: "wood",
    parts: () => [
      P(box(-190, -80, -170, 80)),
      P(box(-170, 30, 190, 62)),
      P(box(-170, -12, 186, 30), { mat: "mattress" }),
      P(box(176, -30, 190, 30)),
    ],
    draw(ctx) {
      drawWoodBox(ctx, -170, 30, 360, 32, "#c98a4c");
      ctx.fillStyle = "#9a6232";
      ctx.fillRect(-170, 62, 14, 18);
      ctx.fillRect(176, 62, 14, 18);
      fillRR(ctx, -170, -12, 356, 42, 10, "#f1efe9", "rgba(0,0,0,0.25)");
      fillRR(ctx, -60, -16, 246, 46, 10, "#8f5bff", "rgba(60,20,120,0.35)");
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let x = -40; x < 180; x += 40) ctx.fillRect(x, -12, 14, 40);
      fillRR(ctx, -160, -34, 80, 24, 10, "#ffffff", "rgba(0,0,0,0.2)");
      drawWoodBox(ctx, -190, -80, 20, 160, "#c98a4c");
      drawWoodBox(ctx, 176, -30, 14, 60, "#c98a4c");
    },
  },
  desk: {
    name: "Desk",
    category: "fixed",
    material: "wood",
    parts: () => [
      P(box(-150, -85, 150, -67)),
      P(box(-142, -67, -130, 85)),
      P(box(130, -67, 142, 85)),
      P(box(30, -67, 130, -27)),
    ],
    draw(ctx) {
      drawWoodBox(ctx, -142, -67, 12, 152, "#b77a45");
      drawWoodBox(ctx, 130, -67, 12, 152, "#b77a45");
      drawWoodBox(ctx, 30, -67, 100, 40, "#e2a764");
      ctx.fillStyle = "#6b3f1c";
      ctx.fillRect(72, -50, 16, 4);
      drawWoodBox(ctx, -150, -85, 300, 18, "#f0b46e");
      // lamp & books decor
      ctx.fillStyle = "#6a3fc9";
      ctx.fillRect(-110, -95, 30, 10);
      ctx.fillStyle = "#ffc21a";
      ctx.fillRect(-100, -130, 6, 36);
      ctx.beginPath();
      ctx.moveTo(-122, -128);
      ctx.lineTo(-74, -128);
      ctx.lineTo(-88, -150);
      ctx.lineTo(-108, -150);
      ctx.closePath();
      ctx.fill();
    },
  },
  sofa: {
    name: "Sofa",
    category: "fixed",
    material: "soft",
    parts: () => [P(box(-180, -10, 180, 60)), P(box(-180, -70, -150, -10)), P(box(150, -70, 180, -10)), P(box(-150, -90, 150, -40))],
    draw(ctx) {
      fillRR(ctx, -150, -90, 300, 60, 16, "#9b6bff", "rgba(60,20,120,0.35)");
      fillRR(ctx, -180, -10, 360, 70, 12, "#7f4fe8", "rgba(60,20,120,0.35)");
      fillRR(ctx, -150, -40, 150, 34, 10, "#b48cff", "rgba(60,20,120,0.3)");
      fillRR(ctx, 0, -40, 150, 34, 10, "#b48cff", "rgba(60,20,120,0.3)");
      fillRR(ctx, -184, -70, 34, 130, 12, "#6b3fd6", "rgba(60,20,120,0.35)");
      fillRR(ctx, 150, -70, 34, 130, 12, "#6b3fd6", "rgba(60,20,120,0.35)");
      ctx.fillStyle = "#2e2e2e";
      ctx.fillRect(-170, 60, 10, 10);
      ctx.fillRect(160, 60, 10, 10);
    },
  },
  counter: {
    name: "Kitchen counter",
    category: "fixed",
    material: "wood",
    parts: (it) => [P(box(-it.w / 2, -90, it.w / 2, 90))],
    draw(ctx, it) {
      const w = it.w;
      drawWoodBox(ctx, -w / 2 + 6, -76, w - 12, 166, "#fff4d6");
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      const doors = Math.max(1, Math.round(w / 100));
      for (let i = 0; i < doors; i++) {
        const x = -w / 2 + 12 + (i * (w - 24)) / doors;
        ctx.strokeRect(x, -64, (w - 24) / doors - 8, 140);
        ctx.fillStyle = "#888";
        ctx.fillRect(x + (w - 24) / doors - 22, -50, 4, 18);
      }
      fillRR(ctx, -w / 2, -90, w, 16, 3, "#6a4bc4", "rgba(40,10,90,0.45)");
    },
  },
  table: {
    name: "Table",
    category: "fixed",
    material: "wood",
    parts: () => [P(box(-130, -75, 130, -59)), P(box(-118, -59, -106, 75)), P(box(106, -59, 118, 75))],
    draw(ctx) {
      drawWoodBox(ctx, -118, -59, 12, 134, "#b77a45");
      drawWoodBox(ctx, 106, -59, 12, 134, "#b77a45");
      drawWoodBox(ctx, -130, -75, 260, 16, "#eaa65e");
      ctx.fillStyle = "#e7e3da";
      ctx.fillRect(-30, -95, 24, 20);
      ctx.fillStyle = "#3fd07a";
      ctx.beginPath();
      ctx.arc(-18, -100, 12, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  stairs: {
    name: "Stairs",
    category: "fixed",
    material: "wood",
    parts: stairsParts,
    draw(ctx, it) {
      const n = it.steps;
      const W = n * it.stepW;
      const H = n * it.stepH;
      ctx.fillStyle = "#c98a4c";
      ctx.beginPath();
      ctx.moveTo(-W / 2, H / 2);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + i * it.stepW;
        const y = -H / 2 + i * it.stepH;
        ctx.lineTo(x, y);
        ctx.lineTo(x + it.stepW, y);
      }
      ctx.lineTo(W / 2, H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f2b56a";
      for (let i = 0; i < n; i++) {
        ctx.fillRect(-W / 2 + i * it.stepW, -H / 2 + i * it.stepH, it.stepW + 2, 6);
      }
    },
  },
  doorframe: {
    name: "Door frame",
    category: "fixed",
    material: "wood",
    decor: true,
    parts: () => [],
    draw(ctx, it) {
      ctx.strokeStyle = "#fffaf0";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-it.w / 2, it.h / 2);
      ctx.lineTo(-it.w / 2, -it.h / 2);
      ctx.lineTo(it.w / 2, -it.h / 2);
      ctx.lineTo(it.w / 2, it.h / 2);
      ctx.stroke();
    },
  },

  // moveable ------------------------------------------------------------
  chair: {
    name: "Chair",
    category: "moveable",
    material: "wood",
    parts: chairParts,
    draw(ctx) {
      drawWoodBox(ctx, -52, 8, 10, 92, "#b77a45");
      drawWoodBox(ctx, 42, 8, 10, 92, "#b77a45");
      drawWoodBox(ctx, 42, -100, 12, 94, "#d8954f");
      ctx.fillStyle = "#d8954f";
      ctx.fillRect(46, -90, 4, 80);
      drawWoodBox(ctx, -55, -6, 110, 14, "#f0ad62");
    },
  },
  stool: {
    name: "Stool",
    category: "moveable",
    material: "wood",
    parts: stoolParts,
    draw(ctx) {
      drawWoodBox(ctx, -36, -41, 8, 96, "#b77a45");
      drawWoodBox(ctx, 28, -41, 8, 96, "#b77a45");
      ctx.fillStyle = "#b77a45";
      ctx.fillRect(-30, 20, 60, 5);
      fillRR(ctx, -40, -55, 80, 14, 6, "#ff4fa3", "rgba(120,20,70,0.4)");
    },
  },
  basket: {
    name: "Laundry basket",
    category: "moveable",
    material: "plastic",
    parts: basketParts,
    draw(ctx) {
      ctx.fillStyle = "rgba(60,200,220,0.22)";
      ctx.beginPath();
      ctx.moveTo(-60, -48);
      ctx.lineTo(60, -48);
      ctx.lineTo(56, 50);
      ctx.lineTo(-56, 50);
      ctx.closePath();
      ctx.fill();
      fillPolys(ctx, basketParts().map((p) => p.v), "#2ec4e6", "#1a8aa8");
      ctx.strokeStyle = "rgba(26,138,168,0.6)";
      ctx.lineWidth = 2;
      for (let y = -30; y < 40; y += 16) {
        ctx.beginPath();
        ctx.moveTo(-58, y);
        ctx.lineTo(58, y);
        ctx.stroke();
      }
      fillRR(ctx, -66, -54, 132, 8, 4, "#22a9cc");
    },
  },
  box: {
    name: "Cardboard box",
    category: "moveable",
    material: "wood",
    parts: () => [P(rect(0, 0, 120, 100))],
    draw(ctx) {
      fillRR(ctx, -60, -50, 120, 100, 3, "#e8b36f", "#a8763c");
      ctx.fillStyle = "#f5cb8a";
      ctx.fillRect(-12, -50, 24, 100);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(-60, -40);
      ctx.lineTo(60, -40);
      ctx.stroke();
    },
  },

  // inventory -----------------------------------------------------------
  legoLong: {
    name: "Long Lego beam",
    category: "inventory",
    group: "Lego",
    material: "lego",
    parts: legoParts(220),
    ends: topEnds(220, 7),
    draw: drawLego(220, LEGO_COLORS.legoLong),
  },
  legoShort: {
    name: "Short Lego beam",
    category: "inventory",
    group: "Lego",
    material: "lego",
    parts: legoParts(110),
    ends: topEnds(110, 7),
    draw: drawLego(110, LEGO_COLORS.legoShort),
  },
  book: {
    name: "Book",
    category: "inventory",
    group: "Household",
    material: "book",
    parts: () => [P(rect(0, 0, 100, 24))],
    ends: topEnds(100, 12),
    draw(ctx, it) {
      const c = hashColor(it.id ?? 0, BOOK_COLORS);
      fillRR(ctx, -50, -12, 100, 24, 3, "#fffaf0", "rgba(0,0,0,0.3)");
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = -6; y <= 6; y += 4) ctx.fillRect(-46, y, 92, 1);
      fillRR(ctx, -50, -12, 100, 6, 2, c);
      fillRR(ctx, -50, 6, 100, 6, 2, c);
      fillRR(ctx, -50, -12, 10, 24, 2, c);
      ctx.fillStyle = "rgba(255,215,0,0.7)";
      ctx.fillRect(-47, -4, 4, 8);
    },
  },
  pillow: {
    name: "Pillow",
    category: "inventory",
    group: "Household",
    material: "soft",
    parts: () => [P([
      { x: -65, y: -12 }, { x: -55, y: -20 }, { x: 55, y: -20 }, { x: 65, y: -12 },
      { x: 65, y: 12 }, { x: 55, y: 20 }, { x: -55, y: 20 }, { x: -65, y: 12 },
    ])],
    draw(ctx) {
      fillRR(ctx, -65, -20, 130, 40, 16, "#e6d2ff", "#9b6bff");
      ctx.strokeStyle = "rgba(155,107,255,0.6)";
      ctx.setLineDash([4, 4]);
      rr(ctx, -58, -14, 116, 28, 12);
      ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  rug: {
    name: "Rug",
    category: "inventory",
    group: "Household",
    material: "rug",
    floorOnly: true,
    rotatable: false,
    parts: () => [P(rect(0, 0, 200, 6))],
    draw(ctx) {
      fillRR(ctx, -100, -3, 200, 6, 2, "#e8408a");
      ctx.fillStyle = "#ffd23f";
      for (let x = -92; x < 96; x += 16) ctx.fillRect(x, -2, 8, 2);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 1;
      for (const s of [-1, 1]) {
        for (let y = -2; y <= 2; y += 2) {
          ctx.beginPath();
          ctx.moveTo(s * 100, y);
          ctx.lineTo(s * 106, y);
          ctx.stroke();
        }
      }
    },
  },
  domino: {
    name: "Domino",
    category: "inventory",
    group: "Toys",
    material: "wood",
    parts: () => [P(rect(0, 0, DOMINO_W, DOMINO_H))],
    draw(ctx) {
      fillRR(ctx, -DOMINO_W / 2, -DOMINO_H / 2, DOMINO_W, DOMINO_H, 3, "#4b2a9e", "#2a1466");
      ctx.fillStyle = "#fff";
      ctx.fillRect(-5, -1, 10, 2);
      for (const y of [-20, -10, 10, 20]) {
        ctx.beginPath();
        ctx.arc(0, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  trackStraight: {
    name: "Train track (straight)",
    label: "Straight track",
    category: "inventory",
    group: "Train",
    material: "track",
    parts: () => [P(rect(0, 0, TRACK_W, 8))],
    ends: topEnds(TRACK_W, 4),
    draw(ctx) {
      drawRail(ctx, -TRACK_W / 2, TRACK_W / 2);
    },
  },
  trackCurved: {
    name: "Train track (curved)",
    label: "Curved track",
    category: "inventory",
    group: "Train",
    material: "track",
    parts: curveParts,
    ends: [
      { x: CURVE_C.x + Math.cos(CURVE_A0) * CURVE_R, y: CURVE_C.y + Math.sin(CURVE_A0) * CURVE_R },
      { x: CURVE_C.x + Math.cos(CURVE_A1) * CURVE_R, y: CURVE_C.y + Math.sin(CURVE_A1) * CURVE_R },
    ],
    draw(ctx) {
      const { x: cx, y: cy } = CURVE_C;
      // sleepers on the outer side
      ctx.strokeStyle = "#c27a3a";
      ctx.lineWidth = 9;
      for (let i = 0; i <= 8; i++) {
        const a = CURVE_A0 + ((CURVE_A1 - CURVE_A0) * (i + 0.5)) / 9.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (CURVE_R + 6), cy + Math.sin(a) * (CURVE_R + 6));
        ctx.lineTo(cx + Math.cos(a) * (CURVE_R + 18), cy + Math.sin(a) * (CURVE_R + 18));
        ctx.stroke();
      }
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#5b636b";
      ctx.beginPath();
      ctx.arc(cx, cy, CURVE_R + 4, CURVE_A1, CURVE_A0);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#a9b1b9";
      ctx.stroke();
    },
  },
  carriage: {
    name: "Train carriage",
    category: "inventory",
    group: "Train",
    material: "metal",
    parts: () => [
      P(box(-75, 4, 75, 22)),
      P(box(-75, -22, -65, 4)),
      P(box(65, -22, 75, 4)),
      P(circle(-45, 30, 12, 8)),
      P(circle(45, 30, 12, 8)),
    ],
    draw(ctx) {
      ctx.fillStyle = "#2b2b2b";
      for (const x of [-45, 45]) {
        ctx.beginPath();
        ctx.arc(x, 30, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#999";
        ctx.beginPath();
        ctx.arc(x, 30, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2b2b";
      }
      fillRR(ctx, -75, 4, 150, 18, 3, "#2ec27e", "#17804f");
      fillRR(ctx, -75, -22, 10, 28, 2, "#4fe09a", "#17804f");
      fillRR(ctx, 65, -22, 10, 28, 2, "#4fe09a", "#17804f");
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(-60, 10, 120, 3);
      ctx.fillStyle = "#555";
      ctx.fillRect(-85, 10, 10, 5);
      ctx.fillRect(75, 10, 10, 5);
    },
  },
  tube: {
    name: "Cardboard tube",
    category: "inventory",
    group: "Household",
    material: "cardboard",
    parts: () => [
      P(rect(0, -(TUBE_IN + TUBE_T) / 2, TUBE_L, TUBE_T)),
      P(rect(0, (TUBE_IN + TUBE_T) / 2, TUBE_L, TUBE_T)),
    ],
    ends: topEnds(TUBE_L, -TUBE_IN / 2),
    draw(ctx) {
      const h = TUBE_IN + TUBE_T * 2;
      ctx.fillStyle = "rgba(240,170,90,0.3)";
      ctx.fillRect(-TUBE_L / 2, -h / 2, TUBE_L, h);
      ctx.strokeStyle = "rgba(140,100,55,0.35)";
      ctx.lineWidth = 2;
      for (let x = -TUBE_L / 2 + 10; x < TUBE_L / 2; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, -h / 2);
        ctx.lineTo(x + 18, h / 2);
        ctx.stroke();
      }
      fillRR(ctx, -TUBE_L / 2, -h / 2, TUBE_L, TUBE_T, 2, "#eaa65e", "#a8682f");
      fillRR(ctx, -TUBE_L / 2, h / 2 - TUBE_T, TUBE_L, TUBE_T, 2, "#eaa65e", "#a8682f");
      ctx.fillStyle = "#8c6437";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse((s * TUBE_L) / 2, 0, 5, h / 2, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#8c6437";
        ctx.stroke();
      }
    },
  },
  dollhouse: {
    name: "Doll house",
    category: "inventory",
    group: "Toys",
    material: "wood",
    parts: dollhouseParts,
    draw: drawDollhouse,
  },
};

export const GROUP_ORDER = ["Lego", "Household", "Train", "Toys"];

export function typeDef(type) {
  const def = ITEM_TYPES[type];
  if (!def) throw new Error(`Unknown item type: ${type}`);
  return def;
}

export function isRotatable(def) {
  return def.category !== "fixed" && def.rotatable !== false;
}

// Horizontal mirror. A vertical mirror is a horizontal one plus a half turn,
// so it also needs the item to be rotatable.
export function isFlippable(def) {
  return def.category !== "fixed" && def.flippable !== false;
}

export function materialOf(def, part) {
  return MATERIALS[(part && part.mat) || def.material];
}

export function hintOf(def) {
  return MATERIALS[def.material].hint;
}
