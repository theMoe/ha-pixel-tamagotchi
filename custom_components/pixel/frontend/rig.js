/** Das SVG-Tier: Layer, Outfits, Mimik, Stufen. */

import { clamp, wait } from "./util.js";

// Silhouette des Eis. Wird zweimal gebraucht (Kontur und Flaeche), darum genau einmal definiert.
const EGG_PATH = "M6 3h4v1h1v1h1v2h1v5h-1v1h-1v1H5v-1H4v-1H3V7h1V5h1V4h1z";

const RIG_SVG = `
<svg viewBox="-4 -4 24 22" xmlns="http://www.w3.org/2000/svg">
  <g class="rig">
    <g class="layer item-umbrella"><rect x="12" y="6" width="1" height="9" fill="#5a3a1a"/><path d="M6 6h13v1H6z M7 5h11v1H7z M8 4h9v1H8z M9 3h7v1H9z M11 2h3v1h-3z" fill="#e53935"/><path d="M8 5h2v1H8z M12 5h2v1h-2z M16 5h2v1h-2z" fill="#fff"/></g>
    <g class="legs"><rect class="l1" x="5" y="14" width="2" height="2" fill="var(--pixel-dark)"/><rect class="l2" x="9" y="14" width="2" height="2" fill="var(--pixel-dark)"/></g>
    <g class="body">
      <path d="M4 5h8v1h1v7h-1v1H4v-1H3V6h1z" fill="var(--pixel-body)"/>
      <rect x="4" y="12" width="8" height="1" fill="var(--pixel-dark)" opacity=".5"/>
      <rect x="4" y="3" width="2" height="2" fill="var(--pixel-body)"/><rect x="10" y="3" width="2" height="2" fill="var(--pixel-body)"/>
      <rect x="4" y="2" width="2" height="1" fill="var(--pixel-body)"/><rect x="10" y="2" width="2" height="1" fill="var(--pixel-body)"/>
      <rect class="arm" x="2" y="8" width="1" height="3" fill="var(--pixel-dark)"/><rect class="arm arm-r" x="13" y="8" width="1" height="3" fill="var(--pixel-dark)"/>
      <rect x="4" y="9" width="1" height="1" fill="var(--pixel-blush)" opacity=".7"/><rect x="11" y="9" width="1" height="1" fill="var(--pixel-blush)" opacity=".7"/>
    </g>
    <g class="egg layer">
      <!-- Kontur: derselbe Pfad, 2 Einheiten breit gestrichen. Die innere Haelfte verdeckt die
           Flaeche darueber, es bleibt also eine pixelgenaue Kontur von einer Einheit.
           Im dunklen Theme ist stroke-width 0, dann wird nichts gezeichnet. -->
      <path class="egg-outline" d="${EGG_PATH}" fill="none" stroke="var(--pixel-outline)" stroke-linejoin="miter"/>
      <path d="${EGG_PATH}" fill="var(--pixel-egg)"/>
      <path d="M5 8h1v1H5z M9 6h1v1H9z M7 10h1v1H7z" fill="var(--pixel-egg-spot)"/>
      <path class="crack" d="M7 3h1v2h1v1H8v1H7V6H6V5h1z" fill="var(--pixel-egg-line)" opacity="0"/>
    </g>
    <g class="eyes"><rect x="5" y="7" width="2" height="2" fill="#fff"/><rect x="9" y="7" width="2" height="2" fill="#fff"/>
      <rect class="pupil" x="6" y="8" width="1" height="1" fill="#111"/><rect class="pupil" x="10" y="8" width="1" height="1" fill="#111"/></g>
    <g class="layer eyes-closed"><rect x="5" y="8" width="2" height="1" fill="#111"/><rect x="9" y="8" width="2" height="1" fill="#111"/></g>
    <g class="layer eyes-x"><path d="M5 7h1v1H5z M6 8h1v1H6z M5 9h1v1H5z M6 7h1v1H6z M9 7h1v1H9z M10 8h1v1h-1z M9 9h1v1H9z M10 7h1v1h-1z" fill="#111"/></g>
    <rect class="mouth m-smile" x="7" y="10" width="2" height="1" fill="#111"/>
    <path class="layer mouth m-frown" d="M6 11h1v-1h2v1h1v1H9v-1H7v1H6z" fill="#111"/>
    <rect class="layer mouth m-open" x="7" y="10" width="2" height="2" fill="#7a1f1f"/>
    <g class="layer acc-sunglasses"><rect x="4" y="7" width="3" height="2" fill="#111"/><rect x="9" y="7" width="3" height="2" fill="#111"/><rect x="7" y="7" width="2" height="1" fill="#111"/><rect x="5" y="7" width="1" height="1" fill="#8ab4f8" opacity=".8"/><rect x="10" y="7" width="1" height="1" fill="#8ab4f8" opacity=".8"/></g>
    <g class="layer acc-scarf"><rect x="4" y="12" width="8" height="1" fill="#e53935"/><rect x="11" y="13" width="1" height="2" fill="#e53935"/><rect x="5" y="12" width="1" height="1" fill="#fff"/><rect x="8" y="12" width="1" height="1" fill="#fff"/></g>
    <g class="layer acc-thermometer"><rect x="10" y="10" width="4" height="1" fill="#fff"/><rect x="13" y="10" width="1" height="1" fill="#e53935"/></g>
    <g class="layer hat-sleep_cap"><path d="M4 3h8v1H4z M5 2h6v1H5z M7 1h3v1H7z M9 0h2v1H9z" fill="#5c6bc0"/><rect x="11" y="1" width="2" height="1" fill="#fff"/><rect x="4" y="3" width="8" height="1" fill="#fff"/></g>
    <g class="layer hat-beanie"><path d="M4 3h8v1H4z M5 2h6v1H5z M6 1h4v1H6z" fill="#8e24aa"/><rect x="7" y="0" width="2" height="1" fill="#fff"/><rect x="4" y="3" width="8" height="1" fill="#ce93d8"/></g>
    <g class="layer hat-santa_hat"><path d="M4 3h8v1H4z M5 2h6v1H5z M6 1h4v1H6z M7 0h3v1H7z" fill="#d32f2f"/><rect x="10" y="0" width="2" height="1" fill="#fff"/><rect x="4" y="3" width="8" height="1" fill="#fff"/></g>
    <g class="layer hat-bunny_ears"><rect x="4" y="-2" width="2" height="4" fill="#f8bbd0"/><rect x="10" y="-2" width="2" height="4" fill="#f8bbd0"/><rect x="5" y="-1" width="1" height="2" fill="#f48fb1"/><rect x="10" y="-1" width="1" height="2" fill="#f48fb1"/></g>
    <g class="layer item-ice_cream"><rect x="14" y="8" width="1" height="3" fill="#d7a86e"/><rect x="13" y="6" width="3" height="2" fill="#f48fb1"/><rect x="14" y="5" width="1" height="1" fill="#fff"/></g>
    <g class="layer item-lantern"><rect x="14" y="7" width="1" height="1" fill="#555"/><rect x="13" y="8" width="3" height="3" fill="#ffca28"/><rect x="14" y="9" width="1" height="1" fill="#fff"/></g>
    <g class="layer item-coffee"><rect x="13" y="8" width="3" height="3" fill="#fff"/><rect x="16" y="9" width="1" height="1" fill="#fff"/><rect x="14" y="8" width="1" height="1" fill="#6d4c41"/><rect x="14" y="6" width="1" height="1" fill="#ccc" opacity=".6"/></g>
    <g class="layer item-clipboard"><rect x="13" y="7" width="3" height="4" fill="#8d6e63"/><rect x="13.5" y="7.5" width="2" height="3" fill="#fff"/><rect x="14" y="8" width="1" height="1" fill="#03a9f4"/></g>
    <g class="layer item-pumpkin"><rect x="13" y="8" width="3" height="3" fill="#ef6c00"/><rect x="14" y="7" width="1" height="1" fill="#2e7d32"/><rect x="14" y="9" width="1" height="1" fill="#111"/></g>
    <g class="layer fx-sweat"><rect x="2" y="5" width="1" height="1" fill="#4fc3f7"/><rect x="2" y="6" width="1" height="1" fill="#03a9f4"/><rect x="13" y="4" width="1" height="1" fill="#4fc3f7"/></g>
  </g>
</svg>`;

export const RIG_CSS = `
  /* Farbtoken des Tiers. Hell und Dunkel unterscheiden sich ausschliesslich hier. */
  :host, .pixel-pet {
    --pixel-body:#ffcf4d; --pixel-dark:#c98a1c; --pixel-blush:#ff8a80;
    --pixel-egg:#f5f0e1; --pixel-egg-spot:#a8d8a8; --pixel-egg-line:#c9b99a;
    --pixel-outline:#2b2b2b; --pixel-outline-width:0;
  }
  .pixel-pet .egg-outline { stroke-width:var(--pixel-outline-width); }
  .pixel-pet svg { width:100%; height:100%; shape-rendering:crispEdges; overflow:visible; display:block; }
  .pixel-pet .rig { transform-origin:50% 50%; transform-box:fill-box; }
  .pixel-pet.flip .rig { transform:scaleX(-1); }
  .pixel-pet .layer { display:none; } .pixel-pet .layer.on { display:inline; }
  .pixel-pet.stage-senior { --pixel-body:#d9d3c2; --pixel-dark:#8f8a7c; }
  .pixel-pet.stage-baby { --pixel-body:#ffe08a; }
  /* Helles Theme. Muss NACH den Stufenregeln stehen: gleiche Spezifitaet (0,2,0), es gewinnt
     die spaetere Regel. Stufenspezifische Hellwerte brauchen darum (0,3,0).
     Nur Ei und Senior bekommen eigene Werte; das gesaettigte Gelb des Koerpers traegt sich
     auf Weiss ueber die dunklen Arme, Beine, Augen und den Mund. */
  .pixel-pet.theme-light { --pixel-egg:#e9dcb8; --pixel-egg-spot:#4e8f52; --pixel-egg-line:#8a7852; --pixel-outline-width:2; }
  .pixel-pet.theme-light.stage-senior { --pixel-body:#bdb6a3; --pixel-dark:#67635a; }
  /* Belebt das bisher tote .crack-Markup: der Riss blitzt auf, wenn das Ei wackelt. */
  .pixel-pet.wobble .crack { opacity:1; }
  .pixel-pet.tumble .rig { animation:pixel-tumble .9s linear; }
  .pixel-pet.eat .m-open { animation:pixel-chew .25s steps(1) infinite alternate; transform-origin:center; transform-box:fill-box; }
  .pixel-pet.wobble .rig { animation:pixel-wobble .8s ease-in-out; }
  .pixel-pet.fainted .rig { transform:rotate(90deg) translateY(2px); }
  .pixel-pet.flip.fainted .rig { transform:scaleX(-1) rotate(90deg) translateY(2px); }
  .pixel-pet.wave .arm-r { animation:pixel-wave .3s steps(1) infinite alternate; transform-origin:center bottom; transform-box:fill-box; }
  @keyframes pixel-tumble { to { transform:rotate(360deg); } }
  @keyframes pixel-chew { 50% { transform:scaleY(.4); } }
  @keyframes pixel-wobble { 25% { transform:rotate(-8deg); } 75% { transform:rotate(8deg); } }
  @keyframes pixel-wave { to { transform:translateY(-3px) rotate(-30deg); } }
  @media (prefers-reduced-motion: reduce) { .pixel-pet .rig { animation:none !important; } }
`;

export class Rig {
  constructor(host) {
    this.el = host;
    this.el.classList.add("pixel-pet");
    this.el.innerHTML = RIG_SVG;
    this._q = (s) => this.el.querySelectorAll(s);
    this._facingLeft = false;
    this._theme = null;
  }

  /**
   * Hell oder Dunkel wird ausschliesslich als Klasse am Wurzelelement transportiert;
   * alle Farbwerte stehen im RIG_CSS. Idempotent, darf also bei jedem hass-Update kommen.
   */
  setTheme(mode) {
    if (this._theme === mode) return;
    this._theme = mode;
    this.el.classList.toggle("theme-light", mode === "light");
  }

  _toggle(selector, on) {
    this._q(selector).forEach((e) => e.classList.toggle("on", !!on));
  }

  /** Vollständige Darstellung aus dem Backend-Snapshot ableiten. */
  apply(snap, opts = {}) {
    const { hidden = false } = opts;
    const isEgg = snap.stage === "egg";
    const sleeping = !!snap.sleeping;
    const fainted = !!snap.fainted;
    const outfit = snap.outfit || {};

    // Entfernt nur die Stufenklasse; "theme-light", "flip" und "fainted" bleiben bewusst stehen.
    this.el.className = this.el.className.replace(/\bstage-\w+/g, "").trim();
    this.el.classList.add("pixel-pet", `stage-${snap.stage || "adult"}`);
    this.el.classList.toggle("fainted", fainted);

    this._toggle(".egg", isEgg);
    this.el.querySelector(".body").style.display = isEgg ? "none" : "";
    this.el.querySelector(".legs").style.display = isEgg ? "none" : "";
    this.el.querySelector(".eyes").style.display = isEgg || sleeping || fainted ? "none" : "";
    this._toggle(".eyes-closed", sleeping && !isEgg);
    this._toggle(".eyes-x", fainted && !isEgg);

    const frown = ["hungry", "stressed", "lonely", "sick"].includes(snap.mood);
    const eating = snap.activity === "eating";
    this.el.querySelector(".m-smile").style.display = isEgg || sleeping || frown || eating || fainted ? "none" : "";
    this._toggle(".m-frown", frown && !isEgg && !sleeping && !eating);
    this._toggle(".m-open", eating && !isEgg);
    this.el.classList.toggle("eat", eating);

    // Outfit-Layer: erst alle aus, dann die aktiven an
    this._q(".layer[class*='hat-'],.layer[class*='acc-'],.layer[class*='item-']").forEach((e) => e.classList.remove("on"));
    if (!isEgg) {
      if (outfit.hat) this._toggle(`.hat-${outfit.hat}`, true);
      if (outfit.accessory) this._toggle(`.acc-${outfit.accessory}`, true);
      if (outfit.item && !hidden) this._toggle(`.item-${outfit.item}`, true);
    }
    this._toggle(".fx-sweat", (snap.mood === "stressed" || snap.stress_level >= 2) && !isEgg);
  }

  face(left) {
    this._facingLeft = left;
    this.el.classList.toggle("flip", left);
  }

  legs(frame) {
    const [l1, l2] = [this.el.querySelector(".l1"), this.el.querySelector(".l2")];
    if (!l1) return;
    l1.setAttribute("y", frame === 0 ? 13 : 14);
    l2.setAttribute("y", frame === 1 ? 13 : 14);
  }

  lookAt(dx, dy) {
    const f = this._facingLeft ? -1 : 1;
    this._q(".pupil").forEach((p, i) => {
      p.setAttribute("x", (i ? 10 : 6) + clamp(dx, -1, 1) * f * 0.6);
      p.setAttribute("y", 8 + clamp(dy, -1, 1) * 0.5);
    });
  }

  async play(cls, ms) {
    this.el.classList.add(cls);
    await wait(ms);
    this.el.classList.remove(cls);
  }
}
