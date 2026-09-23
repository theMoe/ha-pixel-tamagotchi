/**
 * Pixel - Dashboard-Tamagotchi - Einstiegspunkt der Lovelace-Card.
 *
 * Die Card ist in ES-Module aufgeteilt; Home Assistant laedt diese Datei als
 * `<script type="module">` (`add_extra_js_url` ohne `es5`), relative Imports
 * funktionieren also ohne Build-Schritt. Ausgeliefert wird das ganze Verzeichnis
 * unter einem versionierten Pfad, damit ein Versionswechsel alle Module bustet.
 *
 *   const.js     Konstanten und Standardkonfiguration
 *   util.js      zustandslose Helfer
 *   texts.js     Sprechblasen- und Menuetexte
 *   rig.js       das SVG-Tier
 *   furniture.js Kartenscan
 *   overlay.js   die fixe Ebene ueber dem Dashboard
 *   mover.js     Bewegung
 *   brain.js     Verhalten
 *   watchdog.js  holt das Tier aus festgefahrenen Zustaenden zurueck
 */

import { Brain } from "./brain.js";
import { CARD_TAG, DEFAULT_CONFIG, DOMAIN, SUBSCRIBE_EVENTS } from "./const.js";
import { Furniture } from "./furniture.js";
import { Mover } from "./mover.js";
import { Overlay } from "./overlay.js";
import { RIG_CSS, Rig } from "./rig.js";
import { Texts } from "./texts.js";
import { findViewElement, resolveTheme } from "./util.js";
import { Watchdog } from "./watchdog.js";

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
    this._watchdog = null;
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
    this._watchdog = new Watchdog({
      overlay: this._overlay,
      brain: this._brain,
      // Raeumt ein fremdes Skript den body ab, ist das Overlay weg, `_overlay` aber gesetzt -
      // dann blockiert die Card sich selbst und jede andere. Also loslassen und neu aufbauen.
      onOverlayLost: () => {
        this._unmount();
        this._mount();
      },
    });
    this._watchdog.start();
    this._subscribe();
    setTimeout(() => this._brain?._rescan(), 800); // Karten laden oft verzögert
  }

  _unmount() {
    if (!this._overlay) return;
    this._watchdog?.stop();
    this._watchdog = null;
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
    this._unsubEvents = conn.subscribeMessage((d = {}) => {
      const entry = this._lastAttrs?.entry_id;
      if (entry && d.entry_id && d.entry_id !== entry) return;
      this._brain?.onEvent(d.type, d);
    }, { type: SUBSCRIBE_EVENTS });
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
    // Auch der Besen raeumt genau eines weg - wie das Antippen eines Haeufchens.
    if (snap.poop_count > 0) entries.push({ icon: "🧹", label: t("clean"), onClick: () => this._call("clean", { count: 1 }) });
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
