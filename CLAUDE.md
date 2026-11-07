# Ball Track

Client-only 2D side-view physics puzzle. The player builds a path from household items so a bouncy
ball hits a light switch. `spec.md` is the original idea and `full_spec.md` the full design (v1 + v2).
See `README.md` for controls and how to run it.

## Layout

- `src/main.js`: bootstrap, game loop, Build / Run / Won phases, saved progress
- `src/physics.js`: Matter.js world, body factories, collisions, scripted domino fall
- `src/items.js`: materials and item types (geometry, category, draw function)
- `src/geometry.js`: polygon helpers
- `src/render.js`: camera and all canvas drawing
- `src/input.js`: drag and drop, selection, rotation, placement validation, end snapping
- `src/ui.js`: inventory panel, buttons, level select, win panel
- `src/levels/levelN.js`: level data, including each level's stored `solution`
- `tools/verify-levels.mjs`: headless check of every stored solution

## Running and checking

ES modules need a server, so `file://` won't work: run `python3 -m http.server` and open
`http://localhost:8000/`. Add `?solution` to pre-place the level's stored solution.

There is no build step or test suite. After changing physics, materials, item geometry or levels,
run the level check (the commands are in `README.md`). It needs a local copy of the Matter.js build
pinned in `index.html`.

## Design decisions that are easy to undo by accident

- Matter.js combines restitution with `max()` and friction with `min()`. So the ball has restitution
  0 and friction 1, and each surface's material decides. Don't tune bounce on the ball.
- Moveable and inventory items are static during Run. Only the ball moves freely.
- Dominoes are not free physics bodies. They fall by script in `physics.js`, and only the ball can
  trigger the switch.
- Reset must restore the exact pre-run state, including fallen dominoes.
- There are deliberately no fail states, scoring or sound. If the ball stops or leaves the level, the
  game only hints at a reset.
- `SUBSTEPS` and `MAX_SPEED` in `physics.js` stop the ball tunnelling through thin items. Physics
  runs at a fixed timestep, so stored solutions depend on these values.
- The code wins where it differs from `full_spec.md`, which holds starting values (for example,
  `GRAVITY` is 1.5).

## Coding practices

- Keep the plain ES modules with no bundler. Matter.js stays a global from the pinned CDN `<script>`
  in `index.html`, and `verify-levels.mjs` should use that same version.
- All graphics are drawn on canvas: no image assets.
- `physics.js`, `input.js`, `render.js`, `items.js` and the level files are loaded in Node by the
  verifier, so they must not touch the DOM at module load.
- Adding an item type means one entry in `ITEM_TYPES`, used for both the body and the inventory icon.
- Adding a level means updating the imports and `G.levels` in `src/main.js` and the level list in
  `tools/verify-levels.mjs`, and giving it a verified `solution`.
- Any change that breaks a stored solution needs that solution re-tuned, not removed.
- Wrap `localStorage` access in try/catch. The key is `balltrack.progress.v1`.
- Double quotes, semicolons, two-space indent. Comments explain why.
