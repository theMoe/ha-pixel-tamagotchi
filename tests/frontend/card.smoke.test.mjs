/**
 * Smoke-Test der Pixel-Card in jsdom (kein Layout, daher werden Rechtecke gestubbt).
 * Ausführen: node tests/frontend/card.smoke.test.mjs
 */
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const html = `<!doctype html><body>
<hui-masonry-view>
  <hui-weather-forecast-card><ha-card id="w"></ha-card></hui-weather-forecast-card>
  <hui-calendar-card><ha-card id="c"></ha-card></hui-calendar-card>
  <hui-entities-card><ha-card id="e"></ha-card></hui-entities-card>
  <pixel-card id="card"></pixel-card>
</hui-masonry-view></body>`;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// Layout stubben: jede ha-card bekommt ein plausibles Rechteck.
const rects = { w: [12, 80, 180, 100], c: [200, 80, 180, 100], e: [12, 200, 180, 100] };
window.HTMLElement.prototype.getBoundingClientRect = function () {
  const r = rects[this.id] || [0, 0, 390, 800];
  const [left, top, width, height] = r;
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
};
Object.defineProperty(window, "innerWidth", { value: 390 });
Object.defineProperty(window, "innerHeight", { value: 800 });
window.matchMedia = () => ({ matches: false });
window.requestAnimationFrame = (cb) => setTimeout(() => cb(window.performance.now()), 16);

const errors = [];
window.addEventListener("error", (e) => errors.push(e.error || e.message));
process.on("unhandledRejection", (e) => errors.push(e));

// Card-Code laden
window.eval(readFileSync(new URL("../../custom_components/pixel/frontend/pixel-card.js", import.meta.url), "utf8"));
assert.ok(window.customElements.get("pixel-card"), "Element registriert");
assert.ok(window.customCards.some((c) => c.type === "pixel-card"), "in customCards eingetragen");

// Mock-hass
const calls = [];
let subscriber = null;
const attrs = {
  entry_id: "x", name: "Pixel", stage: "adult", mood: "happy", activity: "idle", outfit: { accessory: "sunglasses" },
  hunger: 70, happiness: 75, energy: 85, health: 100, sleeping: false, sick: false, fainted: false, poop_count: 1,
  stress_level: 2, weather: "sunny", animations_enabled: true, total_feeds: 1, feeds_by_user: {}, age_days: 3,
};
const hass = {
  locale: { language: "de" },
  states: { "sensor.pixel_status": { state: "happy", attributes: attrs } },
  formatEntityState: (s) => s.state,
  connection: { subscribeEvents: (cb) => { subscriber = cb; return Promise.resolve(() => {}); } },
  callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); },
};

const card = document.getElementById("card");
card.setConfig({ show_status: true });
card.hass = hass;

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
await tick(50);

const overlay = document.querySelector(".pixel-overlay");
assert.ok(overlay, "Overlay am body");
assert.ok(overlay.querySelector(".pixel-pet svg"), "SVG-Rig gerendert");
assert.equal(card._config.entity, "sensor.pixel_status", "Status-Entity automatisch erkannt");
assert.ok(card.shadowRoot.querySelector(".chip-name").textContent.includes("Pixel"), "Chip zeigt Namen");
assert.ok(overlay.querySelector(".acc-sunglasses.on"), "Sonnenbrille aktiv");
assert.ok(overlay.querySelector(".fx-sweat.on"), "Schweiß bei Stress");
assert.equal(overlay.querySelectorAll(".pixel-poop").length, 1, "ein Häufchen gerendert");
assert.equal(card._brain.f.cards.length, 3, "drei Karten gescannt (eigene ausgeschlossen)");
assert.ok(card._brain.f.byType("calendar"), "Kalenderkarte erkannt");
assert.equal(card._brain.m.speed, 0.38, "Stress → schneller");

// Tippen aufs Tier → Menü
overlay.querySelector(".pixel-pet").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await tick(10);
const menu = overlay.querySelector(".pixel-menu");
assert.ok(menu, "Menü offen");
assert.equal(menu.querySelectorAll("button").length, 6, "5 Basis-Aktionen + Putzen");
menu.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(["pixel", "feed", { meal: "meal", config_entry_id: "x" }]), "feed-Service mit entry_id");

// Häufchen tippen → clean
overlay.querySelector(".pixel-poop").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
assert.equal(calls.at(-1)[1], "clean");

// Events vom Bus
await tick(700); // Begrüßung abwarten
assert.ok(subscriber, "Events abonniert");
subscriber({ data: { entry_id: "x", type: "appointment_soon", title: "Termin A", minutes: 10 } });
await tick(1200);
assert.ok(overlay.querySelector(".pixel-bubble").textContent.includes("Termin A"), "Termin in Sprechblase");
subscriber({ data: { entry_id: "other", type: "say", text: "fremd" } });
assert.ok(!overlay.querySelector(".pixel-bubble").textContent.includes("fremd"), "fremde entry_id ignoriert");

// Verstecken erzwingen und durch Karten-Tap aufscheuchen
card._brain.busy = false;
await card._brain._interrupt(() => card._brain._hide(card._brain.f.byType("calendar")));
assert.ok(card._brain.hiding, "versteckt");
assert.ok(overlay.querySelector(".pixel-pet").style.clipPath.includes("inset"), "Clip aktiv");
document.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 250, clientY: 120 }));
await tick(600);
assert.equal(card._brain.hiding, null, "aufgescheucht");
assert.equal(overlay.querySelector(".pixel-pet").style.clipPath, "", "Clip entfernt");

// Zustand ändern: schlafen
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "sleeping", attributes: { ...attrs, sleeping: true, outfit: { hat: "sleep_cap" } } } } };
await tick(10);
assert.ok(overlay.querySelector(".hat-sleep_cap.on"), "Schlafmütze");
assert.ok(overlay.querySelector(".eyes-closed.on"), "Augen zu");

// Unmount räumt auf
card.remove();
await tick(10);
assert.equal(document.querySelector(".pixel-overlay"), null, "Overlay entfernt");
assert.equal(window.__pixelOverlayOwner, null, "Owner freigegeben");

await tick(100);
assert.deepEqual(errors, [], "keine Laufzeitfehler");
console.log("card.smoke.test: OK");
process.exit(0);
