"""Die Engine-Fassade: der einzige Einstiegspunkt für die HA-Schicht."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from .actions import PetActions
from .config import GameConfig
from .evaluators import MoodEvaluator, OutfitResolver, StressEvaluator
from .models import Activity, GameEvent, Meal, Mood, PetState, WorldContext
from .rules import Rule, TickContext, default_rules, vacation_rules

MAX_TICK_HOURS = 12.0  # Nach längerem Ausfall (Update, Stromausfall) nicht "nachholen" bis zum Tod


class PetEngine:
    """Verbindet Regeln, Aktionen und Auswertungen. Hält den Zustand.

    Die Engine ist synchron und frei von I/O. Persistenz und Zeitgeber
    liegen außerhalb (Coordinator).
    """

    def __init__(
        self,
        state: PetState,
        cfg: GameConfig,
        rules: Iterable[Rule] | None = None,
        actions: PetActions | None = None,
    ) -> None:
        self.state = state
        self.cfg = cfg
        self._rules: list[Rule] = list(rules) if rules is not None else default_rules()
        self._vacation_rules: list[Rule] = vacation_rules(self._rules)
        self._actions = actions or PetActions(cfg)
        self._mood = MoodEvaluator()
        self._outfit = OutfitResolver()
        self._stress = StressEvaluator()
        self._last_world: WorldContext | None = None

    # ------------------------------------------------------------------ Zeit

    def tick(self, world: WorldContext) -> list[GameEvent]:
        """Einen Zeitschritt bis ``world.now`` rechnen."""
        s = self.state
        dt_hours = max(0.0, (world.now - s.last_tick).total_seconds() / 3600)
        dt_hours = min(dt_hours, MAX_TICK_HOURS)
        ctx = TickContext(state=s, world=world, cfg=self.cfg, dt_hours=dt_hours)
        # Im Urlaub läuft nur die Teilmenge; last_tick zieht trotzdem mit, damit nach
        # dem Urlaub nichts "nachgeholt" wird: eingefroren, nicht aufgeschoben.
        for rule in self._vacation_rules if s.vacation else self._rules:
            rule.apply(ctx)
        s.last_tick = world.now
        self._derive(world, ctx.events)
        self._last_world = world
        return ctx.events

    # ------------------------------------------------------------------ Aktionen

    def act(self, action: str, world: WorldContext, **kwargs: Any) -> list[GameEvent]:
        """Aktion per Name ausführen - die Service-Schicht bleibt so generisch."""
        handler: Callable[..., list[GameEvent]] = getattr(self._actions, action)
        events = handler(self.state, world, **kwargs)
        self._derive(world, events)
        self._last_world = world
        return events

    def feed(self, world: WorldContext, meal: Meal = Meal.MEAL, user: str | None = None) -> list[GameEvent]:
        return self.act("feed", world, meal=meal, user=user)

    def play(self, world: WorldContext, user: str | None = None) -> list[GameEvent]:
        return self.act("play", world, user=user)

    # ------------------------------------------------------------------ Ableitungen

    def _derive(self, world: WorldContext, events: list[GameEvent]) -> None:
        s = self.state
        new_mood = self._mood.evaluate(s, world, self.cfg)
        if new_mood != s.mood:
            events.append(GameEvent("mood_changed", {"from": str(s.mood), "to": str(new_mood)}))
            s.mood = new_mood
        s.outfit = self._outfit.resolve(s, world, self.cfg)
        if s.fainted:
            s.activity = Activity.FAINTED
        elif s.sleeping:
            s.activity = Activity.SLEEPING
        elif s.activity in (Activity.SLEEPING, Activity.FAINTED):
            s.activity = Activity.IDLE
        elif s.is_sick and s.activity is Activity.IDLE:
            s.activity = Activity.SICK

    # ------------------------------------------------------------------ Ausgabe

    def needs_attention(self, world: WorldContext | None = None) -> bool:
        s, cfg = self.state, self.cfg
        w = world or self._last_world
        if s.vacation:
            return s.fainted
        in_window = bool(w and cfg.in_feeding_window(w.local_now.time()))
        return bool(
            s.fainted
            or s.is_sick
            or s.poop_count > 0
            or s.hunger < cfg.hungry_threshold
            or (in_window and not s.sleeping and s.hunger < 70)
        )

    def snapshot(self, world: WorldContext | None = None) -> dict[str, Any]:
        """Kompakte Sicht für die Card (ein einziges Entity-Attributset)."""
        s, cfg = self.state, self.cfg
        w = world or self._last_world
        data: dict[str, Any] = {
            "name": s.name,
            "generation": s.generation,
            "stage": str(s.stage),
            "mood": str(s.mood),
            "activity": str(s.activity),
            "outfit": s.outfit.as_dict(),
            "hunger": round(s.hunger),
            "happiness": round(s.happiness),
            "energy": round(s.energy),
            "health": round(s.health),
            "care_score": round(s.care_score),
            "sleeping": s.sleeping,
            "sick": s.is_sick,
            "fainted": s.fainted,
            "poop_count": s.poop_count,
            "builds": [b.as_dict() for b in s.builds],
            "next_build_at": s.build_due_at.isoformat() if s.build_due_at else None,
            "needs_attention": self.needs_attention(w),
            "total_feeds": s.total_feeds,
            "total_plays": s.total_plays,
            "feeds_by_user": dict(s.feeds_by_user),
            "last_fed": s.last_fed.isoformat() if s.last_fed else None,
            "mood_override": str(s.mood_override) if s.mood_override else None,
            "animations_enabled": s.animations_enabled,
            "vacation": s.vacation,
        }
        if w is not None:
            data.update(
                {
                    "age_days": s.age_days(w.now),
                    "weather": str(w.weather),
                    "temperature": w.temperature,
                    "appointments_24h": w.appointments_24h,
                    "stress_level": self._stress.evaluate(w, cfg),
                    "persons_home": w.persons_home,
                    "media_playing": w.media_playing,
                    "is_night": cfg.is_night(w.local_now.time()),
                    "is_weekend": w.is_weekend,
                    "feeding_window": cfg.in_feeding_window(w.local_now.time()) is not None,
                    "next_event_title": w.next_event.title if w.next_event else None,
                    "next_event_in_minutes": (
                        int((w.next_event.start - w.now).total_seconds() // 60) if w.next_event else None
                    ),
                }
            )
        return data


__all__ = ["MAX_TICK_HOURS", "Mood", "PetEngine"]
