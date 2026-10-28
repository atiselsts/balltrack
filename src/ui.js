// DOM UI: top bar, inventory panel, tooltip, hint toast, win panel,
// confirm dialog and the level select screen.
import { ITEM_TYPES, GROUP_ORDER, typeDef, hintOf } from "./items.js";
import { drawItemIcon, drawWorld } from "./render.js";
import { levelFixedItems } from "./physics.js";

const $ = (id) => document.getElementById(id);

export function initUI(G) {
  const panel = $("inventory");
  const tooltip = $("tooltip");
  const hint = $("hint");
  const win = $("win");
  const confirmBox = $("confirm");
  const select = $("select");
  const help = $("help");
  let confirmResolve = null;

  // Buttons must never keep focus, or Space would also "click" them.
  for (const b of document.querySelectorAll("button")) {
    b.addEventListener("mousedown", (e) => e.preventDefault());
  }

  $("btn-go").addEventListener("click", () => G.toggleRun());
  $("btn-restart").addEventListener("click", async () => {
    if (await ui.confirm("Clear all placed items and restart this level?")) G.restart();
  });
  $("btn-fit").addEventListener("click", () => G.fitView());
  $("btn-follow").addEventListener("click", () => {
    G.followBall = !G.followBall;
    ui.syncButtons();
  });
  $("btn-levels").addEventListener("click", () => G.showLevelSelect());
  $("btn-help").addEventListener("click", () => help.classList.toggle("hidden"));
  help.addEventListener("click", () => help.classList.add("hidden"));
  $("win-next").addEventListener("click", () => G.nextLevel());
  $("win-replay").addEventListener("click", () => G.reset());
  $("hint-reset").addEventListener("click", () => G.reset());
  $("confirm-yes").addEventListener("click", () => closeConfirm(true));
  $("confirm-no").addEventListener("click", () => closeConfirm(false));

  function closeConfirm(v) {
    confirmBox.classList.add("hidden");
    if (confirmResolve) confirmResolve(v);
    confirmResolve = null;
  }

  function slotTooltip(type, count) {
    const def = typeDef(type);
    return `<b>${def.name}</b><span>${hintOf(def)}</span>` + (count !== undefined ? `<i>${count} left</i>` : "");
  }

  function placeTooltip(x, y) {
    tooltip.classList.remove("hidden");
    const r = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(window.innerWidth - r.width - 8, x + 14)}px`;
    tooltip.style.top = `${Math.max(8, y - r.height - 12)}px`;
  }

  const ui = {
    renderInventory() {
      panel.innerHTML = "";
      const types = Object.keys(G.level.inventory);
      const groups = new Map();
      for (const t of types) {
        const g = typeDef(t).group || "Other";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(t);
      }
      const order = [...GROUP_ORDER, ...[...groups.keys()].filter((g) => !GROUP_ORDER.includes(g))];
      for (const g of order) {
        if (!groups.has(g)) continue;
        const box = document.createElement("div");
        box.className = "group";
        box.innerHTML = `<div class="group-title">${g}</div><div class="slots"></div>`;
        const slots = box.querySelector(".slots");
        for (const t of groups.get(g)) {
          const count = G.inventory[t] || 0;
          const slot = document.createElement("div");
          slot.className = "slot" + (count === 0 ? " empty" : "");
          const c = document.createElement("canvas");
          const dpr = window.devicePixelRatio || 1;
          c.width = 84 * dpr;
          c.height = 46 * dpr;
          c.style.width = "84px";
          c.style.height = "46px";
          const cx = c.getContext("2d");
          cx.scale(dpr, dpr);
          drawItemIcon(cx, t, 84, 46);
          slot.appendChild(c);
          const label = document.createElement("div");
          label.className = "slot-label";
          label.textContent = ITEM_TYPES[t].label || ITEM_TYPES[t].name;
          slot.appendChild(label);
          const badge = document.createElement("div");
          badge.className = "badge";
          badge.textContent = `×${count}`;
          slot.appendChild(badge);
          slot.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            ui.hideTooltip();
            G.startNewDrag(t, e);
          });
          slot.addEventListener("pointermove", (e) => {
            if (G.drag) return;
            tooltip.innerHTML = slotTooltip(t, G.inventory[t] || 0);
            placeTooltip(e.clientX, e.clientY);
          });
          slot.addEventListener("pointerleave", () => ui.hideTooltip());
          slots.appendChild(slot);
        }
        panel.appendChild(box);
      }
      panel.classList.toggle("locked", G.phase !== "build");
    },

    syncButtons() {
      const go = $("btn-go");
      go.textContent = G.phase === "build" ? "▶ Go" : "↺ Reset";
      go.classList.toggle("running", G.phase !== "build");
      $("btn-follow").classList.toggle("on", G.followBall);
      $("btn-follow").title = "Camera follows the ball during Run";
      const big = G.levelIsLarge();
      $("btn-follow").classList.toggle("hidden", !big);
      $("btn-fit").classList.toggle("hidden", !big);
      $("level-name").textContent = `${G.levelIndex + 1}. ${G.level.name}`;
      panel.classList.toggle("locked", G.phase !== "build");
      $("btn-restart").disabled = G.phase !== "build";
    },

    isOverPanel(x, y) {
      const r = panel.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },

    showItemTooltip(type, x, y) {
      tooltip.innerHTML = slotTooltip(type);
      placeTooltip(x, y);
    },

    hideTooltip() {
      tooltip.classList.add("hidden");
    },

    showHint(on) {
      hint.classList.toggle("hidden", !on);
    },

    showWin(on) {
      win.classList.toggle("hidden", !on);
      if (on) {
        const last = G.levelIndex >= G.levels.length - 1;
        $("win-next").textContent = last ? "Level select" : "Next level ▶";
        $("win-title").textContent = `${G.level.name} — complete!`;
      }
    },

    confirm(msg) {
      $("confirm-msg").textContent = msg;
      confirmBox.classList.remove("hidden");
      return new Promise((res) => (confirmResolve = res));
    },

    modalOpen() {
      return !confirmBox.classList.contains("hidden");
    },

    showLevelSelect(levels, progress) {
      const list = $("level-list");
      list.innerHTML = "";
      levels.forEach((lv, i) => {
        const card = document.createElement("button");
        card.className = "level-card" + (progress[lv.id] ? " done" : "");
        card.addEventListener("mousedown", (e) => e.preventDefault());
        const c = document.createElement("canvas");
        const w = 300;
        const h = Math.round((w * 9) / 16);
        const dpr = window.devicePixelRatio || 1;
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        const ctx = c.getContext("2d");
        const s = Math.min(w / lv.size.w, h / lv.size.h);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = "#1a1714";
        ctx.fillRect(0, 0, w, h);
        ctx.translate((w - lv.size.w * s) / 2, (h - lv.size.h * s) / 2);
        ctx.scale(s, s);
        drawWorld(ctx, { level: lv, fixed: levelFixedItems(lv), items: lv.moveable.map((m) => ({ angle: 0, flip: 1, ...m })), light: progress[lv.id] ? 1 : 0.35 });
        card.appendChild(c);
        const t = document.createElement("div");
        t.className = "level-title";
        t.innerHTML = `<span>${i + 1}. ${lv.name}</span>${progress[lv.id] ? '<span class="tick">✓ lights on</span>' : ""}`;
        card.appendChild(t);
        const d = document.createElement("div");
        d.className = "level-desc";
        d.textContent = lv.description || "";
        card.appendChild(d);
        card.addEventListener("click", () => G.loadLevel(i));
        list.appendChild(card);
      });
      select.classList.remove("hidden");
    },

    hideLevelSelect() {
      select.classList.add("hidden");
    },
  };
  return ui;
}
