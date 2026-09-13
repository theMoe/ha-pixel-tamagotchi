# PROJEKTSTAND – Pixel, Dashboard-Tamagotchi für Home Assistant

> Briefing für die nächste Session. Zuerst lesen, dann `README.md` für Nutzersicht, `docs/KONZEPT.md` für die Idee.
> Stand: 11.09.2026 · Version 0.1.0 · getestet gegen HA 2026.9.0 / 2026.8.3 / 2025.1.4 · Autor: Moritz (GitHub theMoe), Umsetzung mit Claude.

## 1. Was ist das

Ein Tamagotchi, das als Overlay über ein HA-Dashboard läuft, sich hinter Karten versteckt und auf den Zustand des Hauses reagiert (Wetter → Outfit, Kalender → Stress, Anwesenheit → Einsamkeit/Freude, Musik → Tanzen). Zwei Schichten:

- **Integration** `custom_components/pixel` (Python): Spiellogik, Entities, Services, Persistenz, Event-Bus, liefert die Card aus.
- **Card** `custom_components/pixel/frontend/pixel-card.js` (Vanilla Web Component, kein Build, kein CDN): Rendering, Bewegung, Verstecken, Interaktion.

Zielumgebung des Nutzers: wandmontiertes Touch-Display (Raspberry Pi 4, Kiosk) mit Familien-Dashboard (Kalender, Personen-Karten, `browser_mod`, `custom:button-card`), Home Assistant mit Sonos, Apple-Home-Anwesenheit, Fenstersensoren.

## 2. Architektur (Karte für die nächste Session)

```
custom_components/pixel/
  engine/                 ← REINE Domänenlogik, importiert kein homeassistant
    models.py             PetState (persistiert), WorldContext (Eingabe), GameEvent, Enums
    config.py             GameConfig: ALLE Balancing-Zahlen, FeedingWindow
    rules.py              Tick-Regeln, je eine Klasse; Reihenfolge in default_rules()
    evaluators.py         MoodEvaluator (Prioritätsliste), OutfitResolver, StressEvaluator
    actions.py            PetActions: feed/play/pet/clean/medicine/sleep/wake/set_mood/reset
    engine.py             PetEngine-Fassade: tick(), act(), snapshot()  ← einziger Einstieg
  settings.py             ConfigEntry → PixelSettings (+GameConfig); parst Fütterungsfenster
  world.py                WorldAdapter: HA-States → WorldContext (Wetter-Map, calendar.get_events mit 5-min-Cache, zone.home, media_player)
  store.py                PetStore um homeassistant.helpers.storage.Store (Key pixel.<entry_id>)
  coordinator.py          PixelCoordinator: 60-s-Tick, async_act(), feuert pixel_event, speichert, data = Snapshot-Dict
  services.py             Tabelle ServiceSpec → generische Registrierung; ermittelt Nutzer für Statistik
  frontend.py             static path /pixel-static + add_extra_js_url → Card ohne Ressourcen-Eintrag
  config_flow.py          3 Schritte (Name, Welt, Spielregeln) + OptionsFlow; Optionsänderung ohne Neustart
  entity.py               PixelEntity-Basis (Device "Pixel")
  sensor.py / binary_sensor.py / select.py / switch.py / button.py   Deskriptor-Tabellen, value_fn-Lambdas
  translations/de.json, en.json, strings.json   (Schlüssel identisch, geprüft)
  services.yaml, manifest.json
tests/
  engine/                 34 Tests, reine Python, kein HA nötig (conftest hängt engine/ in sys.path)
  test_integration.py     10 Tests mit pytest-homeassistant-custom-component (Setup, Services, Reload, Optionen)
  frontend/card.smoke.test.mjs   jsdom-Smoke-Test der Card (Mount, Scan, Menü, Events, Verstecken, Unmount)
docs/  KONZEPT.md, prototyp.html (Wegwerf-Prototyp), card-demo.html (echte Card + Mock-hass)
```

**Datenfluss:** Coordinator-Tick → `WorldAdapter.build()` → `engine.tick(world)` → Regeln mutieren `PetState`, sammeln `GameEvent`s → Mood/Outfit/Activity ableiten → Events auf `pixel_event` → `snapshot()` als `coordinator.data` → Entities lesen daraus → `sensor.<name>_status` trägt **alle** Attribute für die Card.

**Card:** liest nur `sensor.*_status`-Attribute (ein Subscription-Punkt) + `pixel_event` via `hass.connection.subscribeEvents`. Aktionen über `hass.callService("pixel", …, {config_entry_id})`.

## 3. Wichtige Entscheidungen (nicht erneut diskutieren, außer mit neuem Grund)

1. **Engine ohne HA-Import** – testbar in 0,1 s, HA-Update-resistent. Neue Mechanik = neue Regel-Klasse in `rules.py` + Eintrag in `default_rules()`.
2. **Overlay am `document.body`, `position: fixed`, Karten-Rechtecke in Viewport-Koordinaten.** Verstecken hinter Karten wird durch `clip-path: inset(...)` simuliert (das Tier liegt technisch *über* der Karte). Grund: Shadow-DOM von Lovelace macht ein echtes Einfügen unter Karten unzuverlässig.
3. **Karten-Scan** über `deepQueryAll(view, "ha-card")` durch alle Shadow Roots; Typ = Host-Element (`hui-calendar-card` → `calendar`). Eigene Card ausgeschlossen. Rescan bei resize/scroll (debounced) und 0,8 s nach Mount.
4. **Card wird von der Integration ausgeliefert** (`async_register_static_paths` + `add_extra_js_url`) → keine manuelle Ressource. Mindestens HA 2024.8 (hacs.json).
5. **Entity-IDs folgen englischen Namen** (HA-Verhalten). Englische Namen wurden deshalb an die Schlüssel angeglichen (`sensor.pixel_hunger`, `button.pixel_medicine`). Semantik: Hunger-Sensor 100 = satt.
6. **Kein Tod per Default** (Ohnmacht + Medizin + Futter). Hardcore als Option → `_rebirth`.
7. **Max. 12 h Nachrechnung** nach Ausfall (`MAX_TICK_HOURS`).
8. **Ein Tier pro Seite** (`window.__pixelOverlayOwner`), Position wird nicht zwischen Clients gesynct (bewusst verschoben, siehe Backlog).
9. **Texte der Card** liegen in `Texts` (de/en) in der JS-Datei; Sprache aus `hass.locale.language`.
10. **Wer füttert** kommt aus `call.context.user_id` → `feeds_by_user` (Familienstatistik).

## 4. Konventionen

- Python 3.12+, Ruff (`pyproject.toml`: line-length 120, Regeln E F I UP B SIM RUF ANN). `ruff check . && ruff format .` muss sauber sein.
- Kommentare/Docstrings Deutsch, Code-Identifier Englisch. Kein Gedankenstrich in `.py` (RUF002).
- Jede Regel/Aktion/Entity ist eine kleine Klasse oder Tabellenzeile; keine Logik in Lambdas außer `value_fn`.
- Balancing **nur** in `engine/config.py` ändern; Nutzeroptionen darüber in `settings.py` mappen.
- Neue Events: in `rules.py`/`actions.py` emitten → in `pixel-card.js` `Brain.onEvent` behandeln → in `README.md` Events-Liste ergänzen.
- Neue Outfit-Teile: `OutfitResolver` (Name) + SVG-Layer `hat-*`/`acc-*`/`item-*` im `RIG_SVG` + Test in `test_actions.py::test_weather_outfits`.
- Vor Abgabe: `python -m pytest`, `ruff`, `node --check pixel-card.js`, `node tests/frontend/card.smoke.test.mjs`.

## 5. Verifikationsstand – ehrlich

| Bereich | Status |
|---|---|
| Engine | 34 Tests grün. Balancing plausibel, aber **nicht im Alltag erprobt** (Zahlen ggf. nach 1–2 Wochen nachjustieren). |
| Integration | 10 Tests grün gegen **HA 2026.9.0 und 2026.8.3 (Python 3.14)** sowie 2025.1.4 (Python 3.12); keine Deprecation-Hinweise zu `custom_components.pixel`. Ruff sauber unter 3.14. **Nicht auf einer Live-Instanz gestartet.** |
| Config-Flow | Programmatisch geprüft (Import, Schema). UI-Durchlauf nicht getestet. |
| Card | jsdom-Smoke-Test grün, `node --check` sauber, Demo-Seite vorhanden. **Im echten HA-Frontend noch nie gelaufen.** Höchstes Restrisiko: Shadow-DOM-Scan in Sections-View, z-index gegenüber HA-Header/Dialogen, Touch-Verhalten auf dem Pi-Kiosk. |
| HACS | `hacs.json` vorhanden; Repository muss auf GitHub liegen und als Custom Repository (Integration) eingebunden werden. Nicht getestet. |

## 6. Erste Live-Inbetriebnahme – Checkliste für den Nutzer/nächste Session

1. Repo nach GitHub `theMoe/ha-pixel-tamagotchi` pushen (oder Ordner manuell nach `config/custom_components/pixel` kopieren).
2. HA neu starten, Log auf `custom_components.pixel` prüfen.
3. Integration hinzufügen (Wetter, Kalender, Sonos, `zone.home`).
4. `sensor.pixel_status` in den Entwicklerwerkzeugen prüfen (Attribute vollständig? `outfit` passend zum Wetter?).
5. Card in die Sections-View des Wandtablets legen, hart neu laden, Konsole auf `PIXEL-CARD loaded` prüfen.
6. Beobachten: läuft es auf Karten? Versteckt es sich hinter dem Kalender? Menü per Tap? Long-Press-Statistik?
7. Bei Problemen mit dem Scan: in der Konsole `document.querySelector("pixel-card")._brain.f.cards` ansehen.
8. Performance auf dem Pi 4: bei Rucklern `scale` verkleinern, `idle_min_seconds` erhöhen, ggf. `switch.pixel_animations` per Präsenz steuern.

## 7. Backlog (priorisiert)

**P1 – nach erstem Live-Test wahrscheinlich nötig**
- Card-Feinschliff aus Live-Feedback (Scan-Robustheit, z-index, Touch).
- Balancing-Justage nach realer Nutzung (Tempo, Fütterungsfenster, Häufchen-Frequenz).
- Visueller Editor für die Card (`getConfigElement`) – aktuell nur YAML/Karten-Picker mit Stub.

**P2 – Konzept-Features noch offen**
- Positions-Sync über mehrere Clients (Backend-Entity `position`, Card interpoliert).
- Weitere Tricks aus dem Konzept: Sensorziffern „stehlen“, Seifenblasen, Kreide-Smiley, Angeln, Schaukeln, Schlafwandeln.
- Weitere Trigger: Fenster offen bei Kälte (Schal, zeigt auf Fenster-Kachel), Luftqualität (Maske), Batterie leer (trägt Batterie), Müllabfuhr-Kalender, PV-Überschuss.
- Träume beim Schlafen, Besuch bei Gästen, Haustier-Tagebuch (Markdown-Sensor), saisonale Quests.
- Sound-Hooks (Sonos) als Automations-Blueprints statt im Code.
- Pixel-Sprite-Sequenzen für Sonderaktionen (Purzelbaum, Schneemann) als Ergänzung zum SVG-Rig.
- Stufen-Designs: Ei/Baby/Senior sind bisher nur Farbe/Form, Kind/Teen/Erwachsen identisch.

**P3 – Qualität**
- Diagnostics-Plattform (`diagnostics.py`) für Support.
- Repairs-Issue, wenn Wetter-/Kalender-Entity fehlt.
- GitHub Actions: pytest, ruff, hassfest, HACS-Validation.
- Card in TypeScript/Lit mit Build – nur wenn die Datei > ~1500 Zeilen wird.

## 8. Bekannte Stolpersteine

- `deepQueryAll` steigt in **jeden** Shadow Root ab – bei sehr großen Dashboards (>200 Karten) den Scan drosseln.
- `add_extra_js_url` wirkt erst nach Browser-Reload; die Card-Datei wird mit `?v=VERSION` gecacht → bei Änderungen **`VERSION` in `const.py` und `manifest.json` erhöhen**.
- `calendar.get_events` liefert `uid` nicht bei allen Kalender-Integrationen; Fallback-UID = entity+title+start.
- `zone.home` zählt nur `person.*` mit Tracker. Ohne Tracker → `persons_home` None → Einsamkeits-/Heimkehr-Logik inaktiv (gewollt).
- Tests: `pytest-homeassistant-custom-component` muss zur HA-Version passen (0.13.363 ↔ 2026.9.0, 0.13.357 ↔ 2026.8.3, 0.13.205 ↔ 2025.1.4; siehe `requirements_test.txt`). HA 2026.x braucht **Python ≥ 3.14.2** – am einfachsten `uv python install 3.14` + `uv venv`. `home-assistant-frontend` (Version aus dem `frontend`-Manifest) wird für die Abhängigkeit im Test benötigt.
- jsdom-Test stubbt `getBoundingClientRect`; Layout-Fragen (Überlappung, Clip-Optik) sind damit **nicht** abgedeckt → `docs/card-demo.html` im Browser öffnen.
