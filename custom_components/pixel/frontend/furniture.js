/** Scannt das Dashboard nach Karten ("Moebel") und findet die Bodenlinie. */

import { cardHostOf, deepElementFromPoint, deepQueryAll } from "./util.js";

export class Furniture {
  constructor(viewEl, ownHost, config) {
    this.viewEl = viewEl;
    this.ownHost = ownHost;
    this.config = config;
    this.cards = [];
    this.floorY = 0;
    this.bounds = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  }

  scan() {
    const root = this.viewEl || document.body;
    const vr = root.getBoundingClientRect();
    this.bounds = {
      top: Math.max(0, vr.top),
      left: Math.max(0, vr.left),
      right: Math.min(window.innerWidth, vr.right || window.innerWidth),
      bottom: Math.min(window.innerHeight, vr.bottom || window.innerHeight),
    };
    const cards = deepQueryAll(root, "ha-card");
    const seen = new Set();
    this.cards = [];
    for (const el of cards) {
      if (this.ownHost && (this.ownHost.contains(el) || this.ownHost.shadowRoot?.contains(el))) continue;
      const host = cardHostOf(el);
      const type = (host?.localName || el.localName || "").replace(/^hui-|-card$/g, "");
      if (this.config.avoid.some((a) => type.includes(a))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 60 || r.height < 40) continue;
      if (r.bottom < this.bounds.top || r.top > this.bounds.bottom) continue;
      const key = `${Math.round(r.left)}:${Math.round(r.top)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tags = (host?.dataset?.pixel || el.dataset?.pixel || "").split(/\s+/);
      this.cards.push({
        el,
        type,
        x1: r.left,
        x2: r.right,
        top: r.top,
        bottom: r.bottom,
        fav: tags.includes("favorite") || this.config.favorites.some((f) => type.includes(f)),
        noclimb: tags.includes("noclimb"),
      });
    }
    const barTop = this._bottomBarTop();
    // floor_margin bleibt der manuelle Hebel; eine erkannte Leiste hebt den Boden zusaetzlich an.
    this.floorY = (barTop ?? this.bounds.bottom) - this.config.floor_margin;
    return this.cards;
  }

  /**
   * Sucht eine fest am unteren Rand klebende Leiste (Navigationsleisten-Cards, eigene Footer)
   * und gibt deren Oberkante zurueck. Bewusst rein geometrisch, damit keine fremde Card
   * namentlich verdrahtet werden muss. Ohne Treffer null.
   */
  _bottomBarTop() {
    if (!document.elementFromPoint) return null;
    const y = Math.round(this.bounds.bottom - 2);
    const width = this.bounds.right - this.bounds.left;
    for (const ratio of [0.15, 0.5, 0.85]) {
      let el = deepElementFromPoint(Math.round(this.bounds.left + width * ratio), y);
      for (let i = 0; i < 20 && el && el !== document.body; i++) {
        if (el.classList?.contains("pixel-overlay")) break; // das eigene Tier zaehlt nicht
        const position = getComputedStyle(el).position;
        if (position === "fixed" || position === "sticky") {
          const r = el.getBoundingClientRect();
          const plausible = r.height > 8 && r.height < window.innerHeight * 0.3 && r.bottom >= this.bounds.bottom - 4;
          if (plausible) return r.top;
        }
        el = el.parentElement || el.getRootNode()?.host || null;
      }
    }
    return null;
  }

  climbable() {
    return this.cards.filter((c) => !c.noclimb && c.top > this.bounds.top + 40);
  }

  byType(fragment) {
    return this.cards.find((c) => c.type.includes(fragment));
  }

  refresh(card) {
    if (!card?.el?.isConnected) return null;
    const r = card.el.getBoundingClientRect();
    Object.assign(card, { x1: r.left, x2: r.right, top: r.top, bottom: r.bottom });
    return card;
  }
}
