/* ------------------------------------------------------------------ Watchdog */

/**
 * Erkennt Zustaende, aus denen das Tier allein nicht mehr herausfindet, und meldet sie.
 * Bewusst ohne eigene Reparatur: das Gehirn repariert sich selbst (`Brain.recover`), der
 * Besitzerwechsel gehoert der Card. Laeuft selten und ohne Karten-Scan.
 */

import { HIDE_MAX_SECONDS, WATCHDOG_INTERVAL_MS } from "./const.js";

export class Watchdog {
  constructor({ overlay, brain, onOverlayLost }) {
    this.o = overlay;
    this.b = brain;
    this.onOverlayLost = onOverlayLost;
    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this.check(), WATCHDOG_INTERVAL_MS);
  }

  stop() {
    clearInterval(this._timer);
    this._timer = null;
  }

  check() {
    if (!this.o.el.isConnected) return this.onOverlayLost();

    const reason = this._defect();
    if (reason) this.b.recover(reason);
  }

  /** Gibt den Grund zurueck, warum das Tier festhaengt - oder null, wenn alles in Ordnung ist. */
  _defect() {
    const now = Date.now();
    const b = this.b;
    if (!this.o.petEl.style.width) return "unplaced";
    if (this.o.petEl.style.clipPath && !b.hiding) return "stale-clip";
    if (b.hiding && now - b._hidingSince > HIDE_MAX_SECONDS * 1000) return "hide-timeout";
    if (b.busy && now - b._busySince > 30000) return "busy-stuck";
    if (b.running && b._lastLoopAt && now - b._lastLoopAt > b.config.idle_max_seconds * 3000) return "loop-dead";

    const { bounds, size } = { bounds: b.f.bounds, size: this.o.size };
    const { x, y } = this.o.pos;
    const outside = x + size < bounds.left || x > bounds.right || y < bounds.top || y - size > bounds.bottom;
    return outside ? "out-of-bounds" : null;
  }
}
