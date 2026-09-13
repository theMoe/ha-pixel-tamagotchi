# Konzept: Dashboard-Tamagotchi für Home Assistant

Arbeitstitel: **Pixel** (Platzhalter)

Ein digitales Haustier, das auf dem Familien-Dashboard lebt, sich frei über die Oberfläche bewegt, auf den Zustand des Hauses reagiert und ein paar Mal am Tag Aufmerksamkeit möchte. Kein Steuerelement, sondern ein Bewohner.

---

## 1. Leitidee

- **Das Haus ist die Welt des Tiers.** Wetter, Kalender, Anwesenheit, Fenster, Musik, Licht – alles, was HA weiß, kann Stimmung, Kleidung und Verhalten beeinflussen.
- **Es lebt auf dem ganzen Dashboard**, nicht in einer Karte. Es läuft zwischen Karten herum, klettert auf Kacheln, versteckt sich dahinter.
- **Es braucht Zuwendung, aber wenig.** Ein paar Fütterungen am Tag, gelegentlich Spielen. Es darf nicht nerven und nicht sterben, während die Familie im Urlaub ist.
- **Es ist ein Charakter**, kein Statusindikator. Es macht Unsinn, ist manchmal beleidigt, freut sich sichtbar.

---

## 2. Architektur

### 2.1 Zwei Schichten

| Schicht | Technik | Aufgabe |
|---|---|---|
| **Backend** | Custom Integration (Python, HACS) | Spiellogik, Zustand, Bedürfnisse, Events → Stimmung, Persistenz, Services |
| **Frontend** | Custom Card (JavaScript/Lit) als Overlay | Rendering, Animation, Bewegung über das Dashboard, Verstecken, Interaktion per Tap |

Trennung wie bei MACS: Logik im Backend, Animation im Browser. Das Tier bleibt zwischen State-Updates lebendig, weil die Bewegung clientseitig läuft.

### 2.2 Backend – Zustand

Kern-Entities (alle restore-fähig, überleben Neustarts):

```
sensor.pixel_hunger         0–100   sinkt ~4/h, Fütterung +35
sensor.pixel_happiness      0–100   sinkt ~2/h, Spielen +25, Streicheln +5
sensor.pixel_energy         0–100   sinkt tags, regeneriert im Schlaf
sensor.pixel_health         0–100   sinkt bei Hunger < 15 oder Dreck
sensor.pixel_age_days       ganze Tage seit Schlüpfen
select.pixel_stage          egg | baby | child | teen | adult | senior
select.pixel_mood           berechnet, siehe 3.
select.pixel_activity       idle | walking | sleeping | eating | playing | hiding | trick
binary_sensor.pixel_needs_attention
binary_sensor.pixel_sick
binary_sensor.pixel_poop    ja, das gehört dazu
sensor.pixel_outfit         JSON: {hat, accessory, item}   → z. B. Sonnenbrille, Schirm
sensor.pixel_position       JSON: {card_id, anchor, hidden}  optional, für Multi-Client-Sync
```

Services:

```
pixel.feed          (meal: snack | meal | treat)
pixel.play
pixel.pet
pixel.clean
pixel.medicine
pixel.sleep / pixel.wake
pixel.set_mood      (manuell überschreiben, für Tests/Automationen)
pixel.set_outfit    (hat, accessory, item)
pixel.say           (text, duration)   → Sprechblase
pixel.trick         (name | random)
pixel.go_to         (card_id)          → geh zu Karte X
pixel.hide          (card_id | random)
```

Ein Coordinator tickt jede Minute: Werte anpassen, Ereignisse würfeln, Stufe/Krankheit/Stimmung neu berechnen, Events feuern (`pixel_event`), damit auch normale HA-Automationen darauf reagieren können (Sonos-Sound, Push-Nachricht).

### 2.3 Frontend – Overlay-Card

Die Card wird **einmal** ins Dashboard gelegt (z. B. in eine 1×1-Kachel oder per `card-mod` unsichtbar) und rendert das Tier als `position: fixed`-Layer über der gesamten View.

**Bewegung und Verstecken:**

- Beim Laden scannt die Card das DOM nach allen sichtbaren Karten (`hui-card`, `ha-card`) und liest deren Bounding-Boxes. Ergebnis: eine Karte der „Möbel“ im Raum.
- Laufziele sind Kartenränder, Oberkanten („draufsetzen“) und Lücken zwischen Karten.
- **Verstecken** = Tier läuft an eine Karte, spielt Hide-Animation, wird dann hinter der Karte gerendert (z-index unter der Karte, nur Ohren/Fühler ragen oben raus). Bei Tap auf die Karte oder nach Timeout kommt es wieder hervor.
- Karten mit `data-pixel="noclimb"` oder eine Blacklist (z. B. Kamera-Streams) werden gemieden; Karten mit `data-pixel="favorite"` (Kalender!) werden bevorzugt.
- Resize/Scroll → Möbelkarte neu berechnen, Tier läuft ggf. auf eine neue Position.

**Rendering:** SVG-Rig mit austauschbaren Layern (Körper, Augen, Mund, Hut, Accessoire, Item). Alternativ Pixel-Sprite-Sheet für den Retro-Look. SVG-Layer sind flexibler für Outfits, Sprites sind charmanter – Entscheidung offen, siehe 8.

**Interaktion:** Tap auf das Tier öffnet ein kleines Radial-Menü (Füttern, Spielen, Streicheln, Putzen). Doppeltipp = Streicheln. Lange drücken = Status-Popup (Stats als Balken, Alter, Stufe).

**Kiosk-Tauglichkeit:** Läuft auf dem Raspberry Pi 4 im Browser; Animationen per CSS-Transforms (GPU), max. ~30 fps, Idle-Animation drosseln, wenn niemand vor dem Display steht (Präsenz-/Bewegungssensor → `switch.pixel_animations_enabled`).

---

## 3. Stimmung und Verhalten

### 3.1 Moods (berechnet, Prioritätsreihenfolge)

1. **sick** – Gesundheit < 30
2. **sleeping** – Nachtzeit oder Energie < 15
3. **hungry** – Hunger < 30 (grummelt, schaut zum Kühlschrank-Icon)
4. **stressed** – viele Termine (siehe 4.2)
5. **lonely** – Haus seit > 4 h leer *und* Happiness < 40
6. **excited** – Familienmitglied kommt gerade heim, Wochenende steht an, Geburtstag
7. **happy** – Standard bei guten Werten
8. **bored** – alle Werte ok, aber lange keine Interaktion → macht von selbst Unsinn

### 3.2 Aktivitäten im Idle

Zufällig gewichtet, abhängig von Mood und Energie:

- Herumlaufen zwischen Karten
- Auf einer Karte sitzen und Beine baumeln lassen
- Hinter Karte verstecken (bevorzugt Kalender, Sensor-Kacheln)
- Nickerchen auf einer warmen Karte (Thermostat/Heizung – kleiner Gag)
- Auf einen Sensorwert zeigen und die Augenbrauen heben, wenn er ungewöhnlich ist
- Tricks (siehe 5)

---

## 4. Event-Anbindung an Home Assistant

### 4.1 Wetter → Outfit und Verhalten

| Wetter (`weather.*`) | Outfit | Verhalten |
|---|---|---|
| sunny, > 22 °C | Sonnenbrille, ggf. Eis in der Hand | träge, sucht Schatten hinter Karten |
| sunny, kalt | Sonnenbrille + Schal | – |
| rainy / pouring | Regenschirm, Gummistiefel | steht unter dem Schirm, Pfützen-Hüpfer als Trick |
| snowy | Mütze, roter Nasen-Look | baut Schneemann (Trick), hinterlässt Fußspuren |
| windy | Haare/Ohren wehen, Schirm klappt um | wird auf dem Dashboard „verweht“ (rutscht seitlich) |
| lightning | erschrickt, versteckt sich sofort | – |
| foggy | Laterne | – |
| clear-night | Schlafmütze | schläft |

UV-Index oder Außentemperatur können zusätzlich triggern („zu heiß, brauche Wasser“).

### 4.2 Kalender → Stresslevel

- Zählt Termine der nächsten 24 h aus den Familienkalendern (`calendar.*`).
- 0–2 Termine: entspannt · 3–5: „busy“ (Klemmbrett, hastiges Laufen) · 6+: gestresst (Schweißtropfen, zerzaust, Kaffeetasse)
- **15 min vor einem Termin** läuft es zum Kalendereintrag, klopft dagegen und zeigt eine Sprechblase mit dem Titel. Dezente Erinnerung ohne Push.
- Termin mit Stichwort „Urlaub“/„frei“: Sonnenhut, Cocktail, extrem entspannt.
- Geburtstag eines Familienmitglieds: Partyhut, Konfetti, singt (Sonos optional).

### 4.3 Anwesenheit (Apple Home → HA)

- Erste Person kommt heim → rennt zur Tür-Seite des Dashboards, hüpft, Sprechblase mit Namen.
- Letzte Person geht → winkt, wird nach einiger Zeit einsam, dann schläft es (Bedürfnisse sinken im Leer-Haus-Modus langsamer – **Urlaubsschutz**).
- Haus lange leer + Rückkehr → besonders große Freude, Happiness-Bonus.

### 4.4 Sensoren und Geräte

- **Fenster lange offen bei Kälte** → Schal, zittert, zeigt auf die Fenster-Kachel.
- **Luftreiniger läuft / Luftqualität schlecht** → Maske oder hält sich die Nase zu.
- **Sonos spielt** → tanzt im Takt (Media-Player-State), Kopfhörer als Accessoire; bei Pause hört es auf.
- **Licht nachts noch an** → gähnt, hält ein Kissen, zeigt zur Licht-Kachel.
- **Waschmaschine/Spülmaschine fertig** (falls gemessen) → läuft zur Kachel, klopft, Sprechblase.
- **Batterie eines Sensors niedrig** → trägt eine leere Batterie herum, deutet auf die Kachel. Nützlich getarnt als Gag.
- **Müllabfuhr morgen** (Abfallkalender) → trägt eine Mülltüte.
- **Energie/PV** (falls vorhanden) → bei viel Sonnenstrom lädt es sich auf, Blitz-Symbol; bei hohem Verbrauch schwitzt es.
- **Bewegungsmelder am Display** → schaut den Betrachter an, winkt.

### 4.5 Zeit

- Morgens: streckt sich, Kaffeetasse, wünscht guten Morgen (Sprechblase).
- Mittags: fragt nach Essen.
- Abends: Pyjama, wird müder.
- Nacht (konfigurierbar): schläft in einer Ecke, Zzz-Animation, keine Bedürfnisse sinken.
- Wochenende: Freizeit-Outfit, mehr Tricks.
- Jahreszeiten/Feiertage: Nikolausmütze im Dezember, Hasenohren zu Ostern, Kürbis im Oktober.

---

## 5. Tricks und Unsinn

Zufällig ausgelöst bei „bored“ oder „happy“, seltener bei anderen Moods:

- **Klettern** auf eine hohe Karte und Winken
- **Sensorwerte „stehlen“**: Zieht scheinbar eine Ziffer aus einer Kachel, trägt sie weg, bringt sie zurück (rein optisch, überlagert)
- **Schaukeln** am Rand einer Karte
- **Purzelbaum** durch die ganze Zeile
- **Hinter Karte verstecken und nur Augen zeigen**, die dem Blick folgen
- **Ballspiel**: kickt einen Ball gegen eine Kachel, die kurz wackelt (`card-mod`-Shake)
- **Selfie**: Hält ein Handy hoch, Blitz, Sprechblase mit Herz
- **Schlafwandeln** nachts (selten)
- **Seifenblasen** pusten, die aufsteigen und an Karten zerplatzen
- **Kreide**: zeichnet kurz ein Smiley auf eine leere Fläche, das langsam verblasst
- **Angeln** aus einer Wasserverbrauchs- oder Regenkarte
- **Yoga** vor der Wetterkarte, wenn es sonnig ist
- **Erschrecken**: springt hinter einer Karte hervor, wenn jemand die Kachel antippt, hinter der es sich versteckt

Tricks mit Sound (Sonos, leise) optional und zeitlich begrenzt (nicht nachts, nicht bei laufender Musik).

---

## 6. Fütterung und Pflege

- **Fütterungsfenster** konfigurierbar: z. B. 7–9, 12–14, 18–20 Uhr. Innerhalb der Fenster fragt es aktiv (Sprechblase, Löffel in der Hand, tippt auf einen imaginären Teller).
- Mahlzeiten: `snack` (+15), `meal` (+35), `treat` (+10 Hunger, +15 Happiness, zu viele → Bauchweh).
- Überfüttern möglich: Hunger > 95 → dick, langsam, Trick „Rülpsen“.
- **Kacke** entsteht ~2 h nach einer Mahlzeit; liegt dann irgendwo auf dem Dashboard herum, bis jemand `clean` tippt. Ungeputzt → Health sinkt langsam.
- **Krankheit** bei Health < 30: Thermometer, blass, liegt. `medicine` heilt, danach 2 h Erholung.
- **Tod?** Standard: **nein**. Bei Health 0 wird es nur ohnmächtig und muss mit Medizin + Fütterung reanimiert werden. Option „Hardcore“ aktivierbar (dann Grabstein und neues Ei).
- **Stufen**: Ei (1 Tag) → Baby (3 Tage) → Kind (7 Tage) → Teen (14 Tage) → Erwachsen → Senior nach 90 Tagen. Gute Pflege beschleunigt, schlechte verzögert oder führt zu einer „anderen“ Form (Grumpy-Variante). Jede Stufe hat ein anderes Aussehen.
- **Familienaspekt**: Fütterungen werden pro Person gezählt (wer hat getippt – über HA-User oder Auswahl im Menü). Kleines Statistik-Popup: „Diese Woche am meisten gefüttert von …“. Motiviert Kinder.

---

## 7. Einrichtung und Konfiguration

- HACS-Repository mit Integration **und** Card in einem (wie MACS).
- Config-Flow in HA: Name, Fütterungsfenster, Nachtzeiten, Wetter-Entity, Kalender-Entities, Personen, Kiosk-Präsenzsensor, Hardcore-Modus.
- Card-Config (YAML):

```yaml
type: custom:pixel-overlay-card
entity_prefix: pixel
scale: 1.0
avoid_cards: [camera, map]
favorite_cards: [calendar]
sounds: false
fps_limit: 30
```

- Mehrere Clients (Wandtablet + Handy) sehen dasselbe Tier: Position und Aktivität werden über den Backend-State gesynct; die Bewegungsinterpolation zwischen Zielen läuft lokal.

---

## 8. Offene Entscheidungen

1. **SVG-Rig vs. Pixel-Sprites.** Sprites = einfacher zu zeichnen, charmanter; SVG = Outfits kombinierbar ohne Explosion der Sprite-Anzahl. Empfehlung: SVG-Körper mit Pixel-Ästhetik (kantige Formen, `shape-rendering: crispEdges`).
2. **Dashboard-Overlay auf allen Views oder nur der Hauptview?** Vorschlag: Hauptview; auf anderen Views „ist es unterwegs“.
3. **Wie viel Erinnerungsfunktion?** Gefahr, dass es zum Notification-Center wird. Vorschlag: nur Kalender (15 min) und Fütterung, alles andere bleibt Gag ohne Handlungsdruck.
4. **Wer darf füttern?** Alle Dashboard-Nutzer, oder nur eingeloggte Personen (für die Statistik).
5. **Ein Tier oder eins pro Familienmitglied?** Ein Tier ist sozialer; mehrere sind lauter.

---

## 9. Roadmap

**Phase 0 – Prototyp mit Bordmitteln (1 Abend)**
Input-Numbers für Hunger/Happiness, Zeitautomation zum Senken, Scripts für Füttern/Spielen, `picture-elements`-Card mit `conditional`-Bildern pro Stimmung. Zweck: prüfen, ob die Familie das Konzept mag.

**Phase 1 – Backend-Integration (1–2 Wochenenden)**
Coordinator, Entities, Services, Persistenz, Wetter- und Kalenderanbindung, Mood-Berechnung, `pixel_event`.

**Phase 2 – Overlay-Card mit Bewegung (2–3 Wochenenden)**
DOM-Scan, Laufen zwischen Karten, Verstecken, Tap-Menü, SVG-Rig mit Basis-Outfits, Kiosk-Performance.

**Phase 3 – Charakter (fortlaufend)**
Tricks, Sprechblasen-Texte, Outfits pro Jahreszeit, Stufen-Designs, Statistik, Sonos-Sounds.

**Phase 4 – Veröffentlichung**
HACS-Default-Repo, README mit GIFs, Config-Flow-Politur.

---

## 10. Weitere Ideen (Backlog)

- **Besuch**: Bei Gästen im WLAN (neues Gerät) erscheint ein zweites, fremdes Tier kurz zu Besuch.
- **Träume**: Beim Schlafen kleine Traumblasen mit Motiven aus dem Tag (Wetter, Termine).
- **Haustier-Tagebuch**: Ein Markdown-Sensor mit den Ereignissen des Tages („Um 14:03 hat sich Pixel hinter dem Thermostat versteckt“).
- **Saisonale Quests**: „Füttere mich 7 Tage pünktlich, dann bekomme ich einen Umhang.“
- **Reaktion auf Assist/Sprachbefehle**: Ohr spitzen bei Wake-Word (MACS-Idee).
- **Physisches Pendant**: Ein kleines E-Paper-Display (ESPHome), auf dem das Tier „schläft“, wenn es nicht auf dem Dashboard ist.
- **Stimmungsmusik**: Bei „excited“ kurz Jingle auf Sonos, nur wenn niemand schläft.
- **Foto-Reaktion**: Neues Foto in Synology Photos → hält einen Bilderrahmen hoch.
