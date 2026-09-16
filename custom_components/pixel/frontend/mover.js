/** Tweens mit Huepfbogen und 8-fps-Schrittzyklus. */

import { clamp } from "./util.js";

export class Mover {
  constructor(overlay) {
    this.overlay = overlay;
    this.speed = 0.16; // px/ms
    this._cancel = null;
  }

  cancel() {
    this._cancel?.();
  }

  /** Bewegt das Tier nach (x, y). Bei Höhenwechsel mit Hüpfbogen, Beine im 8-fps-Takt. */
  to(x, y, opts = {}) {
    this.cancel();
    const o = this.overlay;
    const from = { ...o.pos };
    const dist = Math.hypot(x - from.x, y - from.y);
    const dur = opts.dur ?? Math.max(300, dist / this.speed);
    const hop = opts.hop ?? (y !== from.y ? Math.max(24, Math.abs(y - from.y) * 0.3) : 0);
    if (Math.abs(x - from.x) > 2 && !opts.keepFacing) o.rig.face(x < from.x);

    return new Promise((resolve) => {
      let cancelled = false;
      this._cancel = () => {
        cancelled = true;
        o.rig.legs(-1);
        resolve(false);
      };
      const t0 = performance.now();
      let lastStep = 0;
      let frame = 0;
      const step = (now) => {
        if (cancelled) return;
        const t = clamp((now - t0) / dur, 0, 1);
        const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const arc = hop ? Math.sin(t * Math.PI) * hop : 0;
        o.place(from.x + (x - from.x) * e, from.y + (y - from.y) * e - arc);
        opts.onFrame?.();
        if (now - lastStep > 125 && dist > 4) {
          lastStep = now;
          frame ^= 1;
          o.rig.legs(frame);
        }
        if (t < 1) requestAnimationFrame(step);
        else {
          o.rig.legs(-1);
          this._cancel = null;
          resolve(true);
        }
      };
      requestAnimationFrame(step);
    });
  }
}
