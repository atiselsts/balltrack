# Ball Track — Game Specification

## 1. Concept

A 2D side-view physics puzzle in the browser. A small bouncy ball is dropped into a room. The player builds a path out of everyday household items (pillows, Lego, toy train parts, books, and so on) so the ball rolls and bounces into a **light switch** on the wall. A direct hit wins the level and turns the lights on.

The game is a prototype. The goal is to find out whether building and then watching the ball run is fun.

## 2. Global decisions (apply to v1 and v2)

| Topic | Decision |
|---|---|
| Platform | Browser, desktop-first (mouse + keyboard) |
| View | 2D side view (cross-section of rooms) |
| Physics | Matter.js (pinned version, loaded from CDN), no build step |
| Graphics | Everything drawn procedurally on `<canvas>`; no image assets |
| Sound | None |
| Core loop | **Build** phase → press **Go** → **Run** phase → **Reset** back to Build (placements kept) |
| Ball start | Dropped from a fixed, level-defined spawn point (shown as a marker/hand in Build) |
| Inventory | Fixed per level: an exact list of items and their counts |
| Win | Ball directly touches the light switch (any speed) |
| Fail states | None. If the ball stops or leaves the play area, the player resets |
| Score | None |

## 3. Core gameplay

### 3.1 Phases

**Build phase**
- Physics paused. The ball sits at its spawn marker.
- The player drags items from the inventory panel into the room.
- Placed and moveable items can be selected, dragged, rotated and (for inventory items) returned to the inventory.
- A placement is invalid if the item overlaps a wall, fixed object, other item, the spawn marker or the switch. Invalid placements are shown in red and can't be dropped; the item snaps back to where it was picked up.

**Run phase**
- Pressing **Go** (or Space) starts the simulation and drops the ball.
- No editing during Run.
- **Reset** (or Space/R) stops the simulation and restores the Build state exactly, including any fallen dominoes.
- If the ball is nearly still for ~2 s, or leaves the level bounds, a "Ball stopped — Reset?" hint appears. It's only a hint; nothing is forced.

**Win**
- On the ball's first contact with the switch: the switch toggles, the room's dark overlay fades out (lights on), and a "Level complete" panel offers **Next level** / **Replay**.

### 3.2 Object categories

| Category | Who places it | Can the player move it? | Examples |
|---|---|---|---|
| **Fixed** | Level | No | Walls, floor, bed, wardrobe, desk, stairs |
| **Moveable** | Level (initial position) | Yes — drag/rotate, but can't be removed | Chairs, stools, laundry basket |
| **Inventory** | Player | Yes — place, drag, rotate, return | Pillows, Lego, books, track pieces, dominoes… |

Moveable and inventory items behave as **static** bodies during Run (they don't move when hit), except dominoes (see 5.3).

### 3.3 Controls

| Action | Input |
|---|---|
| Place item | Drag from inventory into the room |
| Move item | Drag it |
| Rotate selected | `Q` / `E` (15° steps), or mouse wheel while dragging |
| Flip selected horizontally | `F` (for asymmetric items: curved track, domino row direction) |
| Return to inventory | Drag back onto panel, or `Delete`/`Backspace` |
| Go / Reset | Space, or the on-screen button |
| Restart level (clear all placements) | On-screen button, with confirm |

### 3.4 Physics tuning (starting values, to tune)

- Ball: radius ~12 px (world units), restitution 0.8, low friction, light. Should feel like a bouncy rubber ball.
- Gravity: Matter default (1), scaled so a drop from ceiling height feels natural.
- Each material sets restitution (bounciness) and friction for the surface (see item tables).
- Fixed timestep (60 Hz). Use substeps or a speed cap to avoid tunnelling through thin items.

## 4. v1 — Starter prototype

**Goal:** the smallest playable version that tests the core loop.

### 4.1 Scope

- **1 level:** a single bedroom that fits on one screen (no camera movement).
- Build / Go / Reset loop, inventory panel, drag + rotate placement, overlap validation.
- Win detection and the lights-on effect.
- Fixed objects, one moveable object, three inventory item types.

### 4.2 v1 items

| Item | Category | Shape (2D) | Behaviour |
|---|---|---|---|
| Walls / floor / ceiling | Fixed | Rectangles | Normal bounce |
| Bed | Fixed | Box with headboard; mattress top | Mattress top: soft (low restitution ~0.3) |
| Desk | Fixed | Tabletop on legs; ball can pass under | Hard surface |
| Chair | Moveable | Seat + backrest + legs | Hard surface; can serve as a step or a wall |
| Lego beam (short / long) | Inventory | Thin rectangle with stud bumps drawn on top | Rigid ramp or wall; normal friction |
| Book | Inventory | Rectangle, coloured spine | Hard, slightly bouncy; for steps, stops and redirects |
| Pillow | Inventory | Rounded rectangle | Soft: restitution ~0.1, high friction. Catches the ball and kills its bounce |
| Light switch | Fixed (goal) | Small plate + toggle on a wall | Sensor; ball contact = win |

### 4.3 v1 level: "Bedroom"

- Ball spawn: high up, near the left wall (e.g. falling from a shelf).
- Switch: on the right wall, too high to reach with a plain bounce. The player must redirect the ball upward or across.
- Example inventory: 3 × long Lego beam, 2 × short Lego beam, 3 × book, 2 × pillow.
- The fixed bed and desk act as obstacles and helpers. The moveable chair is a useful step.
- Design the level so it has at least one intended solution, verified by playtesting.

### 4.4 v1 UI

- Canvas fills the window, keeping its aspect ratio (logical size 1600 × 900, letterboxed).
- Bottom or side inventory panel: an icon and a remaining count for each item type.
- Top bar: level name, Go/Reset button, Restart button.
- Room starts dim (dark overlay). On win it brightens.

### 4.5 v1 technical structure

```
index.html          – page, canvas, UI markup, Matter.js <script> (pinned CDN version)
src/main.js         – bootstrap, game loop, phase state machine
src/physics.js      – Matter.js world setup, body factories, collision handling
src/items.js        – item type definitions (shape, material, draw function, category)
src/render.js       – canvas drawing of room, items, ball, overlay
src/input.js        – drag/drop, selection, rotation, validation
src/ui.js           – inventory panel, buttons, win panel
src/levels/level1.js– level data
```

Plain ES modules, no bundler. Serve with any static server (e.g. `python3 -m http.server`).

**Level data format (sketch):**

```js
export default {
  name: "Bedroom",
  size: { w: 1600, h: 900 },
  spawn: { x: 180, y: 120 },
  switch: { x: 1560, y: 300 },
  fixed: [
    { type: "bed",  x: 300, y: 780 },
    { type: "desk", x: 1100, y: 740 },
  ],
  moveable: [
    { type: "chair", x: 800, y: 790, angle: 0 },
  ],
  inventory: { legoLong: 3, legoShort: 2, book: 3, pillow: 2 },
};
```

Item types are data-driven. Adding an item means adding one entry in `items.js` (geometry, material, category, draw function).

### 4.6 v1 done when

- The Bedroom level can be solved, and the win shows reliably.
- Reset always restores the exact pre-run state.
- Items can't be placed overlapping anything.
- Runs in current Chrome and Firefox with no console errors.

## 5. v2 — Full feature set

Builds on v1. **No new mechanics** beyond what's listed here: no fails, no scoring, no sound, still one ball, one switch per level, dropped ball.

### 5.1 Scope

- **3 levels**, growing in size:
  1. **Bedroom**: the v1 level, maybe re-tuned with new items.
  2. **Apartment**: several adjacent rooms on one floor (e.g. kitchen, living room, hallway). The ball travels across rooms through doorways.
  3. **House**: bigger multi-room layout, including a stairway, so paths can run downward between levels of the house.
- **Camera:** levels larger than the screen get pan (drag the background, or arrow keys/WASD) and zoom (mouse wheel when not dragging an item; "fit level" button). During Run the camera can optionally follow the ball (toggle).
- **Level select** screen. Completion progress is kept in `localStorage` (wrapped in try/catch; the game works without it).
- All the new items below.

### 5.2 New items

| Item | Category | Shape (2D) | Behaviour |
|---|---|---|---|
| Train track — straight | Inventory | Thin rail with sleepers drawn under it | Very low friction ramp; guides the ball fast |
| Train track — curved | Inventory | Arc segment (built from several small static segments) | Low friction; turns the ball's direction (e.g. ramp → upward kick). Flippable |
| Train carriage | Inventory | Box body on wheels | **Static.** A platform/bump with a raised rim so the ball can sit or ride over it |
| Cardboard tube | Inventory | Two parallel walls (a channel), open at both ends | The ball enters one end and comes out the other, keeping its momentum; rotatable to make chutes |
| Domino | Inventory | Tall thin rectangle | Scripted toppling (5.3) |
| Rug | Inventory | Very thin floor-hugging strip | Placed on floors only. High friction: slows or stops the ball |
| Doll house | Inventory (large, count usually 1) | Small house: walls, floors, door and window openings, internal ramp/stairs | Static structure. The ball can enter through openings, roll down inside and exit lower down |
| Sofa, kitchen counter, table, stairs, shelves, doors frames | Fixed (level-dependent) | Furniture shapes | Materials as fitting (sofa = soft, counter = hard) |
| Stool, laundry basket, box | Moveable | Furniture shapes | Static when hit, like the chair |

### 5.3 Domino behaviour

Dominoes don't use free physics. They have a simple scripted fall:

- A standing domino is a static body.
- When the **ball** or a **falling domino** touches it, it starts to fall away from the contact side. It rotates 90° around its bottom edge over ~0.3 s (eased), animated by setting its angle directly.
- While falling, its swept area is checked against the next standing domino. Any domino it reaches is triggered in the same direction (chain reaction).
- Once fallen, it stays static and flat. The ball can roll over it.
- A domino that hits anything else while falling (wall, item) stops at that angle.
- Reset stands all dominoes back up.
- In v2 a domino **doesn't** trigger the light switch; only the ball does (see open questions).

### 5.4 v2 UI additions

- Level select screen with completed marks.
- Inventory panel scrolls or groups by category (Lego, train, household, …) once there are many item types.
- Minimap or "fit level" button for the large levels.
- Small tooltip with the item's name and material hint ("soft — absorbs bounce").

### 5.5 v2 done when

- All three levels can be solved, and each has been playtested.
- Every item type behaves as described, and the domino chain works reliably.
- Pan/zoom and placement work correctly at every zoom level (screen ↔ world conversion).
- Reset restores everything, including dominoes.

## 6. Future ideas (not in v1 or v2)

- Two-story house level and more levels
- Thrown/launched ball, other start devices
- Moving carriages and toy train locomotive
- Scoring (fewer items = more stars), time limits
- Multiple switches, multiple balls
- Sound effects
- Level editor; touch/mobile controls

## 7. Open questions

1. **Train carriages:** static for now (per "static except dominoes"). Should they move later (rolling on track when hit)?
2. **Domino → switch:** should a falling domino be allowed to flip the switch, or only the ball?
3. **House level:** v2 has 3 levels: Bedroom, Apartment, House (with stairs). The two-story house is deferred to future work. Is that the progression you want?
4. **Doll house:** inventory item (the player places it) or fixed in a level?
