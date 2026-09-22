"""Tick-Regeln: Jede Regel ändert genau einen Aspekt des Zustands pro Tick.

Neue Mechaniken werden als weitere Regel-Klasse ergänzt und in
``PetEngine`` registriert - bestehende Regeln bleiben unangetastet.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Protocol

from .config import GameConfig
from .models import (
    STAGE_ORDER,
    Activity,
    Build,
    BuildKind,
    GameEvent,
    Mood,
    PetState,
    Stage,
    WeatherKind,
    WorldContext,
)


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


@dataclass
class TickContext:
    """Alles, was eine Regel während eines Ticks braucht."""

    state: PetState
    world: WorldContext
    cfg: GameConfig
    dt_hours: float
    events: list[GameEvent] = field(default_factory=list)

    def emit(self, event_type: str, **data: object) -> None:
        self.events.append(GameEvent(event_type, dict(data)))


class Rule(Protocol):
    """Schnittstelle einer Tick-Regel."""

    def apply(self, ctx: TickContext) -> None: ...


# --------------------------------------------------------------------------- Regeln


class DayResetRule:
    """Setzt Tageszähler zurück, wenn ein neuer (lokaler) Tag begonnen hat."""

    def apply(self, ctx: TickContext) -> None:
        key = ctx.state.treats_day_key(ctx.world.local_now)
        if ctx.state.treats_day != key:
            ctx.state.treats_day = key
            ctx.state.treats_today = 0


class PresenceRule:
    """Merkt sich, seit wann das Haus leer ist, und meldet Heimkehr."""

    def apply(self, ctx: TickContext) -> None:
        s, w = ctx.state, ctx.world
        if w.persons_home is None:
            return
        if w.house_empty:
            if s.house_empty_since is None:
                s.house_empty_since = w.now
        elif s.house_empty_since is not None:
            away_hours = (w.now - s.house_empty_since).total_seconds() / 3600
            s.house_empty_since = None
            if away_hours >= 1:
                s.happiness = clamp(s.happiness + min(20.0, away_hours * 2))
                ctx.emit("welcome_home", away_hours=round(away_hours, 1))


class SleepRule:
    """Entscheidet, ob das Tier schläft (manuell, Nacht oder erschöpft).

    Automatischer Schlaf endet, sobald die Nacht vorbei ist und die Energie
    ``nap_rested_threshold`` erreicht: ein Nickerchen aus Erschöpfung dauert so
    etwa zwei Stunden statt bis zum vollen Ausgeschlafensein.
    """

    def apply(self, ctx: TickContext) -> None:
        s, cfg = ctx.state, ctx.cfg
        night = cfg.is_night(ctx.world.local_now.time())

        # Manueller Eingriff verfällt mit Ende der Nacht bzw. wenn ausgeschlafen.
        if s.sleeping_manual is True and not night and s.energy >= cfg.rested_threshold:
            s.sleeping_manual = None
        if s.sleeping_manual is False and night:
            s.sleeping_manual = None

        if s.sleeping_manual is not None:
            sleeping = s.sleeping_manual
        elif s.fainted:
            sleeping = False
        elif s.sleeping:
            sleeping = night or s.energy < cfg.nap_rested_threshold
        else:
            sleeping = night or s.energy < cfg.low_energy_threshold

        if sleeping == s.sleeping:
            return
        s.sleeping = sleeping
        if sleeping:
            ctx.emit("fell_asleep", reason=str(s.sleep_reason(night)))
        else:
            ctx.emit("woke_up")


class NeedsDecayRule:
    """Hunger, Laune und Energie verändern sich mit der Zeit."""

    def apply(self, ctx: TickContext) -> None:
        s, w, cfg, dt = ctx.state, ctx.world, ctx.cfg, ctx.dt_hours
        if s.fainted:
            return

        factor = 1.0
        if s.house_empty_since is not None:
            empty_hours = (w.now - s.house_empty_since).total_seconds() / 3600
            if empty_hours >= cfg.empty_house_slowdown_after_hours:
                factor = cfg.empty_house_decay_factor  # Urlaubsschutz

        if s.sleeping:
            s.hunger = clamp(s.hunger - cfg.hunger_decay * 0.25 * dt * factor)
            s.energy = clamp(s.energy + cfg.energy_regen_sleeping * dt)
            return

        s.hunger = clamp(s.hunger - cfg.hunger_decay * dt * factor)
        s.energy = clamp(s.energy - cfg.energy_decay * dt * factor)

        happiness_decay = cfg.happiness_decay
        if w.appointments_24h >= cfg.stress_high_appointments:
            happiness_decay += cfg.happiness_extra_decay_stressed
        if s.house_empty_since is not None and s.happiness < cfg.lonely_happiness_threshold + 20:
            happiness_decay += cfg.happiness_extra_decay_lonely
        s.happiness = clamp(s.happiness - happiness_decay * dt * factor)


class HungerEventRule:
    """Meldet Schwellenübergänge beim Hunger (für Automationen)."""

    def __init__(self) -> None:
        self._was_hungry: bool | None = None

    def apply(self, ctx: TickContext) -> None:
        hungry = ctx.state.hunger < ctx.cfg.hungry_threshold
        if self._was_hungry is not None and hungry and not self._was_hungry:
            ctx.emit("hungry", hunger=round(ctx.state.hunger))
        self._was_hungry = hungry


class PoopRule:
    """Nach einer Mahlzeit muss irgendwann ein Häufchen kommen."""

    def apply(self, ctx: TickContext) -> None:
        s = ctx.state
        if s.poop_due_at is not None and ctx.world.now >= s.poop_due_at:
            s.poop_due_at = None
            s.poop_count += 1
            ctx.emit("poop", count=s.poop_count)


class BuildRule:
    """Bei guter Laune baut das Tier ab und an etwas auf das Dashboard.

    Die Fälligkeit steht im ``PetState`` und nicht in der Regelinstanz: regelinterner
    Zustand überlebt weder einen Neustart noch ``apply_settings``. Ist das Tier zur
    Fälligkeit nicht in Stimmung (Laune, Energie, Obergrenze), wartet die Regel nur
    ``build_retry_minutes`` und nicht ein ganzes Intervall. Schläft es, bleibt die
    Fälligkeit stehen und greift beim Aufwachen.
    """

    def apply(self, ctx: TickContext) -> None:
        s, w, cfg = ctx.state, ctx.world, ctx.cfg
        if s.sleeping or s.fainted or s.is_sick or s.stage is Stage.EGG:
            return
        if s.build_due_at is None:
            s.build_due_at = w.now + timedelta(hours=cfg.build_interval_hours)
            return
        if w.now < s.build_due_at:
            return
        if not self._can_build(s, cfg):
            s.build_due_at = w.now + timedelta(minutes=cfg.build_retry_minutes)
            return
        s.build_due_at = w.now + timedelta(hours=cfg.build_interval_hours)

        build = Build(
            id=str(int(w.now.timestamp())),
            kind=str(_pick_kind(s, w)),
            rx=_next_rx(s),
            created=w.now.isoformat(),
        )
        s.builds.append(build)
        s.energy = clamp(s.energy - cfg.build_energy_cost)
        s.happiness = clamp(s.happiness + cfg.build_happiness)
        s.activity = Activity.BUILDING
        s.activity_until = w.now + timedelta(seconds=cfg.building_seconds)
        ctx.emit("built", id=build.id, kind=build.kind, rx=build.rx)

    @staticmethod
    def _can_build(s: PetState, cfg: GameConfig) -> bool:
        """Platz frei und das Tier in Stimmung: gut gelaunt und ausgeruht."""
        if len(s.builds) >= cfg.max_builds:
            return False
        return s.happiness >= cfg.build_min_happiness and s.energy >= cfg.build_min_energy


def _pick_kind(s: PetState, w: WorldContext) -> BuildKind:
    """Ohne Zufallsquelle: Wetter und Jahreszeit entscheiden, sonst der Reihe nach."""
    vorhanden = {b.kind for b in s.builds}
    winter = w.weather is WeatherKind.SNOWY or w.local_now.month in (12, 1, 2)
    if winter and str(BuildKind.SNOWMAN) not in vorhanden:
        return BuildKind.SNOWMAN
    for kind in (BuildKind.HOUSE, BuildKind.GOLF, BuildKind.SWING, BuildKind.FLOWERS):
        if str(kind) not in vorhanden:
            return kind
    return BuildKind.FLOWERS


def _next_rx(s: PetState) -> float:
    """Möglichst weit weg von dem, was schon steht - die Objekte sollen sich verteilen."""
    belegt = [b.rx for b in s.builds]
    if not belegt:
        return 0.5
    kandidaten = [0.08 + 0.84 * i / 6 for i in range(7)]
    return max(kandidaten, key=lambda x: min(abs(x - b) for b in belegt))


class HealthRule:
    """Gesundheit sinkt bei Vernachlässigung, regeneriert sonst. Steuert krank/ohnmächtig."""

    def apply(self, ctx: TickContext) -> None:
        s, cfg, dt = ctx.state, ctx.cfg, ctx.dt_hours
        if s.fainted:
            return

        damage = 0.0
        if s.hunger < cfg.starving_threshold:
            damage += cfg.health_damage_hungry
        if s.poop_count > 0:
            damage += cfg.health_damage_poop * s.poop_count

        if damage:
            s.health = clamp(s.health - damage * dt)
        else:
            s.health = clamp(s.health + cfg.health_regen * dt)

        if not s.is_sick and s.health < cfg.sick_threshold:
            s.sick_since = ctx.world.now
            ctx.emit("sick", health=round(s.health))
        elif s.is_sick and s.health >= cfg.recovered_threshold:
            s.sick_since = None
            ctx.emit("recovered", health=round(s.health))

        if s.health <= 0:
            if cfg.hardcore:
                ctx.emit("died", generation=s.generation, age_days=s.age_days(ctx.world.now))
                _rebirth(s, ctx)
            else:
                s.fainted = True
                s.sleeping = False
                ctx.emit("fainted")


def _rebirth(s: PetState, ctx: TickContext) -> None:
    """Hardcore: neues Ei, Statistik bleibt."""
    fresh = PetState(name=s.name, generation=s.generation + 1, born_at=ctx.world.now)
    fresh.total_feeds = s.total_feeds
    fresh.total_plays = s.total_plays
    fresh.feeds_by_user = dict(s.feeds_by_user)
    fresh.animations_enabled = s.animations_enabled
    for key, value in fresh.__dict__.items():
        setattr(s, key, value)


class CareScoreRule:
    """Gleitender Pflegewert - beeinflusst, wie schnell das Tier heranwächst."""

    def apply(self, ctx: TickContext) -> None:
        s, dt = ctx.state, ctx.dt_hours
        current = (s.hunger + s.happiness + s.health) / 3
        # Zeitkonstante ~24 h: alter Wert wird langsam durch aktuellen ersetzt.
        weight = min(1.0, dt / 24.0)
        s.care_score = clamp(s.care_score * (1 - weight) + current * weight)


class StageRule:
    """Wachstum in Lebensstufen, beschleunigt oder verzögert durch Pflege."""

    def apply(self, ctx: TickContext) -> None:
        s, cfg = ctx.state, ctx.cfg
        age = s.age_days(ctx.world.now)
        care_ratio = (s.care_score - 50) / 50  # -1 .. +1
        speed = 1 + (cfg.care_speed_bonus * care_ratio if care_ratio > 0 else cfg.care_speed_penalty * care_ratio)
        effective_age = age * max(0.1, speed)

        target = Stage.EGG
        for stage in STAGE_ORDER:
            if effective_age >= cfg.stage_days[stage]:
                target = stage
        if STAGE_ORDER.index(target) > STAGE_ORDER.index(s.stage):
            s.stage = target
            ctx.emit("evolved", stage=str(target), age_days=age)


class ActivityExpiryRule:
    """Zeitlich begrenzte Aktivitäten (essen, spielen) enden von selbst."""

    def apply(self, ctx: TickContext) -> None:
        s = ctx.state
        if s.activity_until is not None and ctx.world.now >= s.activity_until:
            s.activity = Activity.IDLE
            s.activity_until = None


class MoodOverrideExpiryRule:
    """Manuell gesetzte Stimmungen laufen ab."""

    def apply(self, ctx: TickContext) -> None:
        s = ctx.state
        if s.mood_override_until is not None and ctx.world.now >= s.mood_override_until:
            s.mood_override = None
            s.mood_override_until = None


class AppointmentRule:
    """Kurz vor einem Termin einmalig erinnern."""

    def apply(self, ctx: TickContext) -> None:
        s, w, cfg = ctx.state, ctx.world, ctx.cfg
        event = w.next_event
        if event is None or event.all_day or s.sleeping:
            return
        until = event.start - w.now
        in_window = timedelta(0) <= until <= timedelta(minutes=cfg.appointment_warn_minutes)
        if in_window and s.announced_event_uid != event.uid:
            s.announced_event_uid = event.uid
            ctx.emit("appointment_soon", title=event.title, minutes=int(until.total_seconds() // 60))


class FeedingReminderRule:
    """Erinnert einmal pro Fütterungsfenster, wenn noch nicht gefüttert wurde."""

    def __init__(self) -> None:
        self._reminded_window: str | None = None

    def apply(self, ctx: TickContext) -> None:
        s, w, cfg = ctx.state, ctx.world, ctx.cfg
        window = cfg.in_feeding_window(w.local_now.time())
        if window is None or s.sleeping or s.fainted:
            self._reminded_window = None
            return
        key = f"{w.local_now.date()}-{window.start}"
        if self._reminded_window == key:
            return
        if not _fed_in_window(s, w, window):
            self._reminded_window = key
            ctx.emit("feeding_time", window_start=window.start.isoformat(), hunger=round(s.hunger))


def _fed_in_window(s: PetState, w: WorldContext, window) -> bool:  # noqa: ANN001
    if s.last_fed is None:
        return False
    offset = w.local_now.utcoffset() or timedelta(0)
    window_start_local = w.local_now.replace(
        hour=window.start.hour, minute=window.start.minute, second=0, microsecond=0
    )
    window_start_utc = window_start_local - offset
    return s.last_fed.replace(tzinfo=None) >= window_start_utc.replace(tzinfo=None)


def default_rules() -> list[Rule]:
    """Standardreihenfolge der Regeln - die Reihenfolge ist Teil der Semantik."""
    return [
        DayResetRule(),
        PresenceRule(),
        SleepRule(),
        NeedsDecayRule(),
        HungerEventRule(),
        PoopRule(),
        HealthRule(),
        CareScoreRule(),
        StageRule(),
        BuildRule(),
        ActivityExpiryRule(),
        MoodOverrideExpiryRule(),
        AppointmentRule(),
        FeedingReminderRule(),
    ]


# Regeln, die im Urlaub pausieren. Die Regeln selbst wissen nichts vom Urlaub;
# die Engine wählt nur eine kleinere Liste. Pausiert wird alles, was Pflege
# verlangt oder bestraft: Bedürfnisse (NeedsDecay, Poop, Health, CareScore),
# Erinnerungen (HungerEvent, FeedingReminder, Appointment), Bauen (BuildRule)
# und der Schlaf (SleepRule): mit eingefrorener Energie würde ein Tier unter der
# Ausgeschlafen-Schwelle nie mehr aufwachen. Weiter laufen Tagesreset,
# Anwesenheit (grosses "welcome_home" nach der Reise), Wachstum und die Ablaufregeln.
PAUSED_ON_VACATION: tuple[type, ...] = (
    SleepRule,
    NeedsDecayRule,
    HungerEventRule,
    PoopRule,
    HealthRule,
    CareScoreRule,
    BuildRule,
    AppointmentRule,
    FeedingReminderRule,
)


def vacation_rules(rules: Iterable[Rule]) -> list[Rule]:
    """Teilmenge derselben Regelinstanzen, die im Urlaub weiterläuft.

    Es werden bewusst dieselben Objekte zurückgegeben, damit regelinterne
    Merker (z. B. ``HungerEventRule._was_hungry``) den Urlaub überdauern.
    """
    return [rule for rule in rules if not isinstance(rule, PAUSED_ON_VACATION)]


__all__ = ["PAUSED_ON_VACATION", "Mood", "Rule", "TickContext", "clamp", "default_rules", "vacation_rules"]
