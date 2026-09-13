# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Orientierung

Home-Assistant-Custom-Integration `pixel` (Spiellogik, Entities, Services) plus eine Lovelace-Card, die die Integration selbst ausliefert. Vor größeren Änderungen `PROJEKTSTAND.md` lesen: Architekturkarte, bewusst getroffene Entscheidungen, Stolpersteine, Backlog. `README.md` ist die Nutzersicht (Entities, Services, Spielregeln), `docs/KONZEPT.md` die Idee.

Doku, Kommentare und Docstrings sind **deutsch**, Code-Identifier englisch.

## Kommandos

```bash
# Setup (HA 2026.x braucht Python >= 3.14.2)
uv venv .venv --python 3.14
uv pip install --python .venv/bin/python homeassistant==2026.9.0 -r requirements_test.txt

# Tests
.venv/bin/python -m pytest                      # alles (34 Engine + 10 Integration)
.venv/bin/python -m pytest tests/engine         # nur Engine, braucht kein homeassistant
.venv/bin/python -m pytest tests/engine/test_rules.py::test_long_outage_is_capped
.venv/bin/python -m pytest -k outfit

# Lint/Format (muss sauber sein)
.venv/bin/python -m ruff check . && .venv/bin/python -m ruff format .

# Card
node --check custom_components/pixel/frontend/pixel-card.js
cd tests/frontend && npm install && node card.smoke.test.mjs
```

Vor Abgabe alle vier durchlaufen lassen: pytest, ruff, `node --check`, Card-Smoke-Test.

`tests/engine/conftest.py` hängt `custom_components/pixel` in `sys.path` — deshalb laufen die Engine-Tests ohne installiertes Home Assistant.

## Architektur

Zwei Schichten: die Python-Integration unter `custom_components/pixel/` und die Vanilla-Web-Component `custom_components/pixel/frontend/pixel-card.js` (~1200 Zeilen, kein Build, keine Abhängigkeiten).

**Harte Schichtgrenze:** `engine/` ist reine Domänenlogik und importiert **kein** `homeassistant`. Ein HA-Import dort bricht `tests/engine/` sofort.

**Datenfluss pro Tick (60 s):**

```
PixelCoordinator._async_update_data
  → WorldAdapter.build()        HA-States → WorldContext
  → PetEngine.tick(world)       Regeln aus rules.py mutieren PetState, sammeln GameEvents
  → evaluators.py               Mood / Outfit / Activity ableiten
  → GameEvents auf den HA-Bus als `pixel_event`
  → snapshot(world)             flaches Dict → coordinator.data
  → Entities lesen nur daraus (nie Engine-Objekte)
```

**Ein Subscription-Punkt für die Card:** `sensor.<name>_status` trägt die Stimmung als State und kippt per `attributes_fn=lambda s: dict(s)` (`sensor.py`) den *gesamten* Snapshot in die Attribute. Die Card liest nur diesen Sensor plus `pixel_event` und handelt über `hass.callService("pixel", …, {config_entry_id})`.

Modulrollen:

| Datei | Rolle |
|---|---|
| `engine/engine.py` | einzige Fassade: `tick()` / `act()` / `snapshot()`. `act` löst Aktionsnamen per `getattr` auf, damit die Service-Schicht generisch bleibt |
| `engine/config.py` | `GameConfig` — **alle** Balancing-Zahlen, sonst nirgends |
| `engine/rules.py` | 13 Regelklassen; die Reihenfolge in `default_rules()` ist semantisch |
| `engine/models.py` | `PetState` (persistiert), `WorldContext` (Eingabe), `GameEvent`, Enums |
| `settings.py` | ConfigEntry → `PixelSettings` (+ abgeleitete `GameConfig`); Options schlagen Data |
| `world.py` | einziges Modul, das die HA-Weltdarstellung kennt (Wetter-Map, `calendar.get_events` mit 5-min-Cache, `zone.home`, media_player) |
| `store.py` | `.storage/pixel.<entry_id>`, debounced |
| `services.py` | `ServiceSpec`-Tabelle → generische Registrierung; ermittelt den fütternden Nutzer |
| `frontend.py` | static path + `add_extra_js_url` → Card ohne Lovelace-Ressource |
| `sensor.py` … `button.py` | Deskriptor-Tabellen; Logik nur in den Lambdas der Description (`value_fn`, `is_on_fn`) |

## Konventionen beim Erweitern

- **Neue Mechanik** = neue Regelklasse in `rules.py` + Eintrag an der richtigen Stelle in `default_rules()`.
- **Balancing nur** in `engine/config.py` ändern; Nutzeroptionen darüber in `settings.py` mappen.
- **Neue Entity** = vier Dateien: Plattformmodul, `strings.json`, `translations/en.json`, `translations/de.json` (Schlüsselmengen identisch halten). `description.key` ist zugleich `translation_key` und Suffix von `unique_id = f"{entry_id}_{key}"`; Entity-IDs folgen den **englischen** Namen.
- **Neuer Service** = Zeile in `_table()` (`services.py`) + Block in `services.yaml` + Übersetzungen.
- **Neues Event** = emitten in `rules.py`/`actions.py` → in `pixel-card.js` unter `Brain.onEvent` behandeln → Events-Liste in `README.md` ergänzen.
- **Neues Outfit-Teil** = `OutfitResolver` + SVG-Layer `hat-*`/`acc-*`/`item-*` im `RIG_SVG` + Fall in `tests/engine/test_actions.py::test_weather_outfits`.
- Ruff: line-length 120, Regelsatz `E F I UP B SIM RUF ANN`, `target-version = py312`. **Kein Gedankenstrich in `.py`** (RUF002).
- Regeln, Aktionen und Entities sind kleine Klassen oder Tabellenzeilen; in den Description-Lambdas steht nur ein Feldzugriff, keine verzweigte Logik.

## Fallen

- **Card-Cache:** Die Card wird als `?v={VERSION}` ausgeliefert (`frontend.py`). Nach jeder Änderung an `pixel-card.js` muss `VERSION` in `const.py` erhöht werden, sonst sieht kein Browser die Änderung. Die Version steht an drei Stellen (`const.py`, `manifest.json`, `pyproject.toml`); die cache-relevante ist `const.VERSION`.
- **`"requirements": []` im Manifest ist Absicht** — die Integration ist reines stdlib. Keine Laufzeitabhängigkeit hinzufügen.
- **Services sind domänenweit, nicht entity-getargetet.** Ohne `config_entry_id` trifft ein Aufruf stillschweigend `entries[0]`.
- **Optionen werden heiß übernommen:** `apply_settings` baut eine neue `PetEngine` um den bestehenden `PetState` (`coordinator.py`). Das Tier überlebt, aber tick-übergreifende In-Memory-Flags einzelner Regeln (`HungerEventRule._was_hungry`, `FeedingReminderRule._reminded_window`) werden dabei zurückgesetzt.
- **Persistenz:** Nur `PetState` wird gespeichert, nur über `PetStore`. Wer State außerhalb einer Regel oder Aktion ändert, muss selbst speichern lassen (Vorbild: `set_animations_enabled`). Neue Feldtypen mit `_DATETIME_FIELDS` / `_ENUM_FIELDS` in `models.py` synchron halten; es gibt keine Store-Migration, `from_dict` ist bewusst tolerant.
- **`MAX_TICK_HOURS = 12`** (`engine/engine.py`) kappt das Nachrechnen nach Ausfällen. Tests mit großen Zeitsprüngen laufen dagegen.
- **Test-Matrix:** `pytest-homeassistant-custom-component` muss exakt zur HA-Version passen; die geprüften Kombinationen stehen als Kommentar in `requirements_test.txt`. `home-assistant-frontend` wird zusätzlich gebraucht.
- **Overlay-Technik** (bewusste Entscheidung, siehe `PROJEKTSTAND.md` Abschnitt 3): Das Tier hängt am `document.body` mit `position: fixed`; "Verstecken hinter Karten" ist `clip-path: inset(...)`, kein echtes DOM-Einfügen. Karten-Scan per `deepQueryAll` durch alle Shadow Roots. Ein Tier pro Seite (`window.__pixelOverlayOwner`).
- **jsdom-Test stubbt `getBoundingClientRect`** — Layout- und Clip-Fragen sind damit nicht abgedeckt. Dafür `docs/card-demo.html` im Browser öffnen.
- **Verifikationsstand:** Die Card lief noch nie in einem echten HA-Frontend, die Integration nie auf einer Live-Instanz. Details in `PROJEKTSTAND.md` Abschnitt 5.
