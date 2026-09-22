/**
 * Golf: die Schlagplanung als reine Funktion, damit sie ohne DOM testbar ist.
 *
 * Das Tier schlaegt irgendwo auf dem Dashboard ab. Entweder trifft es mit einem Schlag
 * (Hole-in-one), oder der Ball landet vor der Fahne, das Tier geht hin und schlaegt
 * erneut - hoechstens MAX_STROKES Mal. Die Summe der Schlaege ist immer die ganze Distanz.
 */

import { rnd } from "./util.js";

export const TEE_MIN = 60; // naeher lohnt keinen Anlauf
export const TEE_MAX = 500; // haelt die ganze Runde deutlich unter der Watchdog-Grenze
export const MIN_ROOM = 40; // darunter: kurzer Putt direkt neben der Fahne
export const MAX_STROKES = 3;
const STROKE_WEIGHTS = [
  [1, 30],
  [2, 40],
  [3, 30],
];

/** Zieht einen Wert nach Gewicht; ``random(a, b)`` ist injizierbar fuer Tests. */
function pickWeighted(weights, random) {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random(0, total);
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1][0];
}

/** Schlaglaengen fuer ``distance`` Pixel: 1..MAX_STROKES Eintraege, alle > 0, Summe = Distanz. */
export function planStrokes(distance, random = rnd) {
  const total = Math.round(Math.abs(distance));
  if (total < MIN_ROOM) return [total];
  const count = Math.min(MAX_STROKES, pickWeighted(STROKE_WEIGHTS, random));
  const strokes = [];
  let rest = total;
  while (strokes.length < count - 1) {
    const len = Math.round(rest * random(0.45, 0.75));
    strokes.push(len);
    rest -= len;
  }
  strokes.push(rest);
  return strokes;
}
