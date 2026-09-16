/**
 * Was das Tier im Leerlauf tut, als gewichtete Tabelle.
 *
 * Frueher war das eine if-Kaskade, die EINE Zufallszahl gegen aufsteigende Schwellen
 * verglich. Die Schwellen waren damit keine unabhaengigen Wahrscheinlichkeiten, sondern
 * Intervalle auf derselben Zahl: eine zutreffende Stimmungsregel hat den generischen
 * Aktionen die unteren Intervalle weggefressen, und der Fallback "herumlaufen" bekam
 * ueber die Haelfte aller Ticks. Als Tabelle ist jedes Gewicht ein echter Anteil, und
 * eine neue Aktion ist eine Zeile statt eines Eingriffs in verzweigte Logik.
 *
 * `still: true` markiert Aktionen ohne Ortswechsel. Solange das Tier verweilt, werden
 * ausschliesslich solche Zeilen gezogen.
 */

import { reducedMotion } from "./util.js";

export const IDLE_ACTIONS = [
  // Stimmung und Wetter - das Tier kommentiert, was gerade los ist.
  { weight: 30, still: false, when: (b, s) => s.mood === "hungry", run: (b) => b._pointAt("entit", b.t("hungry")) },
  { weight: 30, still: false, when: (b, s) => s.mood === "stressed", run: (b) => b._pointAt("calendar", b.t("stressed")) },
  { weight: 25, still: true, when: (b, s) => s.mood === "lonely", run: (b) => b.o.say(b.t("lonely"), 1800) },
  { weight: 25, still: true, when: (b, s) => s.mood === "bored", run: (b) => b.o.say(b.t("bored"), 1800) },
  { weight: 30, still: true, when: (b, s) => s.media_playing && !reducedMotion(), run: (b) => b._dance() },
  { weight: 8, still: true, when: (b, s) => s.weather === "rainy", run: (b) => b.o.say(b.t("rain"), 1000) },
  { weight: 8, still: true, when: (b, s) => s.weather === "sunny", run: (b) => b.o.say(b.t("sunny"), 1400) },

  // Ortsfeste Kleinigkeiten - sie tragen das Verweilen.
  { weight: 60, still: true, when: () => true, run: (b) => b._linger() },
  { weight: 10, still: true, when: () => true, run: (b) => b._jump() },
  { weight: 8, still: true, when: () => !reducedMotion(), run: (b) => b._trick("wave") },

  // Ortswechsel - bewusst in der Minderheit.
  { weight: 16, still: false, when: (b) => b.builds.length > 0, run: (b) => b._visitBuild() },
  { weight: 18, still: false, when: () => true, run: (b) => b._walkRandom() },
  { weight: 8, still: false, when: () => true, run: (b) => b._hide() },
  { weight: 5, still: false, when: () => !reducedMotion(), run: (b) => b._trick("tumble") },
  { weight: 5, still: false, when: () => true, run: (b) => b._kickCard() },
];

/** Zieht eine passende Aktion. `stillOnly` beschraenkt auf Zeilen ohne Ortswechsel. */
export function chooseIdleAction(brain, snap, stillOnly) {
  const options = IDLE_ACTIONS.filter((a) => (!stillOnly || a.still) && a.when(brain, snap));
  const total = options.reduce((sum, a) => sum + a.weight, 0);
  if (!total) return null;
  let roll = Math.random() * total;
  for (const action of options) {
    roll -= action.weight;
    if (roll <= 0) return action;
  }
  return options[options.length - 1];
}
