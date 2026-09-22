/**
 * Smoke-Test der Pixel-Card in jsdom (kein Layout, daher werden Rechtecke gestubbt).
 * Ausführen: node tests/frontend/card.smoke.test.mjs
 */
import { JSDOM } from "jsdom";
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

// Card-Code laden. Seit 0.1.4 ist die Card in ES-Module aufgeteilt, `window.eval` wertet
// aber nach dem Script-Goal aus und bricht an der ersten import-Zeile. Deshalb die
// jsdom-Globals auf globalThis legen und das Einstiegsmodul echt importieren.
// Reihenfolge ist wichtig: `class PixelCard extends HTMLElement` wird schon beim Auswerten
// des Moduls gebraucht, HTMLElement muss also vorher stehen.
for (const name of [
  "window", "document", "customElements", "HTMLElement", "MouseEvent", "CustomEvent",
  "Node", "Element", "getComputedStyle", "requestAnimationFrame", "matchMedia",
]) {
  globalThis[name] = window[name];
}
// performance bewusst NICHT uebernehmen: jsdoms Performance.now() ruft das globale
// performance auf und geraet in eine Endlosrekursion, sobald es selbst das globale ist.
// Node bringt ein eigenes mit, und der Mover braucht nur eine monotone Millisekundenuhr.
await import(new URL("../../custom_components/pixel/frontend/pixel-card.js", import.meta.url).href);
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

// Chip-Layout: jsdom kann kein Layout, daher wird das CSS strukturell geprüft.
// Ohne diese Regeln lief der Chip in engen Containern (horizontal-stack) aus dem Kartenhintergrund heraus.
const chipCss = card.shadowRoot.querySelector("style").textContent;
assert.match(chipCss, /:host\s*\{[^}]*display:\s*block/, ":host ist display:block");
assert.match(chipCss, /:host\s*\{[^}]*container-type:\s*inline-size/, ":host ist Query-Container");
assert.match(chipCss, /ha-card\s*\{[^}]*overflow:\s*hidden/, "ha-card schneidet überstehenden Inhalt ab");
// Gilt nur, solange keine Container-Query ins RIG_CSS wandert: beide teilen sich den <style>.
assert.equal(chipCss.match(/@container/g).length, 4, "vier Abrüst-Stufen für enge Container");
assert.match(chipCss, /@container \(max-width: 44px\) \{ ha-card \{ display:none/, "überbuchte Zeile blendet die Karte ganz aus");
assert.ok(!card.classList.contains("pixel-no-chip"), "Host sichtbar, solange show_status gilt");

// --- Theme: ein Signal, zwei Rigs (Overlay-Tier am body und Chip-Tier im Shadow Root)
const petEl = overlay.querySelector(".pixel-pet");
const chipEl = card.shadowRoot.querySelector(".chip-pet");
// Das Mock-hass hat kein themes-Objekt, also greift der matchMedia-Stub (matches: false) -> hell.
assert.ok(petEl.classList.contains("theme-light"), "ohne HA-Theme faellt die Card auf hell zurueck");
assert.ok(chipEl.classList.contains("theme-light"), "das Chip-Rig bekommt dasselbe Signal");

// Theme-Wechsel, ohne dass sich ein einziges Sensor-Attribut aendert.
card.hass = { ...hass, themes: { darkMode: true } };
await tick(10);
assert.ok(!petEl.classList.contains("theme-light"), "hass.themes.darkMode schaltet auf dunkel");
assert.ok(!chipEl.classList.contains("theme-light"), "der Chip zieht mit");
card.hass = { ...hass, themes: { darkMode: false } };
await tick(10);
assert.ok(petEl.classList.contains("theme-light"), "und wieder zurueck auf hell");

// --- Ei: keine harten Farben mehr, dafuer Tokens und eine Kontur
const eggMarkup = overlay.querySelector(".egg").innerHTML;
assert.ok(!/#f5f0e1|#a8d8a8|#c9b99a/i.test(eggMarkup), "keine hartkodierten Eifarben mehr im Markup");
assert.match(eggMarkup, /var\(--pixel-egg\)/, "die Schale nutzt ein Token");
assert.ok(overlay.querySelector(".egg .egg-outline"), "Kontur-Pfad vorhanden");

// Die Hellvariante muss NACH den Stufenregeln stehen, sonst gewinnt bei gleicher
// Spezifitaet (0,2,0) die Stufenregel und der Senior bleibt auf Hell unsichtbar.
const rigCss = card.shadowRoot.querySelector("style").textContent;
assert.ok(
  rigCss.indexOf(".pixel-pet.theme-light {") > rigCss.indexOf(".pixel-pet.stage-senior"),
  "Hellvariante steht nach den Stufenregeln",
);

// --- Menue und Statistik folgen dem HA-Theme statt fester Dunkelwerte
const overlayCss = overlay.querySelector("style").textContent;
for (const v of ["--card-background-color", "--primary-text-color", "--divider-color", "--secondary-text-color"]) {
  assert.ok(overlayCss.includes(v), `Panel nutzt ${v}`);
}
assert.ok(!/rgba\(20,\s*20,\s*20/.test(overlayCss), "keine hartkodierten dunklen Panels mehr");
assert.match(overlayCss, /\.pixel-overlay\.theme-light\s*\{/, "themenrichtige Fallbacktoken vorhanden");

const hidden = document.createElement("pixel-card");
hidden.setConfig({ entity: "sensor.pixel_status", show_status: false });
assert.ok(hidden.classList.contains("pixel-no-chip"), "ohne Chip wird der Host selbst ausgeblendet");
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

// Häufchen: getrennte Positionen und einzeln wegputzen
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "happy", attributes: { ...attrs, poop_count: 3 } } } };
await tick(10);
const haufen = () => [...overlay.querySelectorAll(".pixel-poop")];
assert.equal(haufen().length, 3, "drei Häufchen gerendert");

// Frueher lagen alle auf floorY - 26. _poopSpot() streut jetzt ueber Kartenoberkanten und
// Boden. 40 Ziehungen statt der drei gerenderten, damit der Test nicht vom Zufall abhaengt.
const hoehen = new Set(Array.from({ length: 40 }, () => card._brain._poopSpot().y));
assert.ok(hoehen.size > 1, `Häufchen streuen über mehrere Höhen (gesehen: ${[...hoehen]})`);

// Ein frisch passiertes Häufchen gehört dorthin, wo das Tier gerade steht.
card._brain.o.place(321, 234);
card._brain._freshPoop = true;
// Feldweise vergleichen: Objekte aus dem jsdom-Realm haben ein anderes Object.prototype,
// deepEqual wuerde daran scheitern.
const frisch = card._brain._poopSpot();
assert.equal(frisch.x, 321, "frisches Häufchen landet beim Tier (x)");
assert.equal(frisch.y, 234, "frisches Häufchen landet beim Tier (y)");
assert.equal(card._brain._freshPoop, false, "das Flag wird dabei verbraucht");

const mitte = haufen()[1];
mitte.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
assert.equal(calls.at(-1)[1], "clean");
assert.equal(calls.at(-1)[2].count, 1, "es wird genau eines weggeputzt");
assert.equal(haufen().length, 2, "nur das angetippte verschwindet");
assert.ok(!haufen().includes(mitte), "und zwar genau das angetippte");

// Auch der Besen im Menü putzt einzeln
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "happy", attributes: { ...attrs, poop_count: 2 } } } };
await tick(10);
overlay.querySelector(".pixel-pet").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
await tick(10);
[...overlay.querySelectorAll(".pixel-menu button")].at(-1).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
assert.equal(JSON.stringify(calls.at(-1)), JSON.stringify(["pixel", "clean", { count: 1, config_entry_id: "x" }]), "Besen putzt eines");

card.hass = { ...hass, states: { "sensor.pixel_status": { state: "happy", attributes: { ...attrs, poop_count: 1 } } } };
await tick(10);

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
// Kern der 0.1.2-Regression: _covered() sah den eigenen Clip als fremde Verdeckung und
// blockierte damit _peek(), den einzigen Weg aus dem Versteck heraus. jsdom kennt
// elementFromPoint nicht, deshalb wird der Treffertest hier gestubbt - sonst greift
// schon der Feature-Guard und der Test waere wirkungslos.
document.elementFromPoint = () => document.querySelector("hui-calendar-card ha-card");
assert.equal(card._brain._covered(), false, "der eigene Clip zaehlt nicht als Verdeckung");
const echtesVersteck = card._brain.hiding;
card._brain.hiding = null;
assert.equal(card._brain._covered(), true, "eine fremde Karte davor zaehlt sehr wohl");
card._brain.hiding = echtesVersteck;
delete document.elementFromPoint;
// Der Kopf muss ueber der Kartenkante stehen bleiben, sonst ist das Tier faktisch weg.
const sank = card._brain.hiding.top - card._brain.o.pos.y;
assert.ok(Math.abs(sank) < card._brain.o.size, "das Tier sinkt nicht komplett hinter die Karte");

document.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 250, clientY: 120 }));
await tick(600);
assert.equal(card._brain.hiding, null, "aufgescheucht");
assert.equal(overlay.querySelector(".pixel-pet").style.clipPath, "", "Clip entfernt");

// Gebaute Objekte: anzeigen, platzieren, einzeln antippen
const bauten = [
  { id: "b1", kind: "house", rx: 0.2, created: "2026-09-16T10:00:00+00:00" },
  { id: "b2", kind: "golf", rx: 0.8, created: "2026-09-16T11:00:00+00:00" },
];
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "happy", attributes: { ...attrs, builds: bauten } } } };
await tick(10);
const objekte = () => [...overlay.querySelectorAll(".pixel-build")];
assert.equal(objekte().length, 2, "zwei Objekte gerendert");
assert.equal(card._brain.builds.length, 2, "Brain kennt die Objekte");

// Waagerecht aus dem Backend: rx 0.2 muss links von rx 0.8 liegen.
const [links, rechts] = objekte().map((e) => parseFloat(e.style.left));
assert.ok(links < rechts, "rx bestimmt die waagerechte Reihenfolge");

// Senkrecht aus dem eigenen Layout: das Objekt steht auf einer Karte oder dem Boden.
const objektHoehen = objekte().map((e) => parseFloat(e.style.top));
const flaechen = [...card._brain.f.climbable().map((c) => c.top), card._brain.f.floorY];
for (const [i, el] of objekte().entries()) {
  const unterkante = objektHoehen[i] + parseFloat(el.style.height);
  assert.ok(flaechen.some((f) => Math.abs(f - unterkante) < 1), "Objekt steht auf einer Flaeche, nicht in der Luft");
}

// Antippen entfernt genau dieses und ruft den Service mit seiner id.
objekte()[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
assert.equal(calls.at(-1)[1], "remove_build");
assert.equal(calls.at(-1)[2].build_id, "b1", "die id des angetippten Objekts");
assert.equal(objekte().length, 1, "nur das angetippte verschwindet");

// Spielen: das Backend nennt das Objekt im Event, die Card geht hin statt Purzelbaum.
{
  let besucht = null;
  let purzelbaum = 0;
  const origVisit = card._brain._visitBuild;
  const origTrick = card._brain._trick;
  card._brain._visitBuild = async (b) => { besucht = b; };
  card._brain._trick = async () => { purzelbaum++; };
  card._brain.busy = false;
  subscriber({ data: { entry_id: "x", type: "played", build_id: "b2", build_kind: "golf" } });
  await tick(10);
  assert.equal(besucht?.id, "b2", "played mit build_id fuehrt zum genannten Objekt");
  assert.equal(purzelbaum, 0, "kein Purzelbaum, wenn ein Objekt genannt ist");
  subscriber({ data: { entry_id: "x", type: "played", build_id: null, build_kind: null } });
  await tick(10);
  assert.equal(purzelbaum, 1, "ohne Objekt bleibt der Purzelbaum");
  assert.equal(card._brain.busy, false, "danach wieder frei");
  card._brain._visitBuild = origVisit;
  card._brain._trick = origTrick;
}

// Golf: die Schlagplanung ist eine reine Funktion mit injizierbarem Zufall.
{
  const golf = await import(new URL("../../custom_components/pixel/frontend/golf.js", import.meta.url).href);
  const mitte = (a, b) => (a + b) / 2;
  assert.deepEqual(golf.planStrokes(30, mitte), [30], "kurze Distanz: ein Schlag");
  assert.deepEqual(golf.planStrokes(100, (a) => a), [100], "Hole-in-one");
  assert.deepEqual(golf.planStrokes(100, mitte), [60, 40], "zwei Schlaege, Summe stimmt");
  const drei = golf.planStrokes(200, (a, b) => a + (b - a) * 0.999);
  assert.equal(drei.length, 3, "drei Schlaege");
  assert.equal(drei.reduce((s, x) => s + x, 0), 200);
  const gesehen = new Set();
  for (let i = 0; i < 300; i++) {
    const d = 40 + Math.floor(Math.random() * 461);
    const s = golf.planStrokes(d);
    assert.equal(s.reduce((a, x) => a + x, 0), d, "Summe = Distanz");
    assert.ok(s.length >= 1 && s.length <= golf.MAX_STROKES, "1 bis 3 Schlaege");
    assert.ok(s.every((x) => x > 0), "kein Schlag der Laenge 0");
    gesehen.add(s.length);
  }
  assert.deepEqual([...gesehen].sort(), [1, 2, 3], "alle drei Varianten kommen vor");
}
// Standflaeche fuer Abschlag und Landepunkte: ueber einer Karte deren Oberkante, daneben der Boden.
{
  const karte = card._brain.f.climbable()[0];
  assert.equal(card._brain._surfaceY((karte.x1 + karte.x2) / 2), karte.top, "ueber der Karte");
  assert.equal(card._brain._surfaceY(card._brain.f.bounds.right - 1), card._brain.f.floorY, "am Rand der Boden");
}

// Der Besuch ist eine Datenzeile in der Aktionstabelle, sobald etwas steht.
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "happy", attributes: { ...attrs, builds: [] } } } };
await tick(10);
assert.equal(objekte().length, 0, "ohne Objekte im Snapshot bleibt nichts stehen");

// Verweilen: Ortswechsel muessen deutlich in der Minderheit sein.
// Frueher bekam der Fallback _walkRandom() ueber die Haelfte aller Ticks, zusammen mit
// _hide und _kickCard waren 88 Prozent der Ticks ein Ortswechsel.
const { chooseIdleAction } = await import(
  new URL("../../custom_components/pixel/frontend/idle.js", import.meta.url).href
);
const neutral = { mood: "happy", media_playing: false, weather: "cloudy" };
const gezogen = Array.from({ length: 4000 }, () => chooseIdleAction(card._brain, neutral, false));
const wechselAnteil = gezogen.filter((a) => !a.still).length / gezogen.length;
assert.ok(wechselAnteil < 0.45, `Ortswechsel in der Minderheit (gemessen: ${Math.round(wechselAnteil * 100)} %)`);
assert.ok(wechselAnteil > 0.15, `aber nicht bewegungslos (gemessen: ${Math.round(wechselAnteil * 100)} %)`);

// Waehrend des Verweilens darf keine Zeile mit Ortswechsel gezogen werden.
const nurStill = Array.from({ length: 500 }, () => chooseIdleAction(card._brain, neutral, true));
assert.ok(nurStill.every((a) => a.still), "beim Verweilen nur ortsfeste Aktionen");

// Nach einem Ortswechsel setzt _chooseIdleAction eine Verweilzeit.
card._brain._dwellUntil = 0;
card._brain.busy = false;
while (Date.now() >= card._brain._dwellUntil) await card._brain._chooseIdleAction(neutral);
assert.ok(card._brain._dwellUntil > Date.now(), "nach einem Ortswechsel wird verweilt");
card._brain._dwellUntil = 0;

// Watchdog: aus einem festhaengenden Versteck muss recover() herausfuehren
card._brain.hiding = card._brain.f.byType("calendar");
card._brain._hidingSince = Date.now() - 1000 * 60 * 60;
card._brain.busy = true;
card._brain.o.clipBelow(card._brain.hiding.top);
assert.ok(card._watchdog, "Watchdog laeuft");
card._watchdog.check();
assert.equal(card._brain.hiding, null, "Watchdog loest das Versteck");
assert.equal(card._brain.busy, false, "Watchdog loest die Blockade");
assert.equal(overlay.querySelector(".pixel-pet").style.clipPath, "", "Watchdog entfernt den Clip");

// Eine Exception im Idle-Schritt darf die Schleife nicht toeten
const echterSchritt = card._brain._loopStep.bind(card._brain);
card._brain._loopStep = () => { throw new Error("Testfehler"); };
card._brain._lastLoopAt = 0;
await tick(50);
card._brain._loopStep = echterSchritt;
assert.ok(card._brain.running, "Schleife laeuft nach einer Exception weiter");

// Zustand ändern: schlafen
// Urlaub: Sonnenhut und Cocktail sind gewoehnliche Outfit-Layer, keine Sonderlogik in der Card.
card.hass = { ...hass, states: { "sensor.pixel_status": { state: "vacation", attributes: { ...attrs, vacation: true, mood: "vacation", outfit: { hat: "sun_hat", item: "cocktail" } } } } };
await tick(10);
assert.ok(overlay.querySelector(".hat-sun_hat.on"), "Sonnenhut im Urlaub");
assert.ok(overlay.querySelector(".item-cocktail.on"), "Cocktail im Urlaub");
assert.ok(!overlay.querySelector(".acc-sunglasses.on"), "Sonnenbrille ist im Urlaubsoutfit nicht gesetzt");

card.hass = { ...hass, states: { "sensor.pixel_status": { state: "sleeping", attributes: { ...attrs, sleeping: true, outfit: { hat: "sleep_cap" } } } } };
await tick(10);
assert.ok(overlay.querySelector(".hat-sleep_cap.on"), "Schlafmütze");
assert.ok(overlay.querySelector(".eyes-closed.on"), "Augen zu");

// Feste Leiste am unteren Rand: die Bodenlinie muss darueber liegen.
// jsdom kennt weder elementFromPoint noch Layout, beides wird darum nur hier gestubbt.
const bar = document.createElement("navbar-card");
bar.id = "bar";
rects.bar = [0, 740, 390, 60];
document.body.appendChild(bar);
// Auf globalThis stubben, nicht auf window: der Modulcode laeuft im Node-Realm und
// greift auf das globale getComputedStyle zu, das beim Import gebunden wurde.
const realComputedStyle = globalThis.getComputedStyle;
globalThis.getComputedStyle = (el) => (el === bar ? { position: "fixed" } : realComputedStyle(el));
document.elementFromPoint = () => bar;
card._brain.f.scan();
assert.equal(card._brain.f.floorY, 740 - 12, "Bodenlinie liegt oberhalb der festen Leiste");
delete document.elementFromPoint;
card._brain.f.scan();
assert.equal(card._brain.f.floorY, 800 - 12, "ohne Treffertest bleibt es beim Fensterrand");
globalThis.getComputedStyle = realComputedStyle;
bar.remove();

// View-Wechsel: solange die alte Karte noch haengt, haelt sie das Tier; danach uebernimmt die neue.
// Ohne die Uebergabe im _unmount blieb das Tier hier bis zum Neuladen der Seite weg.
const second = document.createElement("pixel-card");
document.querySelector("hui-masonry-view").appendChild(second);
second.setConfig({ entity: "sensor.pixel_status" });
second.hass = hass;
await tick(20);
assert.equal(window.__pixelOverlayOwner, card, "die erste Karte behaelt das Tier");
assert.ok(!second._overlay, "die zweite haelt sich zurueck");

card.remove();
await tick(20);
assert.equal(window.__pixelOverlayOwner, second, "Uebergabe beim Abbau der alten Karte");
assert.ok(document.querySelector(".pixel-overlay .pixel-pet svg"), "Tier ist nach dem Wechsel wieder da");

// Unmount räumt auf
second.remove();
await tick(10);
assert.equal(document.querySelector(".pixel-overlay"), null, "Overlay entfernt");
assert.equal(window.__pixelOverlayOwner, null, "Owner freigegeben");

await tick(100);
assert.deepEqual(errors, [], "keine Laufzeitfehler");
console.log("card.smoke.test: OK");
process.exit(0);
