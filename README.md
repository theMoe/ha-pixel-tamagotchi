**English** | [Deutsch](README.de.md)

# Pixel – a Tamagotchi that lives on your Home Assistant dashboard

Pixel walks across your dashboard, climbs onto cards, hides behind the calendar, wears sunglasses when it's sunny and carries an umbrella when it rains, gets hectic on busy days and wants to be fed a few times a day. The house is its world: weather, calendar, presence and music shape its mood, outfit and behaviour.

The repository contains **an integration** (game logic, entities, services) **and a dashboard card** (animation, movement, interaction). The integration serves the card automatically – you don't need to add a Lovelace resource.

---

## Contents

1. [Requirements](#1-requirements)
2. [Installation via HACS](#2-installation-via-hacs)
3. [Manual installation](#3-manual-installation-alternative)
4. [Setting up the integration](#4-setting-up-the-integration)
5. [Adding the card to your dashboard](#5-adding-the-card-to-your-dashboard)
6. [Usage](#6-usage)
7. [Entities](#7-entities)
8. [Services](#8-services)
9. [Automation examples](#9-automation-examples)
10. [Card options](#10-card-options)
11. [Game rules](#11-game-rules)
12. [Troubleshooting](#12-troubleshooting)
13. [Development](#13-development)

---

## 1. Requirements

- Home Assistant **2024.8 or newer** (tested with 2025.1, 2026.8 and 2026.9)
- For one-click setup: [HACS](https://hacs.xyz) installed
- Optional but recommended: a `weather.*` entity, one or more `calendar.*` entities, `zone.home` (exists by default)

## 2. Installation via HACS

1. Open HACS → **⋮** in the top right → **Custom repositories**.
2. Enter the URL `https://github.com/theMoe/ha-pixel-tamagotchi`, type **Integration**, **Add**.
3. Search HACS for **Pixel** → **Download**.
4. **Restart Home Assistant** (Settings → System → Restart).

## 3. Manual installation (alternative)

1. Copy the folder `custom_components/pixel` from this repository into your HA config directory so that `config/custom_components/pixel/manifest.json` exists.
2. Restart Home Assistant.

## 4. Setting up the integration

1. **Settings → Devices & services → Add integration**, search for **Pixel**.
2. **Step 1 – Name:** What should your pet be called? (Default: Pixel). The name determines the entity IDs, e.g. `sensor.pixel_status`.
3. **Step 2 – Perception:** everything is optional
   - **Weather:** your `weather.*` entity → sunglasses, umbrella, beanie, ice cream …
   - **Calendar:** one or more calendars → appointment stress and a reminder 15 minutes before appointments
   - **Media player:** Sonos & co. → Pixel dances when music is playing
   - **Presence:** default `zone.home` (counts people at home). Alternatively a `binary_sensor`/`input_boolean` "someone is home" → loneliness, joy on homecoming, away protection
4. **Step 3 – Game rules:**
   - **Feeding windows:** `07:00-09:00, 12:00-14:00, 18:00-20:00` (freely adjustable)
   - **Bedtime / wake-up time:** Pixel sleeps at night, needs barely drop
   - **Pace:** 1 = normal, 0.5 = relaxed (good for getting started and for holidays), 2 = demanding
   - **Hardcore:** off = a neglected Pixel only faints; on = Pixel can die and a new egg hatches
5. **Done.** All settings can be changed later via **Configure** on the integration – no restart needed.

Pixel starts as an **egg** and hatches after about a day. With good care it then grows through baby, child and teen into an adult (see [Game rules](#11-game-rules)).

## 5. Adding the card to your dashboard

The card has to be placed **once** in the view where Pixel should live. It shows a small status chip (name, mood, three bars) and creates the pet as a layer above the whole view.

1. Open the dashboard → **✏️ Edit** → **Add card**.
2. Search for **Pixel** (under "Custom") – or choose **Manual** at the very bottom and enter:

   ```yaml
   type: custom:pixel-card
   entity: sensor.pixel_status
   ```

   `entity` can be omitted if there is only one Pixel; the card finds the status sensor by itself.

3. Save. If the card cannot be found: **hard-reload** the browser once (Ctrl + F5, or in the Companion app Settings → clear cache). The card is registered when the integration first starts and only appears after reloading.

**Recommendation for wall tablets/kiosks:** Put the card into the sections view of the family dashboard. Pixel prefers calendar cards as hiding spots and avoids pictures, maps and cameras.

**Multiple views:** Pixel lives once per page. If it should follow you when switching between several views, put a `pixel-card` on every view – ideally with `show_status: false` on the secondary views. The newly appearing card automatically takes the pet over from the disappearing one.

**Several devices at once:** Works without any extra setup. The game state lives in the backend, so wall tablet, phone and desktop show the same pet with the same values, and a feeding on one device is immediately visible everywhere. The fine-grained movement, on the other hand, is done by each card itself: position, walking paths, chosen idle action, speech bubble texts and the location of the poops differ per device. `pixel.say` and `pixel.trick` reach all devices at the same time, although `trick: random` may turn out differently on each device.

**Fixed navigation or footer bars:** If there is a fixed bar at the bottom of the screen (such as a navigation card in kiosk mode), Pixel detects it and puts its floor line above it instead of walking over the buttons. If this doesn't work for an unusual bar, a larger `floor_margin` helps (see [section 10](#10-card-options)).

Cards can be influenced specifically (attribute on the card element, e.g. via `card-mod` or your own custom cards):

- `data-pixel="favorite"` – favourite hiding spot
- `data-pixel="noclimb"` – never entered

## 6. Usage

| Action | Effect |
|---|---|
| **Tap** a built object | Tears it down. |
| **Tap** a poop | Cleans up exactly that one. The broom in the menu also removes one per tap. |
| **Tap** Pixel | Menu: Feed 🍎, Snack 🍪, Treat 🍬, Play ⚽, Pet ✋ – plus Clean 🧹 / Medicine 💊 when needed |
| **Long press** | Statistics: values, age, stage, feedings (who fed the most) |
| **Tap** the card Pixel is hiding behind | Pixel jumps out with "BOO!" |
| **Tap** a poop 💩 | Clean |
| Move finger/mouse | Pixel's eyes follow |

Feedings are counted per HA user (statistics in the long-press popup). For this, every family member has to be logged in with their own HA account.

## 7. Entities

All entities belong to the device **Pixel**. With a different name, the prefix changes.

| Entity | Meaning |
|---|---|
| `sensor.pixel_status` | Mood as state; **all values as attributes** (for the card and templates) |
| `sensor.pixel_hunger` | 0–100, **100 = full** |
| `sensor.pixel_happiness`, `sensor.pixel_energy`, `sensor.pixel_health` | Happiness, energy, health |
| `sensor.pixel_stage` | egg / baby / child / teen / adult / senior |
| `sensor.pixel_activity` | idle / sleeping / eating / playing / sick / fainted |
| `sensor.pixel_outfit` | Current clothing (attributes: hat, accessory, item) |
| `sensor.pixel_stress_level` | 0 relaxed, 1 busy (3+ appointments), 2 stressed (6+) |
| `sensor.pixel_age`, `sensor.pixel_care_score` | Age in days, rolling care score |
| `binary_sensor.pixel_needs_attention` | Hunger, poop, sick, fainted or feeding time |
| `binary_sensor.pixel_sick`, `_poop`, `_sleeping`, `_fainted`, `_feeding_time` | Individual states. `_sleeping` carries the attributes `reason` (`night` / `tired` / `manual`), `night_hours` and `energy` |
| `select.pixel_mood` | Show/override the mood; `auto` = the engine decides |
| `switch.pixel_animations` | Card animations on/off (kiosk power saving) |
| `switch.pixel_vacation` | Vacation on/off: all values frozen, no reminders, sun hat and cocktail |
| `button.pixel_feed`, `_snack`, `_treat`, `_play`, `_pet`, `_clean`, `_medicine` | Actions without the card |

## 8. Services

All services optionally accept `config_entry_id` in case several pets exist.

| Service | Fields | Effect |
|---|---|---|
| `pixel.feed` | `meal`: snack / meal / treat | Feed (+15 / +35 / +10 satiety; treat +15 happiness, max. 3 per day) |
| `pixel.play` | – | +25 happiness, −8 energy (below 20 energy: too tired). If something is built, Pixel plays with it, taking turns when there are several objects |
| `pixel.pet` | – | +5 happiness |
| `pixel.clean` | `count` (optional) | Remove poops; all without `count`, otherwise that many |
| `pixel.remove_build` | `build_id` (optional) | Tear down a built object; without it, the most recently built one |
| `pixel.medicine` | – | Heals when sick/fainted, otherwise "yuck" |
| `pixel.sleep` / `pixel.wake` | – | Put to sleep / wake up manually |
| `pixel.set_mood` | `mood`, `minutes` | Force a mood temporarily, `auto` cancels |
| `pixel.say` | `text`, `duration` | Speech bubble on the dashboard |
| `pixel.trick` | `trick`: random / tumble / jump / kick / hide / wave | Trick on the dashboard |
| `pixel.reset` | `name` | New egg (statistics are kept) |
| `pixel.set_vacation` | `enabled`: true / false | Start or end vacation (like `switch.pixel_vacation`) |

**Events:** The integration fires `pixel_event` with `type` (e.g. `fed`, `hungry`, `poop`, `sick`, `fainted`, `evolved`, `welcome_home`, `appointment_soon`, `feeding_time`, `fell_asleep` with `reason` (`night` / `tired` / `manual`), `woke_up`, `mood_changed`, `built`, `build_removed`, `played` with `build_id`/`build_kind`, `vacation_started`, `vacation_ended`) plus details. You can build automations on these. The card receives the same events via the WebSocket command `pixel/subscribe_events`; since 0.2.3 this also works for users without admin rights (kiosk, wall tablet).

## 9. Automation examples

**Push notification when Pixel needs something (at most every 2 hours):**

```yaml
alias: Pixel needs attention
triggers:
  - trigger: state
    entity_id: binary_sensor.pixel_needs_attention
    to: "on"
    for: "00:10:00"
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: "Pixel"
      message: "{{ state_attr('sensor.pixel_status', 'mood') }} – take a look at the dashboard."
mode: single
```

**Kiosk: animations only when someone is standing in front of the display:**

```yaml
alias: Pixel animations by presence
triggers:
  - trigger: state
    entity_id: binary_sensor.hallway_motion
actions:
  - action: "switch.turn_{{ 'on' if trigger.to_state.state == 'on' else 'off' }}"
    target:
      entity_id: switch.pixel_animations
```

**Vacation automatically when the family is away:**

```yaml
alias: Pixel vacation mode
triggers:
  - trigger: state
    entity_id: input_boolean.family_away
actions:
  - action: pixel.set_vacation
    data:
      enabled: "{{ trigger.to_state.state == 'on' }}"
```

**Washing machine done → Pixel tells you:**

```yaml
alias: Pixel announces washing machine
triggers:
  - trigger: state
    entity_id: sensor.washing_machine_status
    to: "done"
actions:
  - action: pixel.say
    data:
      text: "Laundry is done!"
      duration: 8
  - action: pixel.trick
    data:
      trick: jump
```

**Short jingle on Sonos when someone comes home (not at night):**

```yaml
alias: Pixel homecoming jingle
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
      entity_id: media_player.kitchen_speaker
    data:
      media_content_id: media-source://media_source/local/pixel-hello.mp3
      media_content_type: music
```

## 10. Card options

```yaml
type: custom:pixel-card
entity: sensor.pixel_status   # optional, found automatically otherwise
show_status: true             # show the status chip in the card
scale: 1                      # size of the pet (0.75 – 1.5 is sensible)
avoid:                        # card types to avoid (substrings of the card type)
  - picture
  - map
  - camera
  - navbar
favorites:                    # preferred hiding spots
  - calendar
  - planner
idle_min_seconds: 3           # pause between actions
idle_max_seconds: 8
floor_margin: 12              # distance of the floor line from the bottom edge
```

The card respects `prefers-reduced-motion` (no somersaults) and pauses when the tab is not visible or when something else covers the pet – such as a screensaver in kiosk mode or an open dialog.

**Light and dark theme:** The card reads the brightness from the Home Assistant theme (fallback: system setting) and follows every change automatically. In the light theme the egg gets a dark pixel outline and stronger colours, the senior a darker tone; the action menu and statistics adopt the theme colours. In the dark theme everything looks unchanged.

**Custom cards:** `avoid` and `favorites` compare substrings of the card type. The type is the element name without the `hui-` prefix and `-card` suffix – `hui-calendar-card` becomes `calendar`, a custom card `<name>-card` becomes `<name>`. To find out what your own cards are called, look up the element names in the browser console (F12) via the elements view. Individual cards can additionally be marked with `data-pixel="favorite"` or `data-pixel="noclimb"` (see [section 5](#5-adding-the-card-to-your-dashboard)).

**When the row is too full:** The card doesn't demand a minimum width. If the same `horizontal-stack` contains cards with a fixed width that already fill the row, nothing is left for Pixel and the card isn't rendered at all. Then either set `show_status: false` (the pet on the dashboard is unaffected) or give the card its own row.

**Status chip in narrow containers:** In `horizontal-stack` or `custom:stack-in-card`, every card only gets an equal share of the row via `flex: 1 1 0`. The chip then scales down step by step – first the three bars disappear, then name and mood, finally only the pet remains. If you want to see the full chip, give the card its own row or, in the sections view, its own `grid_options`. If you only care about the pet on the dashboard anyway, `show_status: false` is the cleanest solution – the card then disappears from the layout completely.

## 11. Game rules

- **Needs** drop per hour: satiety −4, happiness −2, energy −3 (× pace factor). While sleeping, energy regenerates and satiety drops only a quarter as fast.
- **Sleep:** Pixel sleeps at night (bedtime and wake-up time from the integration settings, default 22:00 to 06:30, in the time zone of the Home Assistant server). If energy drops below 15 during the day, it takes a nap until energy reaches 40 again (about 2 hours); feeding wakes it up. `pixel.sleep` / `pixel.wake` intervene manually; at night it falls asleep again on the next tick after being woken. Why it is currently sleeping is shown in `binary_sensor.pixel_sleeping` under `reason`.
- **Away protection:** If the house has been empty for more than 4 hours, all values drop only half as fast. Pixel is happy when you come home (+happiness).
- **Vacation** (`switch.pixel_vacation` or `pixel.set_vacation`): For longer absences or when nobody can take care of it right now. All values stand still, there are no poops, no reminders, no getting sick and no building; Pixel is awake (even at night), wears a sun hat and cocktail and has the mood "vacation". Feeding and playing still work. When it ends, things continue where they left off, nothing is caught up. A pet that was already sick stays sick until it gets medicine. Only an automation of your own switches vacation on automatically (example in section 9).
- **Feeding windows:** Within the windows Pixel reminds you once (`feeding_time` event, card speech bubble). Feeding is allowed outside of them too.
- **Poop** comes 2 hours after a meal and costs health until it is cleaned up.
- **Health** drops when satiety < 15 or there is poop; below 30 Pixel is **sick** (medicine or recovery), at 0 it **faints** (medicine, then feed). Hardcore: death and a new egg instead.
- **Stages** (with average care): egg 1 day → baby → child from day 4 → teen from day 11 → adult from day 25 → senior from day 90. Good care speeds this up by up to 30 %, poor care delays it by up to 50 %.
- **Mood** (priority): fainted › sick › sleeping › hungry (< 30) › stressed (≥ 6 appointments) › lonely (house empty > 4 h and happiness < 40) › excited (someone comes home, playing) › busy (≥ 3 appointments) › bored (> 6 h without interaction) › happy.
- **Outfit:** sun → sunglasses (+ice cream from 26 °C, +beanie below 8 °C); rain/thunderstorm → umbrella; snow → beanie and scarf; wind → scarf; fog → lantern; 3–5 appointments → clipboard; 6 or more → coffee; December → Santa hat; end of October → pumpkin; March/April on weekends → bunny ears.
- **Building:** Every 8 hours Pixel builds something if it is awake, healthy, in a good mood (≥ 60) and rested (≥ 35) – a house, golf hole, swing or flower bed, in winter a snowman. At most four objects at a time. If happiness or energy is lacking when it's due, Pixel tries again every 30 minutes; if it is asleep, it builds after waking up. The next build time is shown by `sensor.pixel_builds` in the attribute `next_at`. Tapping an object tears it down (−3 happiness). As long as something is standing, Pixel goes over to it every now and then and plays around with it.
- **Playing with builds:** If something is built, Pixel plays with it on "Play", taking turns when there are several objects; torn-down objects drop out of the rotation. At the golf hole, Pixel walks somewhere to tee off and needs one to three strokes, walks to the ball in between and sinks it at the end.
- **Outages:** After restarts or a power cut, at most 12 hours are recalculated – Pixel doesn't starve because HA was off for a weekend.

All numbers are in `custom_components/pixel/engine/config.py`.

## 12. Troubleshooting

| Problem | Solution |
|---|---|
| "Custom element doesn't exist: pixel-card" | Is the integration running? Hard-reload the browser (Ctrl + F5). In the Companion app: Settings → Companion app → Reset frontend cache. Check whether `http://<ha>:8123/pixel-static/pixel-card.js` is reachable. |
| Pixel doesn't appear, but the chip does | The card must be in the same view. Check the browser console (F12) for `[pixel-card]` messages. |
| Pixel stands at the top by the header | Cards are only scanned after loading; the card rescans after 0.8 s. On very slow tablets, increase `idle_min_seconds`. |
| Several Pixels at the same time | Only one pet runs per page – the first card wins. Further cards only show their status chip. |
| Pixel is hard to see in the light theme | Since 0.1.2 the card adapts to the theme. If it stays pale: hard-reload the browser so the new card version is loaded. |
| Pixel disappears after switching views | Fixed in 0.1.2. Before that, only reloading helped. Check whether the loaded card version is current (`/pixel-static/pixel-card.js?v=…`). |
| Pixel sleeps during the day | `binary_sensor.pixel_sleeping` → attribute `reason`. `tired`: energy was below 15 (lots of playing or a high pace); it wakes up again at 40, feeding wakes it immediately. `night` outside the configured times (`night_hours`): check the time zone in HA (Settings → System → General), the integration uses server time. `manual`: an automation or a click called `pixel.sleep`. Bedtime and wake-up time: integration → Configure → Game rules. |
| Pixel doesn't build anything | First object at the earliest 8 hours after the first start, then every 8 hours. Check: `switch.pixel_vacation` off? In `sensor.pixel_status`: `sleeping`, `sick` and `fainted` false, `stage` not `egg`, `happiness` ≥ 60, `energy` ≥ 35? `sensor.pixel_builds` shows the next attempt in the attribute `next_at` (since 0.2.1) and under `items` what is already standing. |
| A built object is in a strange spot | The horizontal position comes from the backend and is the same on all devices; each card finds the height by itself. On unusual layouts it ends up on the floor line if necessary. Tapping removes it. |
| Pixel has disappeared and doesn't come back | Up to 0.1.2 the pet could get stuck behind a card. Fixed in 0.1.3; a watchdog additionally brings it back every 20 s in case it does get stuck. Check whether the loaded card version is current. |
| On one device, speech bubbles like "tasty!" are missing and playing does nothing | Up to 0.2.2 the card only received events for admin users; the HA log then shows `Refusing to allow … to subscribe to event pixel_event`. Fixed in 0.2.3. After the update, restart HA and reload the device. |
| Pixel walks over the navigation bar | Should be detected automatically; otherwise set `floor_margin` to the height of the bar. |
| Calendar is ignored | The integration uses `calendar.get_events`; the calendar integration must support this action (Google, CalDAV, local calendars: yes). |
| Entity IDs are different | The IDs follow the English entity name; with a different pet name the prefix changes (`sensor.blob_status`). |
| Logging | `logger: logs: custom_components.pixel: debug` in `configuration.yaml`. |

## 13. Development

```bash
# Python 3.14 (HA 2026.x); the version combinations are listed in requirements_test.txt
uv venv .venv --python 3.14 && uv pip install --python .venv/bin/python homeassistant==2026.9.0 -r requirements_test.txt
.venv/bin/python -m pytest            # 52 engine tests + 12 integration tests
.venv/bin/python -m ruff check . && .venv/bin/python -m ruff format .
cd tests/frontend && npm install && node card.smoke.test.mjs   # card smoke test in jsdom
```

The suite passes against HA 2026.9.0 and 2026.8.3 (Python 3.14) as well as 2025.1.4 (Python 3.12).

`docs/card-demo.html` loads the real card with a mock hass in the browser – for trying it out without Home Assistant. The page needs an HTTP server because the card consists of ES modules: `python3 -m http.server 8000` in the project directory, then `http://localhost:8000/docs/card-demo.html`. `docs/prototyp.html` is the original prototype, `docs/KONZEPT.md` the concept (both in German). `PROJEKTSTAND.md` is the briefing for further development (German).

License: MIT.
