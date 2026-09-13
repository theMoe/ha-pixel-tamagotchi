"""Tests der Tick-Regeln."""

from __future__ import annotations

from datetime import timedelta

from conftest import advance, make_world

from engine import CalendarEvent, GameConfig, Mood, PetEngine, PetState, Stage


def events_of(events, kind):
    return [e for e in events if e.type == kind]


def test_needs_decay_over_one_hour(engine, world):
    before = (engine.state.hunger, engine.state.happiness, engine.state.energy)
    engine.tick(advance(world, hours=1))
    s = engine.state
    assert s.hunger == before[0] - engine.cfg.hunger_decay
    assert s.happiness == before[1] - engine.cfg.happiness_decay
    assert s.energy == before[2] - engine.cfg.energy_decay


def test_long_outage_is_capped(engine, world):
    engine.tick(advance(world, days=5))
    assert engine.state.hunger > 0, "Nach Ausfall darf das Tier nicht sofort verhungert sein"
    assert engine.state.health > 0


def test_sleeps_at_night_and_regenerates(engine):
    night = make_world(hour=23)
    engine.state.last_tick = night.now - timedelta(minutes=1)
    engine.state.energy = 40
    ev = engine.tick(night)
    assert engine.state.sleeping
    assert events_of(ev, "fell_asleep")
    assert engine.state.mood is Mood.SLEEPING
    assert engine.state.outfit.hat == "sleep_cap"
    engine.tick(advance(night, hours=1))
    assert engine.state.energy > 40


def test_wakes_up_in_the_morning(engine):
    night = make_world(hour=23)
    engine.state.last_tick = night.now
    engine.tick(night)
    morning = make_world(hour=8)
    morning = advance(night, hours=9)  # 08:00 nächster Tag
    engine.state.energy = 90
    ev = engine.tick(morning)
    assert not engine.state.sleeping
    assert events_of(ev, "woke_up")


def test_hunger_event_fires_once_on_crossing(engine, world):
    engine.state.hunger = 31
    engine.tick(world)  # initialisiert Zustand "nicht hungrig"
    ev = engine.tick(advance(world, hours=1))
    assert len(events_of(ev, "hungry")) == 1
    ev = engine.tick(advance(world, hours=2))
    assert not events_of(ev, "hungry")
    assert engine.state.mood is Mood.HUNGRY


def test_starving_damages_health_then_sick_then_fainted(engine, world):
    engine.state.hunger = 0
    w = world
    got_sick = False
    for _ in range(40):
        w = advance(w, hours=1)
        engine.state.hunger = 0  # bleibt hungrig
        ev = engine.tick(w)
        got_sick = got_sick or bool(events_of(ev, "sick"))
        if engine.state.fainted:
            break
    assert got_sick
    assert engine.state.fainted
    assert engine.state.mood is Mood.FAINTED


def test_hardcore_rebirth(world):
    cfg = GameConfig(hardcore=True)
    engine = PetEngine(PetState(hunger=0, health=1, born_at=world.now, last_tick=world.now), cfg)
    ev = engine.tick(advance(world, hours=2))
    assert events_of(ev, "died")
    assert engine.state.generation == 2
    assert engine.state.stage is Stage.EGG
    assert engine.state.health == 100


def test_poop_appears_after_meal(engine, world):
    engine.feed(world)
    assert engine.state.poop_due_at is not None
    ev = engine.tick(advance(world, minutes=engine.cfg.poop_delay_minutes + 1))
    assert events_of(ev, "poop")
    assert engine.state.poop_count == 1


def test_evolves_with_age(engine, world):
    w = world
    stages = []
    for _day in range(1, 30):
        w = advance(w, days=1)
        engine.state.hunger = engine.state.happiness = engine.state.health = 80
        ev = engine.tick(w)
        stages += [e.data["stage"] for e in events_of(ev, "evolved")]
    assert stages[:3] == ["baby", "child", "teen"]
    assert engine.state.stage is Stage.ADULT


def test_good_care_speeds_up_growth(world):
    """Stündliche Ticks über 9 Tage - gute Pflege erreicht 'teen', schlechte nicht."""
    cfg = GameConfig()
    good = PetEngine(PetState(born_at=world.now, last_tick=world.now), cfg)
    poor = PetEngine(PetState(born_at=world.now, last_tick=world.now), cfg)
    w = world
    for _ in range(9 * 24):
        w = advance(w, hours=1)
        good.state.hunger = good.state.happiness = good.state.health = good.state.energy = 100
        poor.state.hunger, poor.state.happiness, poor.state.health, poor.state.energy = 20, 10, 20, 100
        good.tick(w)
        poor.tick(w)
    assert good.state.stage is Stage.TEEN
    assert poor.state.stage in (Stage.BABY, Stage.CHILD)
    assert good.state.care_score > poor.state.care_score


def test_empty_house_slows_decay_and_welcomes_back(engine, world):
    away = make_world(persons_home=0)
    engine.state.last_tick = away.now
    engine.tick(away)
    start_hunger = engine.state.hunger
    # 5 Stunden weg: die ersten 4 normal, danach halbiert
    w = advance(away, hours=6)
    w.persons_home = 0
    engine.tick(w)
    normal_loss = engine.cfg.hunger_decay * 6
    assert start_hunger - engine.state.hunger < normal_loss
    home = advance(w, minutes=5)
    home.persons_home = 2
    ev = engine.tick(home)
    assert events_of(ev, "welcome_home")


def test_appointment_reminder_fires_once(engine, world):
    ev_cal = CalendarEvent(uid="abc", title="Termin A", start=world.now + timedelta(minutes=10))
    w = make_world(next_event=ev_cal)
    engine.state.last_tick = w.now
    ev = engine.tick(w)
    assert events_of(ev, "appointment_soon")[0].data["title"] == "Termin A"
    ev = engine.tick(advance(w, minutes=2))
    assert not events_of(ev, "appointment_soon")


def test_feeding_reminder_in_window_only_once(engine):
    w = make_world(hour=12, minute=0) if False else make_world(hour=12)
    engine.state.last_tick = w.now
    engine.state.hunger = 50
    ev = engine.tick(w)
    assert events_of(ev, "feeding_time")
    ev = engine.tick(advance(w, minutes=10))
    assert not events_of(ev, "feeding_time")
    # nach Fütterung keine Erinnerung im selben Fenster
    engine.feed(advance(w, minutes=11))
    ev = engine.tick(advance(w, minutes=30))
    assert not events_of(ev, "feeding_time")


def test_stress_from_calendar(engine):
    w = make_world(appointments_24h=7)
    engine.state.last_tick = w.now
    engine.tick(w)
    assert engine.state.mood is Mood.STRESSED
    assert engine.state.outfit.item == "coffee"
    assert engine.snapshot(w)["stress_level"] == 2


def test_state_roundtrip(engine, world):
    engine.feed(world)
    engine.tick(advance(world, hours=1))
    data = engine.state.to_dict()
    restored = PetState.from_dict(data)
    assert restored.to_dict() == data
    assert restored.stage is engine.state.stage
    assert restored.last_fed == engine.state.last_fed


def test_from_dict_tolerates_unknown_and_missing_fields():
    s = PetState.from_dict({"hunger": 12, "future_field": 1, "mood_override": "nonsense"})
    assert s.hunger == 12
    assert s.mood_override is None
    assert s.stage is Stage.EGG
