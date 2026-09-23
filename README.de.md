**Deutsch** | [English](README.md)

# Pixel – ein Tamagotchi, das auf deinem Home-Assistant-Dashboard lebt

Pixel läuft über dein Dashboard, klettert auf Karten, versteckt sich hinter dem Kalender, trägt bei Sonne eine Sonnenbrille und bei Regen einen Schirm, wird bei vielen Terminen hektisch und möchte ein paar Mal am Tag gefüttert werden. Das Haus ist seine Welt: Wetter, Kalender, Anwesenheit und Musik beeinflussen Stimmung, Outfit und Verhalten.

Das Repository enthält **eine Integration** (Spiellogik, Entities, Services) **und eine Dashboard-Card** (Animation, Bewegung, Interaktion). Die Card wird von der Integration automatisch ausgeliefert – du musst keine Lovelace-Ressource anlegen.

---

## Inhalt

1. [Voraussetzungen](#1-voraussetzungen)
2. [Installation über HACS](#2-installation-über-hacs)
3. [Manuelle Installation](#3-manuelle-installation-alternative)
4. [Integration einrichten](#4-integration-einrichten)
5. [Card ins Dashboard legen](#5-card-ins-dashboard-legen)
6. [Bedienung](#6-bedienung)
7. [Entities](#7-entities)
8. [Services](#8-services)
9. [Automationsbeispiele](#9-automationsbeispiele)
10. [Card-Optionen](#10-card-optionen)
11. [Spielregeln](#11-spielregeln)
12. [Fehlersuche](#12-fehlersuche)
13. [Entwicklung](#13-entwicklung)

---

## 1. Voraussetzungen

- Home Assistant **2024.8 oder neuer** (getestet mit 2025.1, 2026.8 und 2026.9)
- Für die Einrichtung per Klick: [HACS](https://hacs.xyz) installiert
- Optional, aber empfohlen: eine `weather.*`-Entity, ein oder mehrere `calendar.*`-Entities, `zone.home` (ist standardmäßig vorhanden)

## 2. Installation über HACS

1. HACS öffnen → oben rechts **⋮** → **Benutzerdefinierte Repositories**.
2. URL eintragen: `https://github.com/theMoe/ha-pixel-tamagotchi`, Typ **Integration**, **Hinzufügen**.
3. In HACS nach **Pixel** suchen → **Herunterladen**.
4. **Home Assistant neu starten** (Einstellungen → System → Neu starten).

## 3. Manuelle Installation (Alternative)

1. Den Ordner `custom_components/pixel` aus diesem Repository in dein HA-Konfigurationsverzeichnis kopieren, sodass `config/custom_components/pixel/manifest.json` existiert.
2. Home Assistant neu starten.

## 4. Integration einrichten

1. **Einstellungen → Geräte & Dienste → Integration hinzufügen**, nach **Pixel** suchen.
2. **Schritt 1 – Name:** Wie soll dein Tier heißen? (Standard: Pixel). Der Name bestimmt die Entity-IDs, z. B. `sensor.pixel_status`.
3. **Schritt 2 – Wahrnehmung:** alles optional
   - **Wetter:** deine `weather.*`-Entity → Sonnenbrille, Schirm, Mütze, Eis …
   - **Kalender:** ein oder mehrere Kalender → Terminstress und Erinnerung 15 Minuten vor Terminen
   - **Media-Player:** Sonos & Co. → Pixel tanzt, wenn Musik läuft
   - **Anwesenheit:** Standard `zone.home` (zählt Personen zuhause). Alternativ ein `binary_sensor`/`input_boolean` „jemand zuhause“ → Einsamkeit, Freude beim Heimkommen, Urlaubsschutz
4. **Schritt 3 – Spielregeln:**
   - **Fütterungsfenster:** `07:00-09:00, 12:00-14:00, 18:00-20:00` (frei anpassbar)
   - **Schlafenszeit / Aufstehzeit:** nachts schläft Pixel, Bedürfnisse sinken kaum
   - **Tempo:** 1 = normal, 0,5 = gemütlich (gut für Anfang und Urlaub), 2 = fordernd
   - **Hardcore:** aus = Pixel wird bei Vernachlässigung nur ohnmächtig; an = Pixel kann sterben und ein neues Ei schlüpft
5. **Fertig.** Alle Einstellungen lassen sich später über **Konfigurieren** an der Integration ändern – ohne Neustart.

Pixel startet als **Ei** und schlüpft nach etwa einem Tag. Danach wächst es bei guter Pflege über Baby, Kind und Teenager zum Erwachsenen (siehe [Spielregeln](#11-spielregeln)).

## 5. Card ins Dashboard legen

Die Card muss **einmal** in der View liegen, auf der Pixel leben soll. Sie zeigt einen kleinen Status-Chip (Name, Stimmung, drei Balken) und erzeugt das Tier als Ebene über der gesamten View.

1. Dashboard öffnen → **✏️ Bearbeiten** → **Karte hinzufügen**.
2. Nach **Pixel** suchen (unter „Benutzerdefiniert“) – oder ganz unten **Manuell** wählen und eintragen:

   ```yaml
   type: custom:pixel-card
   entity: sensor.pixel_status
   ```

   `entity` kann weggelassen werden, wenn es nur ein Pixel gibt; die Card findet den Status-Sensor selbst.

3. Speichern. Falls die Card nicht gefunden wird: Browser einmal **hart neu laden** (Strg + F5 bzw. in der Companion-App Einstellungen → Cache leeren). Die Card wird beim ersten Start der Integration registriert und erscheint erst nach dem Neuladen.

**Empfehlung für Wandtablets/Kiosk:** Die Card in die Sections-View des Familien-Dashboards legen. Pixel bevorzugt Kalenderkarten zum Verstecken und meidet Bilder, Karten und Kameras.

**Mehrere Views:** Pixel lebt einmal pro Seite. Soll es beim Wechsel zwischen mehreren Views mitwandern, gehört auf jede View eine `pixel-card` – auf den Nebenviews am besten mit `show_status: false`. Die neu erscheinende Karte übernimmt das Tier dabei automatisch von der verschwindenden.

**Mehrere Geräte gleichzeitig:** Funktioniert ohne Zutun. Der Spielzustand liegt im Backend, deshalb zeigen Wandtablet, Handy und Desktop dasselbe Tier mit denselben Werten, und eine Fütterung am einen Gerät ist sofort überall sichtbar. Die Feinbewegung macht dagegen jede Card selbst: Position, Laufwege, gewählte Idle-Aktion, Sprechblasentexte und die Lage der Häufchen sind pro Gerät verschieden. `pixel.say` und `pixel.trick` erreichen alle Geräte gleichzeitig, wobei `trick: random` je Gerät anders ausfallen kann.

**Feste Navigations- oder Fußleisten:** Liegt am unteren Bildschirmrand eine fixierte Leiste (etwa eine Navigations-Card im Kiosk-Betrieb), erkennt Pixel sie und setzt seine Bodenlinie darüber, statt über den Schaltflächen zu laufen. Greift das bei einer ungewöhnlichen Leiste nicht, hilft ein größeres `floor_margin` (siehe [Abschnitt 10](#10-card-optionen)).

Karten lassen sich gezielt beeinflussen (Attribut am Karten-Element, z. B. über `card-mod` oder eigene Custom Cards):

- `data-pixel="favorite"` – Lieblingsversteck
- `data-pixel="noclimb"` – wird nicht betreten

## 6. Bedienung

| Aktion | Wirkung |
|---|---|
| **Tippen** auf ein gebautes Objekt | Reißt es ab. |
| **Tippen** auf ein Häufchen | Räumt genau dieses weg. Der Besen im Menü ebenfalls eines pro Tipp. |
| **Tippen** auf Pixel | Menü: Füttern 🍎, Snack 🍪, Leckerli 🍬, Spielen ⚽, Streicheln ✋ – plus Putzen 🧹 / Medizin 💊, wenn nötig |
| **Lange drücken** | Statistik: Werte, Alter, Stufe, Fütterungen (wer hat am meisten gefüttert) |
| **Tippen** auf die Karte, hinter der Pixel steckt | Pixel springt mit „BUH!“ heraus |
| **Tippen** auf ein Häufchen 💩 | Putzen |
| Finger/Maus bewegen | Pixels Augen folgen |

Wer füttert, wird pro HA-Benutzer gezählt (Statistik im Long-Press-Popup). Dafür muss jedes Familienmitglied mit dem eigenen HA-Account angemeldet sein.

## 7. Entities

Alle Entities hängen am Gerät **Pixel**. Bei anderem Namen ändert sich das Präfix.

| Entity | Bedeutung |
|---|---|
| `sensor.pixel_status` | Stimmung als Zustand; **alle Werte als Attribute** (für Card und Templates) |
| `sensor.pixel_hunger` | 0–100, **100 = satt** |
| `sensor.pixel_happiness`, `sensor.pixel_energy`, `sensor.pixel_health` | Laune, Energie, Gesundheit |
| `sensor.pixel_stage` | egg / baby / child / teen / adult / senior |
| `sensor.pixel_activity` | idle / sleeping / eating / playing / sick / fainted |
| `sensor.pixel_outfit` | Aktuelle Kleidung (Attribute: hat, accessory, item) |
| `sensor.pixel_stress_level` | 0 entspannt, 1 beschäftigt (ab 3 Terminen), 2 gestresst (ab 6) |
| `sensor.pixel_age`, `sensor.pixel_care_score` | Alter in Tagen, gleitender Pflegewert |
| `binary_sensor.pixel_needs_attention` | Hunger, Häufchen, krank, ohnmächtig oder Fütterungszeit |
| `binary_sensor.pixel_sick`, `_poop`, `_sleeping`, `_fainted`, `_feeding_time` | Einzelzustände. `_sleeping` trägt die Attribute `reason` (`night` / `tired` / `manual`), `night_hours` und `energy` |
| `select.pixel_mood` | Stimmung anzeigen/überschreiben; `auto` = Engine entscheidet |
| `switch.pixel_animations` | Animationen auf der Card an/aus (Kiosk-Stromsparen) |
| `switch.pixel_vacation` | Urlaub an/aus: alle Werte eingefroren, keine Erinnerungen, Sonnenhut und Cocktail |
| `button.pixel_feed`, `_snack`, `_treat`, `_play`, `_pet`, `_clean`, `_medicine` | Aktionen ohne Card |

## 8. Services

Alle Services akzeptieren optional `config_entry_id`, falls mehrere Tiere existieren.

| Service | Felder | Wirkung |
|---|---|---|
| `pixel.feed` | `meal`: snack / meal / treat | Füttern (+15 / +35 / +10 Sättigung; Leckerli +15 Laune, max. 3 pro Tag) |
| `pixel.play` | – | +25 Laune, −8 Energie (unter 20 Energie: zu müde). Steht etwas Gebautes, spielt Pixel damit, bei mehreren Objekten reihum |
| `pixel.pet` | – | +5 Laune |
| `pixel.clean` | `count` (optional) | Häufchen entfernen; ohne `count` alle, sonst so viele |
| `pixel.remove_build` | `build_id` (optional) | Gebautes Objekt abreißen; ohne Angabe das zuletzt gebaute |
| `pixel.medicine` | – | Heilt bei Krankheit/Ohnmacht, sonst „bäh“ |
| `pixel.sleep` / `pixel.wake` | – | Manuell schlafen legen / wecken |
| `pixel.set_mood` | `mood`, `minutes` | Stimmung zeitweise erzwingen, `auto` hebt auf |
| `pixel.say` | `text`, `duration` | Sprechblase auf dem Dashboard |
| `pixel.trick` | `trick`: random / tumble / jump / kick / hide / wave | Trick auf dem Dashboard |
| `pixel.reset` | `name` | Neues Ei (Statistik bleibt) |
| `pixel.set_vacation` | `enabled`: true / false | Urlaub beginnen oder beenden (wie `switch.pixel_vacation`) |

**Events:** Die Integration feuert `pixel_event` mit `type` (z. B. `fed`, `hungry`, `poop`, `sick`, `fainted`, `evolved`, `welcome_home`, `appointment_soon`, `feeding_time`, `fell_asleep` mit `reason` (`night` / `tired` / `manual`), `woke_up`, `mood_changed`, `built`, `build_removed`, `played` mit `build_id`/`build_kind`, `vacation_started`, `vacation_ended`) plus Details. Darauf lassen sich Automationen bauen. Die Card empfängt dieselben Events über den WebSocket-Befehl `pixel/subscribe_events`; das funktioniert ab 0.2.3 auch für Nutzer ohne Admin-Recht (Kiosk, Wandtablet).

## 9. Automationsbeispiele

**Push-Nachricht, wenn Pixel etwas braucht (max. alle 2 Stunden):**

```yaml
alias: Pixel braucht Aufmerksamkeit
triggers:
  - trigger: state
    entity_id: binary_sensor.pixel_needs_attention
    to: "on"
    for: "00:10:00"
actions:
  - action: notify.mobile_app_dein_handy
    data:
      title: "Pixel"
      message: "{{ state_attr('sensor.pixel_status', 'mood') }} – schau mal aufs Dashboard."
mode: single
```

**Kiosk: Animationen nur, wenn jemand vor dem Display steht:**

```yaml
alias: Pixel Animationen nach Präsenz
triggers:
  - trigger: state
    entity_id: binary_sensor.flur_bewegung
actions:
  - action: "switch.turn_{{ 'on' if trigger.to_state.state == 'on' else 'off' }}"
    target:
      entity_id: switch.pixel_animations
```

**Urlaub automatisch, wenn die Familie verreist ist:**

```yaml
alias: Pixel Urlaubsmodus
triggers:
  - trigger: state
    entity_id: input_boolean.familie_verreist
actions:
  - action: pixel.set_vacation
    data:
      enabled: "{{ trigger.to_state.state == 'on' }}"
```

**Waschmaschine fertig → Pixel sagt es:**

```yaml
alias: Pixel meldet Waschmaschine
triggers:
  - trigger: state
    entity_id: sensor.waschmaschine_status
    to: "fertig"
actions:
  - action: pixel.say
    data:
      text: "Wäsche ist fertig!"
      duration: 8
  - action: pixel.trick
    data:
      trick: jump
```

**Kurzer Jingle auf Sonos, wenn jemand heimkommt (nicht nachts):**

```yaml
alias: Pixel Heimkehr-Jingle
triggers:
  - trigger: event
    event_type: pixel_event
    event_data:
      type: welcome_home
conditions:
  - condition: time
    after: "08:00:00"
    before: "21:00:00"
actions:
  - action: media_player.play_media
    target:
      entity_id: media_player.sonos_kueche
    data:
      media_content_id: media-source://media_source/local/pixel-hello.mp3
      media_content_type: music
```

## 10. Card-Optionen

```yaml
type: custom:pixel-card
entity: sensor.pixel_status   # optional, wird sonst automatisch gefunden
show_status: true             # Status-Chip in der Karte anzeigen
scale: 1                      # Größe des Tiers (0.75 – 1.5 sinnvoll)
avoid:                        # Kartentypen, die gemieden werden (Teilstrings des Kartentyps)
  - picture
  - map
  - camera
  - navbar
favorites:                    # bevorzugte Verstecke
  - calendar
  - planner
idle_min_seconds: 3           # Pause zwischen Aktionen
idle_max_seconds: 8
floor_margin: 12              # Abstand der Bodenlinie zum unteren Rand
```

Die Card respektiert `prefers-reduced-motion` (keine Purzelbäume) und pausiert, wenn der Tab nicht sichtbar ist oder wenn etwas anderes das Tier verdeckt – etwa ein Bildschirmschoner im Kiosk-Betrieb oder ein geöffneter Dialog.

**Helles und dunkles Theme:** Die Card liest die Helligkeit aus dem Theme von Home Assistant (Fallback: Systemeinstellung) und zieht bei jedem Wechsel automatisch nach. Im hellen Theme bekommt das Ei eine dunkle Pixel-Kontur und kräftigere Farben, der Senior einen dunkleren Ton; Aktionsmenü und Statistik übernehmen die Theme-Farben. Im dunklen Theme sieht alles unverändert aus.

**Custom Cards:** `avoid` und `favorites` vergleichen Teilstrings des Kartentyps. Der Typ ist der Elementname ohne `hui-`-Präfix und `-card`-Suffix – aus `hui-calendar-card` wird `calendar`, aus einer Custom Card `<name>-card` wird `<name>`. Wer wissen will, wie die eigenen Karten heißen, findet die Elementnamen in der Browser-Konsole (F12) über die Elementansicht. Einzelne Karten lassen sich zusätzlich mit `data-pixel="favorite"` bzw. `data-pixel="noclimb"` auszeichnen (siehe [Abschnitt 5](#5-card-ins-dashboard-legen)).

**Wenn die Zeile zu voll ist:** Die Card fordert keine Mindestbreite ein. Stehen in derselben `horizontal-stack` Karten mit fest gesetzter Breite, die die Zeile bereits ausfüllen, bleibt für Pixel nichts übrig und die Karte wird gar nicht mehr dargestellt. Dann entweder `show_status: false` setzen (das Tier auf dem Dashboard bleibt davon unberührt) oder der Card eine eigene Zeile geben.

**Status-Chip in engen Containern:** In `horizontal-stack` oder `custom:stack-in-card` bekommt jede Karte per `flex: 1 1 0` nur einen gleichen Anteil der Zeile. Der Chip rüstet dann stufenweise ab – erst fallen die drei Balken weg, dann Name und Stimmung, zuletzt bleibt nur das Tier. Wer den vollen Chip sehen will, gibt der Card eine eigene Zeile oder in der Sections-View eigene `grid_options`. Geht es ohnehin nur um das Tier auf dem Dashboard, ist `show_status: false` die sauberste Lösung – dann verschwindet die Karte vollständig aus dem Layout.

## 11. Spielregeln

- **Bedürfnisse** sinken pro Stunde: Sättigung −4, Laune −2, Energie −3 (× Tempo-Faktor). Im Schlaf regeneriert Energie, Sättigung sinkt nur ein Viertel so schnell.
- **Schlaf:** Nachts schläft Pixel (Schlafens- und Aufstehzeit aus den Einstellungen der Integration, Standard 22:00 bis 06:30, in der Zeitzone des Home-Assistant-Servers). Sinkt die Energie tagsüber unter 15, macht es ein Nickerchen, bis die Energie wieder 40 erreicht (etwa 2 Stunden); Füttern weckt es. `pixel.sleep` / `pixel.wake` greifen manuell ein; nachts schläft es nach dem Wecken beim nächsten Takt wieder ein. Warum es gerade schläft, steht in `binary_sensor.pixel_sleeping` unter `reason`.
- **Urlaubsschutz:** Ist das Haus länger als 4 Stunden leer, sinken alle Werte nur halb so schnell. Beim Heimkommen freut sich Pixel (+Laune).
- **Urlaub** (`switch.pixel_vacation` oder `pixel.set_vacation`): Für längere Abwesenheit oder wenn sich gerade niemand kümmern kann. Alle Werte bleiben stehen, es gibt keine Häufchen, keine Erinnerungen, kein Kranksein und kein Bauen; Pixel ist wach (auch nachts), trägt Sonnenhut und Cocktail und hat die Stimmung „Urlaub“. Füttern und Spielen gehen trotzdem. Beim Beenden geht es dort weiter, wo es aufgehört hat, es wird nichts nachgeholt. Ein Tier, das schon krank war, bleibt es bis zur Medizin. Automatisch schaltet den Urlaub nur eine eigene Automation (Beispiel in Abschnitt 9).
- **Fütterungsfenster:** Innerhalb der Fenster erinnert Pixel einmal (`feeding_time`-Event, Card-Sprechblase). Außerhalb darf trotzdem gefüttert werden.
- **Häufchen** kommt 2 Stunden nach einer Mahlzeit und kostet Gesundheit, bis es weggeputzt ist.
- **Gesundheit** sinkt bei Sättigung < 15 oder Häufchen; unter 30 ist Pixel **krank** (Medizin oder Erholung), bei 0 **ohnmächtig** (Medizin, dann füttern). Hardcore: stattdessen Tod und neues Ei.
- **Stufen** (bei durchschnittlicher Pflege): Ei 1 Tag → Baby → Kind ab Tag 4 → Teenager ab Tag 11 → Erwachsen ab Tag 25 → Senior ab Tag 90. Gute Pflege beschleunigt um bis zu 30 %, schlechte verzögert bis zu 50 %.
- **Stimmung** (Priorität): ohnmächtig › krank › schlafend › hungrig (< 30) › gestresst (≥ 6 Termine) › einsam (Haus > 4 h leer und Laune < 40) › aufgeregt (jemand kommt heim, spielt) › beschäftigt (≥ 3 Termine) › gelangweilt (> 6 h keine Interaktion) › fröhlich.
- **Outfit:** Sonne → Sonnenbrille (+Eis ab 26 °C, +Mütze unter 8 °C); Regen/Gewitter → Schirm; Schnee → Mütze und Schal; Wind → Schal; Nebel → Laterne; 3–5 Termine → Klemmbrett; ab 6 → Kaffee; Dezember → Nikolausmütze; Ende Oktober → Kürbis; März/April am Wochenende → Hasenohren.
- **Bauen:** Alle 8 Stunden baut Pixel etwas, wenn es wach, gesund, gut gelaunt (≥ 60) und ausgeruht (≥ 35) ist – Haus, Golfloch, Schaukel oder Blumenbeet, im Winter einen Schneemann. Höchstens vier Objekte gleichzeitig. Fehlt zur Fälligkeit die Laune oder Energie, versucht es Pixel alle 30 Minuten erneut; schläft es, baut es nach dem Aufwachen. Den nächsten Bauzeitpunkt zeigt `sensor.pixel_builds` im Attribut `next_at`. Ein Tipp auf ein Objekt reißt es ab (−3 Laune). Solange etwas steht, geht Pixel immer mal wieder hin und beschäftigt sich damit.
- **Spielen mit Bauten:** Steht etwas Gebautes, spielt Pixel bei „Spielen“ damit, bei mehreren Objekten reihum; abgerissene Objekte fallen aus der Runde. Beim Golfloch läuft Pixel irgendwo hin zum Abschlag und braucht ein bis drei Schläge, geht zwischendurch zum Ball und versenkt ihn zum Schluss.
- **Ausfälle:** Nach Neustarts oder Stromausfall werden höchstens 12 Stunden nachgerechnet – Pixel verhungert nicht, weil HA ein Wochenende aus war.

Alle Zahlen stehen in `custom_components/pixel/engine/config.py`.

## 12. Fehlersuche

| Problem | Lösung |
|---|---|
| „Benutzerdefiniertes Element existiert nicht: pixel-card“ | Integration läuft? Browser hart neu laden (Strg + F5). In der Companion-App: Einstellungen → Companion-App → Frontend-Cache zurücksetzen. Prüfen, ob `http://<ha>:8123/pixel-static/pixel-card.js` erreichbar ist. |
| Pixel erscheint nicht, Chip aber schon | Die Card muss in derselben View liegen. Browser-Konsole (F12) auf `[pixel-card]`-Meldungen prüfen. |
| Pixel steht oben am Header | Karten werden erst nach dem Laden gescannt; die Card scannt nach 0,8 s nach. Bei sehr langsamen Tablets `idle_min_seconds` erhöhen. |
| Mehrere Pixel gleichzeitig | Auf einer Seite läuft immer nur ein Tier – die erste Card gewinnt. Weitere Cards zeigen nur ihren Status-Chip. |
| Pixel ist im hellen Theme kaum zu sehen | Ab 0.1.2 passt sich die Card dem Theme an. Bleibt es blass: Browser hart neu laden, damit die neue Card-Version geladen wird. |
| Pixel verschwindet nach einem Wechsel der View | Ab 0.1.2 behoben. Vorher half nur Neuladen. Prüfen, ob die geladene Card-Version aktuell ist (`/pixel-static/pixel-card.js?v=…`). |
| Pixel schläft am Tag | `binary_sensor.pixel_sleeping` → Attribut `reason`. `tired`: die Energie war unter 15 (viel gespielt oder Tempo hoch); es wacht bei 40 wieder auf, Füttern weckt sofort. `night` außerhalb der eingestellten Zeiten (`night_hours`): Zeitzone in HA prüfen (Einstellungen → System → Allgemein), die Integration nutzt die Serverzeit. `manual`: eine Automation oder ein Klick hat `pixel.sleep` aufgerufen. Schlafens- und Aufstehzeit: Integration → Konfigurieren → Spielregeln. |
| Pixel baut nichts | Erstes Objekt frühestens 8 Stunden nach dem ersten Start, danach alle 8 Stunden. Prüfen: `switch.pixel_vacation` aus? In `sensor.pixel_status`: `sleeping`, `sick` und `fainted` false, `stage` nicht `egg`, `happiness` ≥ 60, `energy` ≥ 35? `sensor.pixel_builds` zeigt im Attribut `next_at` den nächsten Versuch (ab 0.2.1) und unter `items`, was schon steht. |
| Gebautes Objekt steht an einer komischen Stelle | Die waagerechte Lage kommt aus dem Backend und ist auf allen Geräten gleich; die Höhe sucht sich jede Card selbst. Auf ungewöhnlichen Layouts landet es notfalls auf der Bodenlinie. Antippen entfernt es. |
| Pixel ist verschwunden und kommt nicht wieder | Bis 0.1.2 blieb das Tier hinter einer Karte hängen. Ab 0.1.3 behoben; ein Wächter holt es zusätzlich alle 20 s zurück, falls es doch festhängt. Prüfen, ob die geladene Card-Version aktuell ist. |
| Auf einem Gerät fehlen Sprechblasen wie „lecker!“, und Spielen tut nichts | Bis 0.2.2 bekam die Card Events nur bei Admin-Nutzern; im HA-Log steht dann `Refusing to allow … to subscribe to event pixel_event`. Ab 0.2.3 behoben. Nach dem Update HA neu starten und das Gerät neu laden. |
| Pixel läuft über der Navigationsleiste | Sollte automatisch erkannt werden; sonst `floor_margin` auf die Höhe der Leiste setzen. |
| Kalender wird ignoriert | Die Integration nutzt `calendar.get_events`; die Kalender-Integration muss diese Aktion unterstützen (Google, CalDAV, lokale Kalender: ja). |
| Entity-IDs lauten anders | Die IDs folgen dem englischen Entity-Namen; bei anderem Tiernamen ändert sich das Präfix (`sensor.blob_status`). |
| Logging | `logger: logs: custom_components.pixel: debug` in `configuration.yaml`. |

## 13. Entwicklung

```bash
# Python 3.14 (HA 2026.x); die Versionskombinationen stehen in requirements_test.txt
uv venv .venv --python 3.14 && uv pip install --python .venv/bin/python homeassistant==2026.9.0 -r requirements_test.txt
.venv/bin/python -m pytest            # 52 Engine-Tests + 12 Integrationstests
.venv/bin/python -m ruff check . && .venv/bin/python -m ruff format .
cd tests/frontend && npm install && node card.smoke.test.mjs   # Card-Smoke-Test in jsdom
```

Die Suite läuft grün gegen HA 2026.9.0 und 2026.8.3 (Python 3.14) sowie 2025.1.4 (Python 3.12).

`docs/card-demo.html` lädt die echte Card mit einem Mock-hass im Browser – zum Ausprobieren ohne Home Assistant. Die Seite braucht einen HTTP-Server, weil die Card aus ES-Modulen besteht: `python3 -m http.server 8000` im Projektverzeichnis, dann `http://localhost:8000/docs/card-demo.html`. `docs/prototyp.html` ist der ursprüngliche Prototyp, `docs/KONZEPT.md` das Konzept. `PROJEKTSTAND.md` ist das Briefing für die Weiterentwicklung.

Lizenz: MIT.
