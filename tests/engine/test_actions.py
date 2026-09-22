"""Tests der Aktionen und Outfit-Ableitung."""

from __future__ import annotations

import pytest
from conftest import advance, make_world

from engine import ActionRefused, Activity, Build, Meal, Mood, PetState, WeatherKind


def types(events):
    return [e.type for e in events]


def test_feed_meal(engine, world):
    engine.state.hunger = 50
    ev = engine.feed(world, Meal.MEAL, user="alex")
    assert "fed" in types(ev)
    assert engine.state.hunger == 85
    assert engine.state.activity is Activity.EATING
    assert engine.state.feeds_by_user == {"alex": 1}
    assert engine.state.last_fed == world.now


def test_overfeeding_reports_event(engine, world):
    engine.state.hunger = 90
    ev = engine.feed(world)
    assert "overfed" in types(ev)
    assert engine.state.hunger == 100


def test_too_many_treats_hurt(engine, world):
    for _ in range(engine.cfg.max_treats_per_day):
        engine.feed(world, Meal.TREAT)
    health = engine.state.health
    ev = engine.feed(world, Meal.TREAT)
    assert "tummy_ache" in types(ev)
    assert engine.state.health < health


def test_eating_activity_expires(engine, world):
    engine.feed(world)
    engine.tick(advance(world, seconds=engine.cfg.eating_seconds + 1))
    assert engine.state.activity is Activity.IDLE


def test_play_needs_energy(engine, world):
    engine.state.energy = 10
    ev = engine.play(world)
    assert "too_tired" in types(ev)
    engine.state.energy = 50
    ev = engine.play(world)
    assert "played" in types(ev)
    assert engine.state.mood is Mood.EXCITED


def test_pet_while_sleeping_grumbles(engine):
    night = make_world(hour=23)
    engine.state.last_tick = night.now
    engine.tick(night)
    ev = engine.act("pet", night)
    assert types(ev) == ["grumbled"]


def test_feeding_wakes_up(engine):
    night = make_world(hour=23)
    engine.state.last_tick = night.now
    engine.tick(night)
    engine.feed(night)
    assert not engine.state.sleeping
    # ...aber die Nacht setzt den manuellen Eingriff später zurück
    engine.tick(advance(night, minutes=30))
    assert engine.state.sleeping_manual is None


def test_clean(engine, world):
    assert types(engine.act("clean", world)) == ["nothing_to_clean"]
    engine.state.poop_count = 2
    ev = engine.act("clean", world)
    assert ev[0].data["removed"] == 2
    assert engine.state.poop_count == 0


def test_clean_single(engine, world):
    """Ein Haeufchen antippen putzt genau dieses, nicht den ganzen Hof."""
    engine.state.poop_count = 3
    engine.state.happiness = 50
    ev = engine.act("clean", world, count=1)
    assert ev[0].data == {"removed": 1, "left": 2}
    assert engine.state.poop_count == 2
    assert engine.state.happiness == 55


def test_clean_count_is_capped(engine, world):
    """Mehr putzen als da ist, entfernt nur das Vorhandene."""
    engine.state.poop_count = 1
    ev = engine.act("clean", world, count=5)
    assert ev[0].data["removed"] == 1
    assert engine.state.poop_count == 0


def test_clean_bonus_is_per_pile(engine, world):
    """Einzeln putzen darf nicht lohnender sein als alles auf einmal."""
    engine.state.poop_count = 3
    engine.state.happiness = 10
    engine.act("clean", world)
    auf_einmal = engine.state.happiness
    engine.state.poop_count = 3
    engine.state.happiness = 10
    for _ in range(3):
        engine.act("clean", world, count=1)
    assert engine.state.happiness == auf_einmal


def test_medicine_only_when_sick(engine, world):
    assert types(engine.act("medicine", world)) == ["medicine_refused"]
    engine.state.health = 10
    engine.state.sick_since = world.now
    ev = engine.act("medicine", world)
    assert "healed" in types(ev)
    assert not engine.state.is_sick
    assert engine.state.health == engine.cfg.medicine_health


def test_fainted_blocks_play_but_medicine_revives(engine, world):
    engine.state.fainted = True
    engine.state.health = 0
    with pytest.raises(ActionRefused):
        engine.play(world)
    with pytest.raises(ActionRefused):
        engine.feed(world)
    ev = engine.act("medicine", world)
    assert "revived" in types(ev)
    assert not engine.state.fainted
    assert "fed" in types(engine.feed(world))


def test_mood_override_and_expiry(engine, world):
    engine.act("set_mood", world, mood=Mood.EXCITED, minutes=5)
    assert engine.state.mood is Mood.EXCITED
    engine.tick(advance(world, minutes=6))
    assert engine.state.mood_override is None
    assert engine.state.mood is not Mood.EXCITED


def test_reset_hatches_new_generation(engine, world):
    engine.state.hunger = 3
    ev = engine.act("reset", world, name="Blob")
    assert "hatched" in types(ev)
    assert engine.state.generation == 2
    assert engine.state.name == "Blob"
    assert engine.state.hunger == 70


@pytest.mark.parametrize(
    ("weather", "temp", "expected"),
    [
        (WeatherKind.SUNNY, 24, {"accessory": "sunglasses", "item": ""}),
        (WeatherKind.SUNNY, 30, {"accessory": "sunglasses", "item": "ice_cream"}),
        (WeatherKind.RAINY, 15, {"item": "umbrella"}),
        (WeatherKind.SNOWY, -2, {"hat": "beanie", "accessory": "scarf"}),
        (WeatherKind.FOGGY, 10, {"item": "lantern"}),
    ],
)
def test_weather_outfits(engine, weather, temp, expected):
    w = make_world(weather=weather, temperature=temp)
    engine.state.last_tick = w.now
    engine.tick(w)
    outfit = engine.state.outfit.as_dict()
    for key, value in expected.items():
        assert outfit[key] == value, outfit


def test_snapshot_contains_card_relevant_fields(engine, world):
    snap = engine.snapshot(world)
    keys = ("mood", "activity", "outfit", "hunger", "stress_level", "needs_attention", "feeding_window", "vacation")
    for key in keys:
        assert key in snap


def test_set_vacation_is_idempotent_and_wakes(engine):
    night = make_world(hour=23)
    engine.state.last_tick = night.now
    engine.tick(night)
    assert engine.state.sleeping
    ev = engine.act("set_vacation", night, enabled=True)
    assert types(ev)[:2] == ["woke_up", "vacation_started"]
    assert not engine.state.sleeping
    assert engine.state.mood is Mood.VACATION
    assert engine.state.outfit.hat == "sun_hat"
    assert engine.act("set_vacation", night, enabled=True) == []
    # Der Neustart eines Eis darf den Schalter nicht still umlegen.
    engine.act("reset", night)
    assert engine.state.vacation is True
    ev = engine.act("set_vacation", night, enabled=False)
    assert "vacation_ended" in types(ev)
    assert engine.act("set_vacation", night, enabled=False) == []


def _set_builds(engine, world, *ids):
    engine.state.builds = [
        Build(id=i, kind="house", rx=0.2 * n, created=world.now.isoformat()) for n, i in enumerate(ids)
    ]


def _play_build(engine, world):
    engine.state.energy = 90
    played = next(e for e in engine.play(world) if e.type == "played")
    return played.data["build_id"]


def test_play_rotates_through_builds(engine, world):
    _set_builds(engine, world, "a", "b", "c")
    assert [_play_build(engine, world) for _ in range(4)] == ["a", "b", "c", "a"]
    assert engine.state.last_played_build_id == "a"
    played = next(e for e in engine.play(world) if e.type == "played")
    assert played.data["build_kind"] == "house"


def test_play_rotation_knows_only_existing_builds(engine, world):
    """Abgerissene Objekte fallen aus der Runde, egal ob schon bespielt oder nicht."""
    _set_builds(engine, world, "a", "b", "c")
    assert _play_build(engine, world) == "a"
    engine.act("remove_build", world, build_id="c")  # noch nicht bespielt
    assert _play_build(engine, world) == "b"
    engine.act("remove_build", world, build_id="b")  # das zuletzt bespielte
    assert _play_build(engine, world) == "a"
    engine.act("remove_build", world, build_id="a")
    assert _play_build(engine, world) is None


def test_play_without_builds_has_no_build(engine, world):
    assert _play_build(engine, world) is None
    assert engine.state.last_played_build_id == ""


def test_state_roundtrip_keeps_last_played(engine, world):
    _set_builds(engine, world, "a", "b")
    _play_build(engine, world)
    assert PetState.from_dict(engine.state.to_dict()).last_played_build_id == "a"
