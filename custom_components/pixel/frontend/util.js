/** Kleine Helfer ohne eigenen Zustand: Zufall, Zeit, DOM-Suche durch Shadow Roots. */

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Anteil von ``v`` in der Spanne lo..hi, auf 0..1 begrenzt. Umkehrung: lo + r * (hi - lo). */
export const ratio = (v, lo, hi) => (hi - lo > 0 ? clamp((v - lo) / (hi - lo), 0, 1) : 0);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Ermittelt, ob das Dashboard gerade hell oder dunkel dargestellt wird.
 * `hass.themes.darkMode` folgt der Profileinstellung des Nutzers (inklusive "automatisch")
 * und ist damit zuverlaessiger als prefers-color-scheme, das nur das Betriebssystem kennt.
 */
export function resolveTheme(hass) {
  if (typeof hass?.themes?.darkMode === "boolean") return hass.themes.darkMode ? "dark" : "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

/** Alle Elemente eines Selektors – auch durch Shadow Roots hindurch. */
export function deepQueryAll(root, selector, out = [], depth = 0) {
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
export function deepElementFromPoint(x, y) {
  let el = document.elementFromPoint?.(x, y) || null;
  for (let i = 0; i < 20 && el?.shadowRoot; i++) {
    const inner = el.shadowRoot.elementFromPoint?.(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

/** Das Lovelace-Element (hui-*-card oder Custom Card), zu dem eine ha-card gehört. */
export function cardHostOf(haCard) {
  let el = haCard.getRootNode()?.host || haCard.parentElement;
  for (let i = 0; i < 4 && el; i++) {
    const name = el.localName || "";
    if (name.startsWith("hui-") || name.includes("-card")) return el;
    el = el.parentElement || el.getRootNode()?.host || null;
  }
  return haCard.getRootNode()?.host || haCard.parentElement;
}

/** Vom Card-Element nach oben zur umgebenden Lovelace-View laufen. */
export function findViewElement(start) {
  let el = start;
  for (let i = 0; i < 40 && el; i++) {
    const name = el.localName || "";
    if (name.startsWith("hui-") && name.endsWith("-view")) return el;
    el = el.parentElement || el.getRootNode()?.host || null;
  }
  return null;
}
