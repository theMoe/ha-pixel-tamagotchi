/**
 * Pixel – Dashboard-Tamagotchi · Overlay-Card für Home Assistant
 *
 * Aufbau (jede Klasse hat genau eine Aufgabe):
 *   Texts      – Sprechblasen-Texte (de/en)
 *   Rig        – das SVG-Tier: Layer, Outfits, Mimik, Stufen
 *   Furniture  – scannt das Dashboard nach Karten ("Möbel")
 *   Overlay    – die fixe Ebene über dem Dashboard (Tier, Blase, Effekte, Häufchen, Menü)
 *   Mover      – Tweens mit Hüpfbogen und 8-fps-Schrittzyklus
 *   Brain      – Verhalten: Idle-Schleife, Reaktionen auf Backend-Zustand und Events
 *   PixelCard  – das Lovelace-Element: Konfiguration, hass-Anbindung, Status-Chip
 *
 * Kein Build-Schritt, keine externen Abhängigkeiten – läuft auch offline im Kiosk.
 */

const CARD_TAG = "pixel-card";
const DOMAIN = "pixel";
const EVENT_TYPE = "pixel_event";
const PET_BASE_SIZE = 64;

const DEFAULT_CONFIG = {
  entity: null,
  scale: 1,
  show_status: true,
  // Teilstrings des Kartentyps (Elementname ohne "hui-"-Praefix und "-card"-Suffix).
  // "navbar" haelt Navigationsleisten aus der Moebelsuche heraus.
  avoid: ["picture", "map", "iframe", "camera", "webpage", "gauge", "navbar"],
  // "planner" und "agenda" treffen auch verbreitete Kalender-Custom-Cards.
  favorites: ["calendar", "planner", "agenda"],
  idle_min_seconds: 3,
  idle_max_seconds: 8,
  floor_margin: 12,
};

/* ------------------------------------------------------------------ Texte */

const Texts = {
  de: {
    hello: "hallo!",
    fed: ["mjam", "lecker!", "nom nom"],
    overfed: "*rülps*",
    played: ["nochmal!", "juhu", "tadaa!"],
    petted: ["♥", "hihi", "mehr!"],
    grumbled: "grmpf...",
    cleaned: "danke!",
    healed: "viel besser",
    sick: "mir ist schlecht",
    hungry: ["Hunger!", "wann gibt es essen?"],
    feeding_time: ["essen?", "ich hätte da hunger"],
    appointment_soon: (d) => `${d.title}\nin ${d.minutes} min`,
    welcome_home: "willkommen zurück!",
    fell_asleep: "gute nacht",
    woke_up: "guten morgen!",
    evolved: "ich bin gewachsen!",
    too_tired: "zu müde...",
    tummy_ache: "bauchweh",
    medicine_refused: "bäh!",
    fainted: "...",
    revived: "wo bin ich?",
    hatched: "hallo welt!",
    died: "auf wiedersehen",
    hide: ["psst", "hier ist niemand", "..."],
    boo: "BUH!",
    trick: ["tadaa!", "hui", "nochmal?"],
    rain: "platsch",
    sunny: ["ahh, sonne", "eis?"],
    stressed: ["so viel zu tun", "keine zeit!"],
    lonely: ["wo sind alle?", "hallo?"],
    bored: ["laaangweilig", "spielt jemand?"],
    music: "musik!",
    poop_hint: "hier stinkt es",
    menu: { meal: "Füttern", snack: "Snack", treat: "Leckerli", play: "Spielen", pet: "Streicheln", clean: "Putzen", medicine: "Medizin" },
    stats: { hunger: "Sättigung", happiness: "Laune", energy: "Energie", health: "Gesundheit", age: "Alter", stage: "Stufe", feeds: "Fütterungen", top: "Am meisten gefüttert" },
    stage: { egg: "Ei", baby: "Baby", child: "Kind", teen: "Teenager", adult: "Erwachsen", senior: "Senior" },
    days: "Tage",
  },
  en: {
    hello: "hello!",
    fed: ["yum", "tasty!", "nom nom"],
    overfed: "*burp*",
    played: ["again!", "yay", "tadaa!"],
    petted: ["♥", "hehe", "more!"],
    grumbled: "grmpf...",
    cleaned: "thanks!",
    healed: "much better",
    sick: "I feel sick",
    hungry: ["hungry!", "when is dinner?"],
    feeding_time: ["food?", "I'm a bit hungry"],
    appointment_soon: (d) => `${d.title}\nin ${d.minutes} min`,
    welcome_home: "welcome back!",
    fell_asleep: "good night",
    woke_up: "good morning!",
    evolved: "I grew up!",
    too_tired: "too tired...",
    tummy_ache: "tummy ache",
    medicine_refused: "yuck!",
    fainted: "...",
    revived: "where am I?",
    hatched: "hello world!",
    died: "goodbye",
    hide: ["psst", "nobody here", "..."],
    boo: "BOO!",
    trick: ["tadaa!", "whee", "again?"],
    rain: "splash",
    sunny: ["ahh, sun", "ice cream?"],
    stressed: ["so much to do", "no time!"],
    lonely: ["where is everyone?", "hello?"],
    bored: ["booooring", "anyone playing?"],
    music: "music!",
    poop_hint: "it smells here",
    menu: { meal: "Feed", snack: "Snack", treat: "Treat", play: "Play", pet: "Pet", clean: "Clean", medicine: "Medicine" },
    stats: { hunger: "Fullness", happiness: "Happiness", energy: "Energy", health: "Health", age: "Age", stage: "Stage", feeds: "Feedings", top: "Top feeder" },
    stage: { egg: "Egg", baby: "Baby", child: "Child", teen: "Teen", adult: "Adult", senior: "Senior" },
    days: "days",
  },
  pick(lang, key, data) {
    const table = Texts[lang] || Texts.de;
    const value = table[key] ?? Texts.de[key];
    if (typeof value === "function") return value(data || {});
    return Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value;
  },
};

/* ------------------------------------------------------------------ Hilfen */

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Ermittelt, ob das Dashboard gerade hell oder dunkel dargestellt wird.
 * `hass.themes.darkMode` folgt der Profileinstellung des Nutzers (inklusive "automatisch")
 * und ist damit zuverlaessiger als prefers-color-scheme, das nur das Betriebssystem kennt.
 */
function resolveTheme(hass) {
  if (typeof hass?.themes?.darkMode === "boolean") return hass.themes.darkMode ? "dark" : "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** Alle Elemente eines Selektors – auch durch Shadow Roots hindurch. */
function deepQueryAll(root, selector, out = [], depth = 0) {
  if (!root || depth > 25) return out;
  if (root.shadowRoot) deepQueryAll(root.shadowRoot, selector, out, depth + 1);
  if (root.querySelectorAll) {
    for (const el of root.querySelectorAll(selector)) out.push(el);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) deepQueryAll(el.shadowRoot, selector, out, depth + 1);
    }
  }
  return out;
}

/**
 * elementFromPoint, aber durch Shadow Roots hindurch bis zum innersten Treffer.
 * Gibt null zurueck, wenn die Engine den Treffertest nicht kennt (jsdom).
 */
function deepElementFromPoint(x, y) {
  let el = document.elementFromPoint?.(x, y) || null;
  for (let i = 0; i < 20 && el?.shadowRoot; i++) {
    const inner = el.shadowRoot.elementFromPoint?.(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

/** Das Lovelace-Element (hui-*-card oder Custom Card), zu dem eine ha-card gehört. */
function cardHostOf(haCard) {
  let el = haCard.getRootNode()?.host || haCard.parentElement;
  for (let i = 0; i < 4 && el; i++) {
    const name = el.localName || "";
    if (name.startsWith("hui-") || name.includes("-card")) return el;
    el = el.parentElement || el.getRootNode()?.host || null;
  }
  return haCard.getRootNode()?.host || haCard.parentElement;
}

/** Vom Card-Element nach oben zur umgebenden Lovelace-View laufen. */
function findViewElement(start) {
  let el = start;
  for (let i = 0; i < 40 && el; i++) {
    const name = el.localName || "";
    if (name.startsWith("hui-") && name.endsWith("-view")) return el;
    el = el.parentElement || el.getRootNode()?.host || null;
  }
  return null;
}

/* ------------------------------------------------------------------ Rig */

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

const RIG_CSS = `
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

class Rig {
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

/* ------------------------------------------------------------------ Furniture */

class Furniture {
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

/* ------------------------------------------------------------------ Overlay */

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

class Overlay {
  constructor(config) {
    this.config = config;
    this.el = document.createElement("div");
    this.el.className = "pixel-overlay";
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS + RIG_CSS;
    this.el.appendChild(style);

    this.petEl = document.createElement("div");
    this.petEl.setAttribute("role", "img");
    this.petEl.setAttribute("aria-label", "Pixel");
    this.el.appendChild(this.petEl);
    this.rig = new Rig(this.petEl);

    this.bubbleEl = document.createElement("div");
    this.bubbleEl.className = "pixel-bubble";
    this.el.appendChild(this.bubbleEl);

    this.poopEls = [];
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

  /* Häufchen als tappbare Elemente auf der Bodenlinie */
  syncPoop(count, floorY, bounds, onClean) {
    while (this.poopEls.length > count) this.poopEls.pop().remove();
    while (this.poopEls.length < count) {
      const p = document.createElement("div");
      p.className = "pixel-poop";
      p.textContent = "💩";
      p.title = "clean";
      p.style.left = `${rnd(bounds.left + 20, bounds.right - 50)}px`;
      p.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onClean();
      });
      this.el.appendChild(p);
      this.poopEls.push(p);
    }
    this.poopEls.forEach((p) => (p.style.top = `${floorY - 26}px`));
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

/* ------------------------------------------------------------------ Mover */

class Mover {
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

/* ------------------------------------------------------------------ Brain */

class Brain {
  constructor({ overlay, furniture, mover, config, lang, callService }) {
    this.o = overlay;
    this.f = furniture;
    this.m = mover;
    this.config = config;
    this.lang = lang;
    this.callService = callService;
    this.snap = null;
    this.running = false;
    this.busy = false;
    this.hiding = null; // Karte, hinter der wir stecken
    this.anchor = null; // { card, offsetX } oder null = Boden
    this._loopToken = 0;
    this._lastActivity = null;
    this._lastMood = null;
    this._lastStage = null;
  }

  t(key, data) {
    return Texts.pick(this.lang, key, data);
  }

  /* ---------------- Lebenszyklus */

  start() {
    if (this.running) return;
    this.running = true;
    this.f.scan();
    const start = this.f.byType("calendar") || this.f.climbable()[0];
    if (start) {
      this.anchor = { card: start, offsetX: 20 };
      this.o.place(start.x1 + 20, start.top);
    } else {
      this.o.place(this.f.bounds.left + 40, this.f.floorY);
    }
    setTimeout(() => {
      if (!this.o.bubbleEl.classList.contains("on")) this.o.say(this.t("hello"), 1600);
    }, 500);
    this._loop(++this._loopToken);
  }

  stop() {
    this.running = false;
    this._loopToken++;
    this.m.cancel();
  }

  /* ---------------- Zustand vom Backend */

  update(snap) {
    const prev = this.snap;
    this.snap = snap;
    this.m.speed = snap.stress_level >= 2 ? 0.38 : snap.stress_level === 1 ? 0.26 : 0.16;
    this.o.rig.apply(snap, { hidden: !!this.hiding });
    this.o.syncPoop(snap.poop_count || 0, this.f.floorY, this.f.bounds, () => this.callService("clean"));

    if (prev && snap.activity !== prev.activity) this._onActivity(snap.activity);
    if (prev && snap.stage !== prev.stage && snap.stage !== "egg") this.o.rig.play("wobble", 800);
    if (snap.sleeping && !prev?.sleeping) this._goToSleepSpot();
    if (snap.animations_enabled === false) this.m.cancel();
  }

  _onActivity(activity) {
    if (activity === "eating") this._interrupt(async () => {
      await this._unhide(false);
      await wait(1800);
    });
    if (activity === "playing" && !reducedMotion()) this._interrupt(() => this._trick("tumble"));
  }

  /* ---------------- Events vom Bus */

  onEvent(type, data) {
    const simple = ["fed", "overfed", "played", "petted", "grumbled", "cleaned", "healed", "sick", "too_tired", "tummy_ache", "medicine_refused", "revived", "hatched", "died", "fell_asleep", "woke_up", "evolved"];
    if (simple.includes(type)) this.o.say(this.t(type), type === "died" ? 4000 : 1800);
    if (type === "petted") this.o.fx("heart", "♥");
    if (type === "welcome_home") this._interrupt(async () => {
      await this._unhide(false);
      this.o.say(this.t("welcome_home"), 2500);
      await this._jump();
      await this._jump();
    });
    if (type === "hungry" || type === "feeding_time") this._interrupt(() => this._pointAt("entit", this.t(type)));
    if (type === "appointment_soon") this._interrupt(() => this._pointAt("calendar", this.t("appointment_soon", data), 5000));
    if (type === "poop") this._interrupt(async () => this.o.say(this.t("poop_hint"), 1500));
    if (type === "say") this._interrupt(async () => {
      await this._unhide(false);
      this.o.say(String(data.text || ""), (data.duration || 4) * 1000);
    });
    if (type === "trick") this._interrupt(() => this._trick(data.trick || "random"));
  }

  /* ---------------- Idle-Schleife */

  /**
   * Prueft, ob an der Stelle des Tiers noch das Tier selbst obenauf liegt. Verdeckt es etwas
   * anderes (Vollbild-Bildschirmschoner, Dialog-Overlay), pausiert die Schleife. Rein
   * geometrisch, also ohne Kopplung an eine bestimmte fremde Karte.
   * `update()` laeuft weiter, damit das Tier nach dem Aufwachen sofort richtig aussieht.
   */
  _covered() {
    if (!document.elementFromPoint) return false;
    const x = Math.round(this.o.pos.x + this.o.size / 2);
    const y = Math.round(this.o.pos.y - this.o.size / 2);
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const hit = deepElementFromPoint(x, y);
    return !!hit && !this.o.el.contains(hit);
  }

  async _loop(token) {
    while (this.running && token === this._loopToken) {
      await wait(rnd(this.config.idle_min_seconds, this.config.idle_max_seconds) * 1000);
      if (!this.running || token !== this._loopToken) return;
      if (this.busy || !this.snap || document.visibilityState === "hidden") continue;
      if (this.snap.animations_enabled === false) continue;
      if (this._covered()) continue; // Bildschirmschoner oder Dialog davor: nichts zu sehen, nichts zu tun

      const s = this.snap;
      if (s.fainted) continue;
      if (s.sleeping) {
        if (Math.random() < 0.6) this.o.fx("zzz", "z", 30);
        continue;
      }
      if (this.hiding) {
        await this._peek();
        continue;
      }
      if (s.stage === "egg") {
        if (Math.random() < 0.5) await this.o.rig.play("wobble", 800);
        continue;
      }
      await this._chooseIdleAction(s);
    }
  }

  async _chooseIdleAction(s) {
    const r = Math.random();
    if (s.mood === "hungry" && r < 0.35) return this._pointAt("entit", this.t("hungry"));
    if (s.mood === "stressed" && r < 0.35) return this._pointAt("calendar", this.t("stressed"));
    if (s.mood === "lonely" && r < 0.3) return this.o.say(this.t("lonely"), 1800);
    if (s.mood === "bored" && r < 0.3) return this.o.say(this.t("bored"), 1800);
    if (s.media_playing && r < 0.4 && !reducedMotion()) return this._dance();
    if (s.weather === "rainy" && r < 0.1) return this.o.say(this.t("rain"), 1000);
    if (s.weather === "sunny" && r < 0.08) return this.o.say(this.t("sunny"), 1400);
    if (r < 0.18) return this._hide();
    if (r < 0.26 && !reducedMotion()) return this._trick("tumble");
    if (r < 0.32) return this._kickCard();
    if (r < 0.38) return this._jump();
    if (r < 0.44 && !reducedMotion()) return this._trick("wave");
    return this._walkRandom();
  }

  /* ---------------- Aktionen */

  async _interrupt(fn) {
    if (this.busy) return;
    this.busy = true;
    this.m.cancel();
    try {
      await fn();
    } finally {
      this.busy = false;
    }
  }

  _rescan() {
    this.f.scan();
    if (this.anchor?.card) {
      const c = this.f.refresh(this.anchor.card);
      if (c) this.o.place(c.x1 + this.anchor.offsetX, c.top);
      else this.anchor = null;
    }
    if (this.hiding) {
      const c = this.f.refresh(this.hiding);
      if (c) this.o.clipBelow(c.top);
      else this._unhide(false);
    }
    if (!this.anchor && !this.hiding) this.o.place(clamp(this.o.pos.x, this.f.bounds.left, this.f.bounds.right - this.o.size), this.f.floorY);
    this.o.syncPoop(this.snap?.poop_count || 0, this.f.floorY, this.f.bounds, () => this.callService("clean"));
  }

  async _walkRandom() {
    this.f.scan();
    const options = this.f.climbable();
    const useFloor = Math.random() < 0.35 || !options.length;
    if (useFloor) {
      this.anchor = null;
      const x = rnd(this.f.bounds.left + 8, this.f.bounds.right - this.o.size - 8);
      return this.m.to(x, this.f.floorY);
    }
    const c = pick(options);
    const offsetX = rnd(6, Math.max(6, c.x2 - c.x1 - this.o.size - 6));
    this.anchor = { card: c, offsetX };
    return this.m.to(c.x1 + offsetX, c.top);
  }

  async _hide(target) {
    this.f.scan();
    const candidates = this.f.climbable();
    if (!candidates.length) return this._walkRandom();
    const c = target || pick(candidates.filter((x) => x.fav).concat(candidates));
    const offsetX = rnd(8, Math.max(8, c.x2 - c.x1 - this.o.size - 8));
    this.anchor = { card: c, offsetX };
    const ok = await this.m.to(c.x1 + offsetX, c.top);
    if (!ok) return;
    this.hiding = c;
    this.o.rig.apply(this.snap, { hidden: true });
    const clip = () => this.o.clipBelow(c.top);
    await this.m.to(this.o.pos.x, c.top + this.o.size * 0.8, { dur: 400, hop: 0, keepFacing: true, onFrame: clip });
    clip();
    this.o.say(this.t("hide"), 1500);
  }

  async _peek() {
    if (!this.hiding) return;
    const c = this.hiding;
    const clip = () => this.o.clipBelow(c.top);
    await this.m.to(this.o.pos.x, this.o.pos.y - 10, { dur: 250, hop: 0, keepFacing: true, onFrame: clip });
    await wait(900);
    if (!this.hiding) return;
    await this.m.to(this.o.pos.x, this.o.pos.y + 10, { dur: 250, hop: 0, keepFacing: true, onFrame: clip });
  }

  async _unhide(startled) {
    if (!this.hiding) return;
    const c = this.hiding;
    this.hiding = null;
    this.o.clipBelow(null);
    this.o.rig.apply(this.snap, { hidden: false });
    await this.m.to(this.o.pos.x, c.top, { dur: 350, hop: 30, keepFacing: true });
    if (startled) {
      this.o.say(this.t("boo"), 1200);
      this._shake(c.el);
      this.callService("pet");
    }
  }

  async _trick(name) {
    const options = ["tumble", "jump", "kick", "wave", "hide"];
    const trick = options.includes(name) ? name : pick(options);
    await this._unhide(false);
    if (trick === "hide") return this._hide();
    if (trick === "kick") return this._kickCard();
    if (trick === "jump") {
      await this._jump();
      await this._jump();
      return this.o.say(this.t("trick"), 1200);
    }
    if (trick === "wave") {
      await this.o.rig.play("wave", 1500);
      return;
    }
    const dir = this.o.pos.x < (this.f.bounds.left + this.f.bounds.right) / 2 ? 1 : -1;
    const x = clamp(this.o.pos.x + dir * 160, this.f.bounds.left + 8, this.f.bounds.right - this.o.size - 8);
    this.o.petEl.classList.add("tumble");
    const ok = await this.m.to(x, this.o.pos.y, { dur: 900, hop: 0 });
    this.o.petEl.classList.remove("tumble");
    if (!ok) return;
    if (this.anchor) this.anchor.offsetX = this.o.pos.x - this.anchor.card.x1;
    this.o.say(this.t("trick"), 1500);
  }

  async _jump() {
    const y = this.o.pos.y;
    await this.m.to(this.o.pos.x, y - 14, { dur: 180, hop: 0, keepFacing: true });
    await this.m.to(this.o.pos.x, y, { dur: 180, hop: 0, keepFacing: true });
  }

  async _dance() {
    const x = clamp(this.o.pos.x + pick([-30, 30]), this.f.bounds.left, this.f.bounds.right - this.o.size);
    this.o.petEl.classList.add("tumble");
    const ok = await this.m.to(x, this.o.pos.y, { dur: 900, hop: 0 });
    this.o.petEl.classList.remove("tumble");
    if (ok && this.anchor) this.anchor.offsetX = this.o.pos.x - this.anchor.card.x1;
  }

  async _kickCard() {
    this.f.scan();
    const options = this.f.climbable().filter((c) => !c.type.includes("calendar"));
    if (!options.length) return this._walkRandom();
    const c = pick(options);
    this.anchor = { card: c, offsetX: 10 };
    const ok = await this.m.to(c.x1 + 10, c.top);
    if (!ok) return;
    this._shake(c.el);
    this.o.say("hihi", 1000);
  }

  async _pointAt(typeFragment, text, ms = 2600) {
    await this._unhide(false);
    this.f.scan();
    const c = this.f.byType(typeFragment) || pick(this.f.climbable());
    if (c) {
      this.anchor = { card: c, offsetX: 6 };
      await this.m.to(c.x1 + 6, c.top);
      this._shake(c.el);
    }
    this.o.say(text, ms);
  }

  async _goToSleepSpot() {
    await this._interrupt(async () => {
      await this._unhide(false);
      this.anchor = null;
      await this.m.to(this.f.bounds.right - this.o.size - 16, this.f.floorY);
    });
  }

  /**
   * Kurzes Wackeln der Karte, auf der das Tier landet. Bewusst ueber die Web Animations API:
   * schreibt keine Inline-Styles auf fremde Karten, kollidiert damit nicht mit ha-sortable im
   * Bearbeitungsmodus und laesst keine transition-Eigenschaft zurueck.
   */
  _shake(el) {
    if (!el || reducedMotion() || !el.animate) return;
    const steps = ["0", "-4px", "4px", "-2px", "0"];
    el.animate(
      steps.map((v) => ({ transform: `translateX(${v})` })),
      { duration: 400, easing: "ease-out" },
    );
  }

  /* ---------------- Interaktion */

  onPetTap(menuEntries) {
    if (this.hiding) return this._interrupt(() => this._unhide(true));
    if (this.snap?.sleeping) return this.o.say(this.t("grumbled"), 1000);
    return this.o.toggleMenu(menuEntries);
  }

  onCardTapped(el) {
    if (this.hiding && this.hiding.el === el) this._interrupt(() => this._unhide(true));
  }
}

/* ------------------------------------------------------------------ Card */

const CARD_CSS = `
  /* Ohne :host wäre das Element display:inline und hätte keinen Breitenvertrag zum Container. */
  :host { display:block; container-type:inline-size; }
  :host(.pixel-no-chip) { display:none; }
  ha-card { padding:10px 14px; display:flex; align-items:center; gap:12px; min-height:52px; box-sizing:border-box; width:100%; overflow:hidden; }
  .chip-pet { width:40px; height:40px; flex:none; }
  .chip-text { flex:1 1 auto; min-width:0; }
  .chip-name { font-weight:500; }
  .chip-mood { color:var(--secondary-text-color); font-size:12px; }
  .chip-name, .chip-mood { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .chip-bars { display:flex; gap:6px; flex:none; }
  .chip-bar { width:34px; height:5px; background:var(--divider-color,#444); border-radius:3px; overflow:hidden; }
  .chip-bar b { display:block; height:100%; background:var(--success-color,#66bb6a); }
  .chip-bar b.low { background:var(--warning-color,#ffb300); }
  .chip-hidden { display:none; }
  /* Enge Container (z. B. horizontal-stack) geben der Card nur einen Bruchteil der Zeile.
     Dann stufenweise abrüsten, statt über den Kartenrand hinauszulaufen. */
  @container (max-width: 210px) { .chip-bars { display:none; } }
  @container (max-width: 110px) { .chip-text { display:none; } }
  @container (max-width: 70px) { ha-card { padding:6px; gap:0; } .chip-pet { width:28px; height:28px; } }
  /* Ist die Zeile ueberbucht (Geschwister mit festen Breiten), schrumpft die Card auf null.
     Dann bleibt sonst der Rand der ha-card als Stummel stehen. Lieber gar nichts zeigen. */
  @container (max-width: 44px) { ha-card { display:none; } }
`;

class PixelCard extends HTMLElement {
  static getStubConfig(hass) {
    return { entity: PixelCard._guessEntity(hass), show_status: true };
  }

  static _guessEntity(hass) {
    if (!hass) return null;
    return Object.keys(hass.states).find((id) => id.startsWith("sensor.") && id.endsWith("_status") && hass.states[id].attributes?.stage) || null;
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULT_CONFIG };
    this._hass = null;
    this._overlay = null;
    this._brain = null;
    this._unsubEvents = null;
    this._lastAttrs = null;
    this._onResize = this._debounce(() => this._brain?._rescan(), 150);
    this._onScroll = this._debounce(() => this._brain?._rescan(), 120);
    this._onPointer = (e) => this._trackPointer(e);
    this._onDocClick = (e) => this._documentClick(e);
  }

  /* ---------------- Lovelace-Schnittstelle */

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    if (typeof this._config.avoid === "string") this._config.avoid = [this._config.avoid];
    if (typeof this._config.favorites === "string") this._config.favorites = [this._config.favorites];
    this._renderChip();
  }

  getCardSize() {
    return this._config.show_status ? 1 : 0;
  }

  getGridOptions() {
    return { rows: 1, columns: 6, min_rows: 1, min_columns: 3 };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config.entity) {
      const guess = PixelCard._guessEntity(hass);
      if (guess) this._config.entity = guess;
    }
    const state = this._config.entity && hass.states[this._config.entity];
    const attrs = state?.attributes;
    if (attrs && attrs !== this._lastAttrs) {
      this._lastAttrs = attrs;
      this._brain?.update(attrs);
      this._renderChip(attrs);
    }
    // Nicht nur beim ersten hass: beim View-Wechsel haelt kurzzeitig noch die alte Card das
    // Tier, die neue muss es spaeter nachholen duerfen. _mount() bricht sonst sofort ab.
    if (this.isConnected) this._mount();
    // Ausserhalb des Attribut-Vergleichs: ein Theme-Wechsel aendert keine Sensor-Attribute.
    this._applyTheme();
  }

  connectedCallback() {
    // Registry aller lebenden Karten: beim Abbau wird das Tier daraus sofort weitergereicht.
    (window.__pixelCards = window.__pixelCards || new Set()).add(this);
    if (this._hass) this._mount();
  }

  disconnectedCallback() {
    window.__pixelCards?.delete(this);
    this._unmount();
  }

  /* ---------------- Overlay-Lebenszyklus */

  _mount() {
    if (this._overlay) return;
    // Ein anderes Card-Element haelt bereits das Tier auf dieser Seite. Die Pruefung auf
    // _overlay verhindert, dass ein Besitzer ohne Tier alle anderen blockiert.
    const owner = window.__pixelOverlayOwner;
    if (owner && owner !== this && owner.isConnected && owner._overlay) return;
    window.__pixelOverlayOwner = this;
    const lang = (this._hass?.locale?.language || this._hass?.language || "de").slice(0, 2);
    this._overlay = new Overlay(this._config);
    this._applyTheme(); // sonst startet das Tier eine hass-Runde lang im falschen Farbsatz
    const furniture = new Furniture(findViewElement(this), this, this._config);
    const mover = new Mover(this._overlay);
    this._brain = new Brain({
      overlay: this._overlay,
      furniture,
      mover,
      config: this._config,
      lang,
      callService: (service, data) => this._call(service, data),
    });
    this._overlay.petEl.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._suppressClick) {
        this._suppressClick = false;
        return;
      }
      this._brain.onPetTap(this._menuEntries());
    });
    this._attachLongPress(this._overlay.petEl, () => {
      this._suppressClick = true;
      this._showStats();
    });
    window.addEventListener("resize", this._onResize);
    window.addEventListener("scroll", this._onScroll, true);
    window.addEventListener("pointermove", this._onPointer, { passive: true });
    document.addEventListener("click", this._onDocClick, true);

    if (this._lastAttrs) this._brain.update(this._lastAttrs);
    this._brain.start();
    this._subscribe();
    setTimeout(() => this._brain?._rescan(), 800); // Karten laden oft verzögert
  }

  _unmount() {
    if (!this._overlay) return;
    this._brain?.stop();
    this._overlay.destroy();
    this._overlay = null;
    this._brain = null;
    if (window.__pixelOverlayOwner === this) {
      window.__pixelOverlayOwner = null;
      // Nachfolger sofort uebernehmen lassen. Ohne das bliebe das Tier beim View-Wechsel weg,
      // bis zufaellig das naechste hass-Update eintrifft.
      for (const other of window.__pixelCards || []) {
        if (other !== this && other.isConnected && other._hass) {
          other._mount();
          break;
        }
      }
    }
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("scroll", this._onScroll, true);
    window.removeEventListener("pointermove", this._onPointer);
    document.removeEventListener("click", this._onDocClick, true);
    this._unsubEvents?.then?.((u) => u?.()).catch?.(() => {});
    this._unsubEvents = null;
  }

  async _subscribe() {
    const conn = this._hass?.connection;
    if (!conn || this._unsubEvents) return;
    this._unsubEvents = conn.subscribeEvents((ev) => {
      const d = ev.data || {};
      const entry = this._lastAttrs?.entry_id;
      if (entry && d.entry_id && d.entry_id !== entry) return;
      this._brain?.onEvent(d.type, d);
    }, EVENT_TYPE);
  }

  /* ---------------- Interaktion */

  _menuEntries() {
    const t = (k) => Texts.pick(this._brain.lang, "menu")[k];
    const snap = this._lastAttrs || {};
    const entries = [
      { icon: "🍎", label: t("meal"), onClick: () => this._call("feed", { meal: "meal" }) },
      { icon: "🍪", label: t("snack"), onClick: () => this._call("feed", { meal: "snack" }) },
      { icon: "🍬", label: t("treat"), onClick: () => this._call("feed", { meal: "treat" }) },
      { icon: "⚽", label: t("play"), onClick: () => this._call("play") },
      { icon: "✋", label: t("pet"), onClick: () => this._call("pet") },
    ];
    if (snap.poop_count > 0) entries.push({ icon: "🧹", label: t("clean"), onClick: () => this._call("clean") });
    if (snap.sick || snap.fainted) entries.push({ icon: "💊", label: t("medicine"), onClick: () => this._call("medicine") });
    return entries;
  }

  _call(service, data = {}) {
    if (!this._hass) return;
    const entry = this._lastAttrs?.entry_id;
    this._hass.callService(DOMAIN, service, entry ? { ...data, config_entry_id: entry } : data).catch((err) => {
      console.warn("[pixel-card] service failed", service, err);
      this._overlay?.say(String(err?.message || err), 2500);
    });
  }

  _showStats() {
    const s = this._lastAttrs;
    if (!s || !this._overlay) return;
    const lang = this._brain.lang;
    const T = Texts.pick(lang, "stats");
    const stageT = Texts.pick(lang, "stage");
    const bar = (k) => `<div class="row"><span>${T[k]}</span><div class="bar"><b class="${s[k] < 30 ? "low" : ""}" style="width:${s[k]}%"></b></div><span>${s[k]}</span></div>`;
    const top = Object.entries(s.feeds_by_user || {}).sort((a, b) => b[1] - a[1])[0];
    this._overlay.showStats(`
      <h4>${s.name} · ${stageT[s.stage] || s.stage} · ${s.age_days ?? 0} ${Texts.pick(lang, "days")}</h4>
      ${bar("hunger")}${bar("happiness")}${bar("energy")}${bar("health")}
      <div class="meta">${T.feeds}: ${s.total_feeds ?? 0}${top ? ` · ${T.top}: ${top[0]} (${top[1]})` : ""}</div>`);
  }

  _attachLongPress(el, fn) {
    let timer = null;
    const start = () => (timer = setTimeout(() => { timer = null; fn(); }, 550));
    const cancel = () => timer && clearTimeout(timer);
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  _trackPointer(e) {
    if (!this._overlay || this._lastAttrs?.sleeping) return;
    const o = this._overlay;
    const cx = o.pos.x + o.size / 2;
    const cy = o.pos.y - o.size / 2;
    o.rig.lookAt((e.clientX - cx) / 120, (e.clientY - cy) / 120);
  }

  _documentClick(e) {
    if (!this._overlay || !this._brain) return;
    if (this._overlay.el.contains(e.target)) return;
    this._overlay.closeFloating();
    const hiding = this._brain.hiding;
    if (hiding) {
      const r = hiding.el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        this._brain.onCardTapped(hiding.el);
      }
    }
  }

  /* ---------------- Status-Chip in der Karte */

  _renderChip(attrs) {
    if (!this.shadowRoot) return;
    // Host mitschalten, sonst bleibt ohne Chip ein leeres Flex-Item in der Zeile stehen.
    this.classList.toggle("pixel-no-chip", !this._config.show_status);
    if (!this._config.show_status) {
      this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style><ha-card class="chip-hidden"></ha-card>`;
      this._chipRig = null;
      return;
    }
    if (!this.shadowRoot.querySelector("ha-card:not(.chip-hidden)")) {
      this.shadowRoot.innerHTML = `<style>${CARD_CSS}${RIG_CSS}</style>
        <ha-card>
          <div class="chip-pet"></div>
          <div class="chip-text"><div class="chip-name"></div><div class="chip-mood"></div></div>
          <div class="chip-bars"><div class="chip-bar"><b data-k="hunger"></b></div><div class="chip-bar"><b data-k="happiness"></b></div><div class="chip-bar"><b data-k="energy"></b></div></div>
        </ha-card>`;
      this._chipRig = new Rig(this.shadowRoot.querySelector(".chip-pet"));
      this._applyTheme(); // der Shadow Root wird neu gebaut, das frische Rig kennt das Theme noch nicht
    }
    if (!attrs) return;
    this._chipRig.apply(attrs);
    this.shadowRoot.querySelector(".chip-name").textContent = attrs.name || "Pixel";
    const lang = (this._hass?.locale?.language || "de").slice(0, 2);
    const moodT = this._hass?.formatEntityState ? this._hass.states[this._config.entity] : null;
    this.shadowRoot.querySelector(".chip-mood").textContent = moodT ? this._hass.formatEntityState(moodT) : attrs.mood;
    this.shadowRoot.querySelectorAll(".chip-bar b").forEach((b) => {
      const v = attrs[b.dataset.k] ?? 0;
      b.style.width = `${v}%`;
      b.classList.toggle("low", v < 30);
    });
    void lang;
  }

  /** Einziger Ort, an dem das Theme-Signal zusammenlaeuft: Overlay-Tier und Chip-Tier. */
  _applyTheme() {
    const mode = resolveTheme(this._hass);
    this._overlay?.setTheme(mode);
    this._chipRig?.setTheme(mode);
  }

  _debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }
}

if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, PixelCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Pixel – Dashboard-Tamagotchi",
    description: "Ein Tamagotchi, das über das Dashboard läuft und sich hinter Karten versteckt.",
    preview: false,
    documentationURL: "https://github.com/theMoe/ha-pixel-tamagotchi",
  });
}

console.info("%c PIXEL-CARD %c loaded ", "background:#ffcf4d;color:#111;font-weight:bold", "background:#222;color:#fff");
