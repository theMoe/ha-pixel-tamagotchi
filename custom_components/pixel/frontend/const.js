/** Konstanten und Standardkonfiguration der Card. */

export const CARD_TAG = "pixel-card";
export const DOMAIN = "pixel";
export const EVENT_TYPE = "pixel_event";
export const PET_BASE_SIZE = 64;
// Wie tief das Tier beim Verstecken hinter die Kartenkante sinkt, als Anteil seiner Groesse.
// Das Rig zeichnet in viewBox "-4 -4 24 22", also 2,67 px je Einheit bei 2,67 px Versatz:
// die Kopfoberkante liegt bei 18,7 px. Bei 0.6 bleiben 25,6 px sichtbar, der Kopf lugt also
// ueber die Kante. Der fruehere Wert 0.8 liess nur 12,8 px stehen - da war nichts mehr zu sehen.
export const HIDE_SINK = 0.6;
export const HIDE_MAX_SECONDS = 90; // danach kommt das Tier von selbst wieder hervor
export const WATCHDOG_INTERVAL_MS = 20000;

export const DEFAULT_CONFIG = {
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
