/** Die fixe Ebene ueber dem Dashboard: Tier, Sprechblase, Haeufchen, Menue, Statistik. */

import { BuildYard, BUILDS_CSS } from "./builds.js";
import { PET_BASE_SIZE } from "./const.js";
import { RIG_CSS, Rig } from "./rig.js";
import { clamp, ratio } from "./util.js";

const OVERLAY_CSS = `
  .pixel-overlay { position:fixed; inset:0; z-index:6; pointer-events:none; overflow:hidden; font-family:Roboto,system-ui,sans-serif; }
  /* Eigene Fallbacks fuer den Fall, dass keine HA-Theme-Variablen erben (fremdes Frontend,
     Demo-Seite). Sie folgen der erkannten Helligkeit, damit das Panel nie unlesbar wird. */
  .pixel-overlay { --pixel-panel-bg:#1e1e1e; --pixel-panel-fg:#ededed; --pixel-panel-muted:#aaa; --pixel-panel-line:#444; --pixel-panel-btn:#2a2a2a; }
  .pixel-overlay.theme-light { --pixel-panel-bg:#fff; --pixel-panel-fg:#212121; --pixel-panel-muted:#707070; --pixel-panel-line:#dadada; --pixel-panel-btn:#f1f1f1; }
  .pixel-overlay .pixel-pet { position:absolute; left:0; top:0; pointer-events:auto; cursor:pointer; touch-action:manipulation; will-change:transform; }
  /* Die Sprechblase bleibt bewusst weiss mit hartem Nullblur-Schatten: gestalterisches
     Pixel-Art-Element und in beiden Themes gut lesbar. Nicht "korrigieren". */
  .pixel-bubble { position:absolute; font-family:'Press Start 2P',ui-monospace,monospace; font-size:9px; line-height:1.5; background:#fff; color:#111; padding:8px 9px; border-radius:2px; box-shadow:3px 3px 0 #000; max-width:170px; white-space:pre-line; opacity:0; transition:opacity .15s; }
  .pixel-bubble.on { opacity:1; }
  .pixel-bubble::after { content:""; position:absolute; left:12px; bottom:-6px; border:6px solid transparent; border-top-color:#fff; border-bottom:0; }
  .pixel-fx { position:absolute; font-family:'Press Start 2P',ui-monospace,monospace; animation:pixel-rise 1.3s forwards; }
  .pixel-fx.heart { color:#ff8a80; font-size:12px; } .pixel-fx.zzz { color:#8ab4f8; font-size:10px; }
  @keyframes pixel-rise { to { transform:translateY(-40px); opacity:0; } }
  .pixel-poop { position:absolute; font-size:22px; pointer-events:auto; cursor:pointer; filter:drop-shadow(0 2px 0 #000); }
  .pixel-menu { position:absolute; display:flex; gap:4px; background:var(--card-background-color, var(--pixel-panel-bg)); border:1px solid var(--divider-color, var(--pixel-panel-line)); border-radius:10px; padding:6px; pointer-events:auto; box-shadow:0 6px 20px rgba(0,0,0,.3); }
  .pixel-menu button { font-size:20px; line-height:1; background:var(--secondary-background-color, var(--pixel-panel-btn)); border:1px solid var(--divider-color, var(--pixel-panel-line)); border-radius:8px; width:40px; height:40px; cursor:pointer; color:var(--primary-text-color, var(--pixel-panel-fg)); }
  .pixel-menu button:active { filter:brightness(1.3); }
  .pixel-menu button:focus-visible { outline:2px solid var(--primary-color, #03a9f4); }
  .pixel-stats { position:absolute; background:var(--card-background-color, var(--pixel-panel-bg)); color:var(--primary-text-color, var(--pixel-panel-fg)); border:1px solid var(--divider-color, var(--pixel-panel-line)); border-radius:10px; padding:10px 12px; font-size:12px; min-width:190px; pointer-events:auto; box-shadow:0 6px 20px rgba(0,0,0,.3); }
  .pixel-stats h4 { margin:0 0 6px; font-size:13px; font-weight:500; }
  .pixel-stats .row { display:flex; align-items:center; gap:8px; margin:4px 0; }
  .pixel-stats .row span:first-child { width:80px; color:var(--secondary-text-color, var(--pixel-panel-muted)); }
  .pixel-stats .bar { flex:1; height:6px; background:var(--divider-color, var(--pixel-panel-line)); border-radius:3px; overflow:hidden; }
  .pixel-stats .bar b { display:block; height:100%; background:var(--success-color, #66bb6a); }
  .pixel-stats .bar b.low { background:var(--warning-color, #ffb300); }
  .pixel-stats .meta { margin-top:6px; color:var(--secondary-text-color, var(--pixel-panel-muted)); font-size:11px; }
  @media (prefers-reduced-motion: reduce) { .pixel-fx { animation:none; opacity:.7; } }
`;

export class Overlay {
  constructor(config) {
    this.config = config;
    this.el = document.createElement("div");
    this.el.className = "pixel-overlay";
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS + RIG_CSS + BUILDS_CSS;
    this.el.appendChild(style);

    this.petEl = document.createElement("div");
    this.petEl.setAttribute("role", "img");
    this.petEl.setAttribute("aria-label", "Pixel");
    this.el.appendChild(this.petEl);
    this.rig = new Rig(this.petEl);

    this.bubbleEl = document.createElement("div");
    this.bubbleEl.className = "pixel-bubble";
    this.el.appendChild(this.bubbleEl);

    this.poops = []; // { el, rx, ry } - Verhaeltnisse statt Pixel
    this.builds = null; // BuildYard, vom Brain gesetzt (braucht den Service-Aufruf)
    this.menuEl = null;
    this.statsEl = null;
    this.pos = { x: 40, y: 200 };
    this.size = PET_BASE_SIZE * (config.scale || 1);
    this._bubbleTimer = null;
    document.body.appendChild(this.el);
  }

  /** Reicht Hell/Dunkel an das Tier durch; die Klasse am Overlay steuert die Panel-Fallbacks. */
  setTheme(mode) {
    this.el.classList.toggle("theme-light", mode === "light");
    this.rig.setTheme(mode);
  }

  destroy() {
    this.el.remove();
  }

  place(x, y) {
    this.pos.x = x;
    this.pos.y = y;
    this.petEl.style.width = this.petEl.style.height = `${this.size}px`;
    this.petEl.style.transform = `translate(${x}px, ${y - this.size}px)`;
    this._positionBubble();
    if (this.menuEl) this._positionFloating(this.menuEl);
  }

  /** Nur der Teil oberhalb ``clipBelowY`` bleibt sichtbar (Verstecken hinter einer Karte). */
  clipBelow(clipBelowY) {
    if (clipBelowY == null) {
      this.petEl.style.clipPath = "";
      return;
    }
    const hiddenPx = Math.max(0, this.pos.y - clipBelowY);
    this.petEl.style.clipPath = `inset(-10px -10px ${hiddenPx}px -10px)`;
  }

  say(text, ms = 2200) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add("on");
    this._positionBubble();
    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => this.bubbleEl.classList.remove("on"), ms);
  }

  _positionBubble() {
    if (!this.bubbleEl.classList.contains("on")) return;
    const w = this.bubbleEl.offsetWidth;
    const x = clamp(this.pos.x - 6, 4, window.innerWidth - w - 4);
    this.bubbleEl.style.left = `${x}px`;
    this.bubbleEl.style.top = `${this.pos.y - this.size - this.bubbleEl.offsetHeight - 10}px`;
  }

  fx(cls, text, dx = 0) {
    const e = document.createElement("div");
    e.className = `pixel-fx ${cls}`;
    e.textContent = text;
    e.style.left = `${this.pos.x + this.size * 0.3 + dx}px`;
    e.style.top = `${this.pos.y - this.size - 8}px`;
    this.el.appendChild(e);
    setTimeout(() => e.remove(), 1300);
  }

  /**
   * Haeufchen als einzeln tappbare Elemente. Gespeichert wird das Verhaeltnis zur Bounds-Box,
   * nicht die Pixelposition: so wandern sie bei Resize und Scroll korrekt mit, statt neu
   * gewuerfelt zu werden oder auf einer Linie zu kleben.
   * ``spawn()`` liefert den Ort fuer ein neu hinzugekommenes Haeufchen.
   */
  syncPoop(count, bounds, onClean, spawn) {
    while (this.poops.length > count) this.poops.pop().el.remove();
    while (this.poops.length < count) {
      const { x, y } = spawn();
      const entry = {
        el: document.createElement("div"),
        rx: ratio(x, bounds.left, bounds.right),
        ry: ratio(y, bounds.top, bounds.bottom),
      };
      entry.el.className = "pixel-poop";
      entry.el.textContent = "💩";
      entry.el.title = "clean";
      entry.el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        // Sofort lokal entfernen, damit genau das angetippte verschwindet und nicht
        // irgendeines, wenn der neue Zaehler aus dem Backend eintrifft.
        this.removePoop(entry);
        onClean();
      });
      this.el.appendChild(entry.el);
      this.poops.push(entry);
    }
    this.placePoop(bounds);
  }

  /** Rechnet die gespeicherten Verhaeltnisse in die aktuelle Bounds-Box um. */
  placePoop(bounds) {
    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    for (const p of this.poops) {
      p.el.style.left = `${clamp(bounds.left + p.rx * w, bounds.left + 4, bounds.right - 30)}px`;
      p.el.style.top = `${clamp(bounds.top + p.ry * h, bounds.top + 4, bounds.bottom - 30)}px`;
    }
  }

  /** Legt die Verwaltung der gebauten Objekte an; der Callback braucht den Service. */
  attachBuilds(onRemove) {
    this.builds = new BuildYard(this.el, onRemove);
    return this.builds;
  }

  removePoop(entry) {
    const i = this.poops.indexOf(entry);
    if (i < 0) return;
    this.poops.splice(i, 1)[0].el.remove();
  }

  /* Aktionsmenü beim Tippen */
  toggleMenu(entries) {
    if (this.menuEl) return this.closeFloating();
    this.closeFloating();
    const m = document.createElement("div");
    m.className = "pixel-menu";
    m.setAttribute("role", "menu");
    for (const { icon, label, onClick } of entries) {
      const b = document.createElement("button");
      b.textContent = icon;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.closeFloating();
        onClick();
      });
      m.appendChild(b);
    }
    this.el.appendChild(m);
    this.menuEl = m;
    this._positionFloating(m);
    return undefined;
  }

  showStats(html) {
    this.closeFloating();
    const s = document.createElement("div");
    s.className = "pixel-stats";
    s.innerHTML = html;
    s.addEventListener("click", (ev) => ev.stopPropagation());
    this.el.appendChild(s);
    this.statsEl = s;
    this._positionFloating(s);
  }

  closeFloating() {
    this.menuEl?.remove();
    this.statsEl?.remove();
    this.menuEl = this.statsEl = null;
  }

  _positionFloating(el) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = this.pos.x + this.size / 2 - w / 2;
    x = clamp(x, 6, window.innerWidth - w - 6);
    let y = this.pos.y - this.size - h - 8;
    if (y < 60) y = this.pos.y + 8;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}
