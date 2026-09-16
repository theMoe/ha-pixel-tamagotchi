# PROJEKTSTAND – Pixel, Dashboard-Tamagotchi für Home Assistant

> Briefing für die nächste Session. Zuerst lesen, dann `README.md` für Nutzersicht, `docs/KONZEPT.md` für die Idee.
> Stand: 16.09.2026 · Version 0.1.4 · getestet gegen HA 2026.9.0 / 2026.8.3 / 2025.1.4 · Autor: Moritz (GitHub theMoe), Umsetzung mit Claude.

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
8. **Ein Tier pro Seite** (`window.__pixelOverlayOwner`), Position wird nicht zwischen Clients gesynct (bewusst verschoben, siehe Backlog). Seit 0.1.2 gibt es zusätzlich `window.__pixelCards`: beim Abbau reicht die aussteigende Card das Tier sofort an eine andere lebende Card weiter, und `set hass` versucht `_mount()` bei jedem Update erneut. Ohne beides verlor die neue View den Wettlauf gegen die alte und das Tier blieb bis zum Neuladen weg.
9. **Texte der Card** liegen in `Texts` (de/en) in der JS-Datei; Sprache aus `hass.locale.language`.
10. **Wer füttert** kommt aus `call.context.user_id` → `feeds_by_user` (Familienstatistik).
11. **Theme ausschließlich als Klasse am Rig** (`theme-light`), alle Farbwerte als Custom Properties im `RIG_CSS`/`OVERLAY_CSS`. `resolveTheme(hass)` ist der einzige Erzeuger des Signals (`hass.themes.darkMode`, Fallback `prefers-color-scheme`), `PixelCard._applyTheme()` der einzige Verteiler an die **zwei** Rig-Instanzen (Overlay-Tier am body, Chip-Tier im Shadow Root). Kein `MutationObserver`, kein `matchMedia`-Listener: HA erzeugt beim Theme-Wechsel ein neues `hass`-Objekt. **Kein `theme:`-Konfigurationsschlüssel** – bewusst verworfen, um die Konfigurationsfläche klein zu halten. Preis: läuft ein dunkler Vollbild-Bildschirmschoner über einem hellen Theme, passt der Farbsatz nicht; praktisch entschärft, weil das Tier unter einer Verdeckung ohnehin pausiert.
12. **Kontur als SVG-Stroke, ausdrücklich kein CSS-Filter.** Die Sichtbarkeit des Eis im hellen Theme kommt aus einem zweiten Pfad mit `stroke-width:2` auf derselben Silhouette (`EGG_PATH`, einmal definiert, zweimal eingesetzt); die innere Hälfte verdeckt der Füllpfad, es bleibt eine pixelgenaue Kontur von einer Einheit. Eine Kontur über vier gestapelte `drop-shadow()` wurde verworfen: vier Offscreen-Filterdurchläufe **pro Repaint** bei einem Tier, das im 8-fps-Takt und pro rAF-Frame neu zeichnet, bricht auf einem Pi-4-Kiosk die Framerate – und ein 1-px-Filterschatten liegt nicht auf dem Pixelraster des Rigs (2,67 px je SVG-Einheit), `shape-rendering:crispEdges` gilt für Filter nicht.
13. **Selbstheilung statt Konfiguration.** `Brain.recover()` ist der einzige Ort, der die internen Felder des Gehirns zurücksetzt; `Watchdog` erkennt nur und repariert nichts selbst. Der Besitzerwechsel bleibt bei der Card, weil ihr der Lebenszyklus gehört. Kein Konfigurationsschlüssel dafür — die Konfigurationsfläche bleibt klein (siehe 11).
14. **Häufchen-Positionen bleiben clientseitig**, als Verhältnis zur Bounds-Box gespeichert. Konsequenz: auf zwei Geräten liegen sie an verschiedenen Stellen, und putzt Gerät A eines weg, verschwindet auf Gerät B irgendeines. Identische Positionen gäbe es nur mit Häufchen-Identität im `PetState`; das gehört zum Positions-Sync im Backlog und wäre hier überzogen.

15. **Card als ES-Module, weiter ohne Build-Schritt.** `add_extra_js_url` ohne `es5`-Flag legt die URL unter `DATA_EXTRA_MODULE_URL` ab, HA rendert also `<script type="module">`; relative Imports funktionieren damit nativ. `StaticPathConfig` registriert das **Verzeichnis**, neue Module werden ohne Zutun ausgeliefert. Cachebusting über ein **versioniertes Pfadsegment** (`/pixel-static/<version>/`) statt `?v=`: ein relativer Specifier erbt die Query nicht, sonst wären die Untermodule ungebustet geblieben. Die Version steht weiterhin nur in `const.py`.
16. **Idle-Verhalten als gewichtete Tabelle** (`idle.js`) statt einer if-Kaskade auf einer geteilten Zufallszahl. Jedes Gewicht ist ein echter Anteil, jede Zeile trägt `still`, und eine neue Aktion ist eine Datenzeile. Verweilen ist eine **Entscheidung** (`_dwellUntil`), keine verlängerte Schleifenpause — die Watchdog-Grenze `idle_max_seconds * 3000` verbietet Letzteres.
17. **Gebaute Objekte: waagerecht zentral, senkrecht lokal.** Das Backend speichert `rx` (0..1), jede Card sucht sich die Höhe aus ihrem eigenen Kartenlayout. Das Objekt steht damit überall an derselben relativen Stelle und überlebt jedes Neuladen, sitzt aber trotzdem auf einer sinnvollen Fläche. `BUILD_KINDS` in `builds.js` ist die einzige Wahrheit je Art — eine neue Art ist eine Zeile plus ein SVG.

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
| Engine | 42 Tests grün. Balancing plausibel, aber **nicht im Alltag erprobt** (Zahlen ggf. nach 1–2 Wochen nachjustieren). |
| Integration | 10 Tests grün gegen **HA 2026.9.0 und 2026.8.3 (Python 3.14)** sowie 2025.1.4 (Python 3.12); keine Deprecation-Hinweise zu `custom_components.pixel`. Ruff sauber unter 3.14. **Nicht auf einer Live-Instanz gestartet.** |
| Config-Flow | Programmatisch geprüft (Import, Schema). UI-Durchlauf nicht getestet. |
| Card | jsdom-Smoke-Test grün, `node --check` sauber, Demo-Seite vorhanden. **Im echten HA-Frontend noch nie gelaufen**, aber gegen ein reales Dashboard-YAML (Sections-View, fixe Navigations-Card, Wallpanel-Kiosk, durchweg Custom Cards) durchgesehen – die Befunde daraus sind in 0.1.2 eingearbeitet. **Die Farbwerte des hellen Themes sind rechnerisch gewählt und noch nicht im Browser beurteilt** → `docs/card-demo.html` öffnen, Umschalter „hell/dunkel“ × Stufe „egg“. Verbleibendes Restrisiko: Touch-Verhalten auf dem Pi-Kiosk, Erkennung ungewöhnlicher fixer Leisten, `position: fixed` des Overlays, falls Wallpanel `transform`/`filter` auf `body` setzt (das würde die Koordinaten verschieben). |
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
- Schlüpf-Animation: `.crack` blitzt bisher nur beim Wackeln des Eis auf. Ein Feld „kurz vor dem Schlüpfen“ im Snapshot wäre eine Backend-Änderung und fehlt bewusst.

**P3 – Qualität**
- Diagnostics-Plattform (`diagnostics.py`) für Support.
- Repairs-Issue, wenn Wetter-/Kalender-Entity fehlt.
- GitHub Actions: pytest, ruff, hassfest, HACS-Validation.
- Card in TypeScript/Lit mit Build – **entschieden gegen einen Build-Schritt** (Entscheidung 15). Die Aufteilung in ES-Module hat das Problem ohne Werkzeugkette gelöst; größte Datei ist jetzt `brain.js` mit 481 Zeilen.

## 8. Bekannte Stolpersteine

- `deepQueryAll` steigt in **jeden** Shadow Root ab – bei sehr großen Dashboards (>200 Karten) den Scan drosseln.
- `add_extra_js_url` wirkt erst nach Browser-Reload; die Card-Datei wird mit `?v=VERSION` gecacht → bei Änderungen **`VERSION` in `const.py` und `manifest.json` erhöhen**.
- `calendar.get_events` liefert `uid` nicht bei allen Kalender-Integrationen; Fallback-UID = entity+title+start.
- `zone.home` zählt nur `person.*` mit Tracker. Ohne Tracker → `persons_home` None → Einsamkeits-/Heimkehr-Logik inaktiv (gewollt).
- Tests: `pytest-homeassistant-custom-component` muss zur HA-Version passen (0.13.363 ↔ 2026.9.0, 0.13.357 ↔ 2026.8.3, 0.13.205 ↔ 2025.1.4; siehe `requirements_test.txt`). HA 2026.x braucht **Python ≥ 3.14.2** – am einfachsten `uv python install 3.14` + `uv venv`. `home-assistant-frontend` (Version aus dem `frontend`-Manifest) wird für die Abhängigkeit im Test benötigt.
- **Die Card fordert keine Mindestbreite ein.** `container-type: inline-size` an `:host` impliziert `contain: inline-size`; der Host trägt damit keine intrinsische Breite bei. In einer `horizontal-stack` mit Geschwistern, die feste Breiten setzen, schluckt die Pixel-Card deshalb das gesamte Defizit und kollabiert auf Breite 0 — live gemessen: `hui-card` als Elternelement mit Breite 0, während vier Geschwister mit zusammen 375 px die Zeile füllten. Seit 0.1.3 blendet eine vierte Container-Stufe unterhalb von 44 px die `ha-card` ganz aus, damit kein Stummel stehenbleibt. Wer den Chip sehen will, gibt der Card eine eigene Zeile; wer nur das Tier will, setzt `show_status: false`.
- **Verstecken ist der gefährlichste Zustand der Card.** `_hide()` clippt das Tier hinter die Kartenkante; einziger Weg heraus war lange nur `_peek()`. In 0.1.2 hat `_covered()` genau den blockiert, weil weggeclippte Fläche nicht hit-testbar ist und `elementFromPoint` die Karte dahinter lieferte — das Tier verschwand dauerhaft. Seit 0.1.3: `_covered()` ignoriert das eigene Versteck, der `hiding`-Zweig steht davor, das Versteck endet nach `HIDE_MAX_SECONDS`, und `HIDE_SINK` lässt den Kopf stehen. Wer am Versteck arbeitet, rechnet die Rig-Geometrie nach: viewBox `-4 -4 24 22` in 64 px sind 2,67 px je Einheit bei 2,67 px Versatz, die Kopfoberkante liegt bei 18,7 px.
- **Die Idle-Schleife muss jede Exception überleben.** `running` bleibt bei einem Wurf `true`, und `start()` steigt dann sofort wieder aus — ohne `try/catch` im Schleifenkörper wäre das Tier bis zum nächsten View-Wechsel tot.
- **Die Demo-Seite läuft nicht mehr über `file://`.** Seit der Aufteilung in ES-Module holt der Browser die Skripte per CORS, und `file://` hat den Origin `null` – jeder Browser blockiert das. Nötig ist ein HTTP-Server: `python3 -m http.server 8000` im Projektverzeichnis, dann `http://localhost:8000/docs/card-demo.html`. Die Seite zeigt bei `file://` von selbst einen Hinweis. In Home Assistant ist das kein Thema, dort läuft ohnehin alles über HTTP.
- **Der Smoke-Test lädt die Card als echtes Modul.** `window.eval` wertet nach dem Script-Goal aus und bricht an der ersten `import`-Zeile. Stattdessen liegen die jsdom-Globals auf `globalThis`, dann `await import(...)`. Zwei Fallen: `performance` darf **nicht** übernommen werden (jsdoms `Performance.now()` ruft das globale `performance` auf und läuft in eine Endlosrekursion, sobald es selbst das globale ist), und Stubs gehören auf `globalThis`, nicht auf `window` — der Modulcode läuft im Node-Realm und bindet `getComputedStyle` beim Import.
- **Keine `datetime` in Listenfeldern des `PetState`.** `to_dict` wandelt nur Felder der obersten Ebene nach ISO; ein Zeitstempel innerhalb von `builds` bräche den Roundtrip. Deshalb ist `Build.created` ein ISO-String.
- **Neue `Activity`-Werte nicht ans Ende hängen.** Der Fallback für unbekannte gespeicherte Werte ist `list(enum_cls)[-1]`. Und die `options`-Liste am `activity`-Sensor muss mitziehen, sonst loggt HA einen ungültigen Enum-Zustand.
- jsdom-Test stubbt `getBoundingClientRect`; Layout-Fragen (Überlappung, Clip-Optik) und **Farbkontraste** sind damit **nicht** abgedeckt → `docs/card-demo.html` im Browser öffnen (hat seit 0.1.2 einen Hell/Dunkel-Umschalter und eine fixe Leiste am unteren Rand, seit 0.1.4 eine Auswahl zum Bauen).
- jsdom kennt weder `document.elementFromPoint` noch `Element.animate`. Beide Stellen (`_bottomBarTop`, `_covered`, `_shake`) haben darum einen Feature-Guard; wer ihn entfernt, bricht den Smoke-Test.
- Zwei Rig-Instanzen: Overlay-Tier **und** Chip-Tier. Wer am Rig etwas ergänzt, das von außen gesetzt wird (wie `setTheme`), muss beide bedienen – Sammelpunkt ist `PixelCard._applyTheme()`.
- `Rig.apply()` schreibt `className` neu und entfernt per Regex nur `stage-*`. Weitere Zustandsklassen (`theme-light`, `flip`, `fainted`) überleben das nur, solange das so bleibt.
- **Keine persönlichen Daten ins öffentliche Repo.** Beispiele in README, PROJEKTSTAND, Demo-Seiten und Tests bleiben generisch (keine echten Entity-IDs, Namen, Orte, Kalendertitel, MAC-Adressen). Vor dem Commit prüfen:
  `grep -rniE "<eigener ort>|<eigene namen>" . --exclude-dir=node_modules --exclude-dir=.git` muss leer sein.
