// Level 1: a single bedroom that fits on one screen.
export default {
  id: "bedroom",
  name: "Bedroom",
  description: "One room, one switch. The bed swallows bounces — build a ramp.",
  size: { w: 1600, h: 900 },
  spawn: { x: 185, y: 110 },
  switch: { x: 1556, y: 480 },
  rooms: [{ x: 30, y: 30, w: 1540, h: 830, wallpaper: "#d8c6a8", stripe: "#cdb894", name: "Bedroom", window: { x: 560, y: 160, w: 240, h: 180 }, picture: { x: 1180, y: 250, w: 180, h: 120 } }],
  walls: [
    { x: 0, y: 0, w: 1600, h: 30 },
    { x: 0, y: 860, w: 1600, h: 40, floor: true },
    { x: 0, y: 0, w: 30, h: 900 },
    { x: 1570, y: 0, w: 30, h: 900 },
  ],
  fixed: [
    { type: "shelf", x: 90, y: 150, w: 120 },
    { type: "bed", x: 320, y: 780 },
    { type: "desk", x: 1150, y: 775 },
  ],
  moveable: [{ type: "chair", x: 760, y: 760, angle: 0 }],
  inventory: { legoLong: 3, legoShort: 2, book: 3, pillow: 2 },
  // Verified in the headless simulation (load with ?solution).
  solution: {
    items: [
      { type: "legoLong", x: 236, y: 244, deg: 30 },
      { type: "legoLong", x: 488, y: 404, deg: 30 },
      { type: "legoLong", x: 704, y: 546, deg: 15 },
      { type: "legoShort", x: 914, y: 636, deg: 15 },
      { type: "legoShort", x: 1459, y: 652, deg: -30 },
    ],
  },
};
