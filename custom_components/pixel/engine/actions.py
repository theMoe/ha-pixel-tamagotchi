"""Aktionen, die Menschen (oder Automationen) am Tier ausführen."""

from __future__ import annotations

from datetime import timedelta

from .config import GameConfig
from .models import Activity, GameEvent, Meal, Mood, PetState, WorldContext
from .rules import clamp


class ActionRefused(Exception):
    """Die Aktion ist im aktuellen Zustand nicht möglich (z. B. ohnmächtig)."""


class PetActions:
    """Jede Methode verändert den Zustand und liefert die ausgelösten Events."""

    def __init__(self, cfg: GameConfig) -> None:
        self._cfg = cfg

    # ------------------------------------------------------------------ Essen

    def feed(self, s: PetState, w: WorldContext, meal: Meal, user: str | None = None) -> list[GameEvent]:
        cfg = self._cfg
        if s.fainted and s.health <= 0:
            raise ActionRefused("fainted_needs_medicine")

        hunger_gain, happiness_gain = cfg.meal_values[meal]
        events: list[GameEvent] = []

        if meal is Meal.TREAT:
            s.treats_today += 1
            if s.treats_today > cfg.max_treats_per_day:
                s.health = clamp(s.health - 5)
                happiness_gain = 0
                events.append(GameEvent("tummy_ache", {"treats_today": s.treats_today}))

        s.hunger = clamp(s.hunger + hunger_gain)
        s.happiness = clamp(s.happiness + happiness_gain)
        s.last_fed = w.now
        s.last_interaction = w.now
        s.total_feeds += 1
        if user:
            s.feeds_by_user[user] = s.feeds_by_user.get(user, 0) + 1
        s.poop_due_at = w.now + timedelta(minutes=cfg.poop_delay_minutes)
        self._set_activity(s, w, Activity.EATING, cfg.eating_seconds)
        self._wake_if_needed(s)

        if s.fainted:
            s.fainted = False
            events.append(GameEvent("revived", {}))

        events.append(GameEvent("fed", {"meal": str(meal), "hunger": round(s.hunger), "user": user}))
        if s.hunger >= cfg.overfed_threshold:
            events.append(GameEvent("overfed", {"hunger": round(s.hunger)}))
        return events

    # ------------------------------------------------------------------ Spielen & Zuwendung

    def play(self, s: PetState, w: WorldContext, user: str | None = None) -> list[GameEvent]:
        cfg = self._cfg
        self._require_conscious(s)
        s.last_interaction = w.now
        if s.energy < cfg.play_min_energy:
            s.happiness = clamp(s.happiness + cfg.pet_happiness)
            return [GameEvent("too_tired", {"energy": round(s.energy)})]
        s.happiness = clamp(s.happiness + cfg.play_happiness)
        s.energy = clamp(s.energy - cfg.play_energy_cost)
        s.total_plays += 1
        self._wake_if_needed(s)
        self._set_activity(s, w, Activity.PLAYING, cfg.playing_seconds)
        return [GameEvent("played", {"happiness": round(s.happiness), "user": user})]

    def pet(self, s: PetState, w: WorldContext) -> list[GameEvent]:
        self._require_conscious(s)
        s.last_interaction = w.now
        if s.sleeping:
            return [GameEvent("grumbled", {})]
        s.happiness = clamp(s.happiness + self._cfg.pet_happiness)
        return [GameEvent("petted", {"happiness": round(s.happiness)})]

    # ------------------------------------------------------------------ Pflege

    def clean(self, s: PetState, w: WorldContext, count: int | None = None) -> list[GameEvent]:
        """Ohne ``count`` wird alles weggeputzt, sonst hoechstens so viele Haufen wie angegeben."""
        s.last_interaction = w.now
        if s.poop_count == 0:
            return [GameEvent("nothing_to_clean", {})]
        removed = s.poop_count if count is None else min(count, s.poop_count)
        s.poop_count -= removed
        # Bonus je Haufen, nicht pauschal: sonst waere dreimal einzeln putzen
        # dreimal so lohnend wie einmal alles auf einen Schlag.
        s.happiness = clamp(s.happiness + self._cfg.clean_happiness * removed)
        return [GameEvent("cleaned", {"removed": removed, "left": s.poop_count})]

    def remove_build(self, s: PetState, w: WorldContext, build_id: str | None = None) -> list[GameEvent]:
        """Ein gebautes Objekt abreißen. Ohne ``build_id`` das zuletzt gebaute.

        Idempotent: eine unbekannte Id ist kein Fehler, sondern ein erklärendes Event -
        zwei Geräte können dasselbe Objekt gleichzeitig antippen.
        """
        s.last_interaction = w.now
        if not s.builds:
            return [GameEvent("nothing_to_remove", {})]
        ziel = next((b for b in s.builds if b.id == build_id), None) if build_id else s.builds[-1]
        if ziel is None:
            return [GameEvent("nothing_to_remove", {"id": build_id})]
        s.builds.remove(ziel)
        s.happiness = clamp(s.happiness - self._cfg.remove_build_happiness_penalty)
        return [GameEvent("build_removed", {"id": ziel.id, "kind": ziel.kind, "left": len(s.builds)})]

    def medicine(self, s: PetState, w: WorldContext) -> list[GameEvent]:
        cfg = self._cfg
        s.last_interaction = w.now
        if not (s.is_sick or s.fainted):
            s.happiness = clamp(s.happiness - cfg.medicine_refused_happiness_penalty)
            return [GameEvent("medicine_refused", {})]
        s.health = max(s.health, cfg.medicine_health)
        s.sick_since = None
        events = [GameEvent("healed", {"health": round(s.health)})]
        if s.fainted:
            # Ohnmacht braucht Medizin *und* danach Futter; wir wecken nur auf.
            s.hunger = max(s.hunger, cfg.starving_threshold + 1)
            s.fainted = False
            events.append(GameEvent("revived", {}))
        return events

    # ------------------------------------------------------------------ Schlaf & Stimmung

    def sleep(self, s: PetState, w: WorldContext) -> list[GameEvent]:
        self._require_conscious(s)
        s.sleeping_manual = True
        s.sleeping = True
        return [GameEvent("fell_asleep", {"manual": True})]

    def wake(self, s: PetState, w: WorldContext) -> list[GameEvent]:
        s.sleeping_manual = False
        s.sleeping = False
        return [GameEvent("woke_up", {"manual": True})]

    def set_mood(self, s: PetState, w: WorldContext, mood: Mood | None, minutes: int | None = None) -> list[GameEvent]:
        if mood is None:
            s.mood_override = None
            s.mood_override_until = None
            return [GameEvent("mood_override_cleared", {})]
        s.mood_override = mood
        s.mood_override_until = w.now + timedelta(minutes=minutes or self._cfg.mood_override_minutes)
        return [GameEvent("mood_override", {"mood": str(mood), "minutes": minutes or self._cfg.mood_override_minutes})]

    def reset(self, s: PetState, w: WorldContext, name: str | None = None) -> list[GameEvent]:
        fresh = PetState(name=name or s.name, generation=s.generation + 1, born_at=w.now, last_tick=w.now)
        fresh.animations_enabled = s.animations_enabled
        for key, value in fresh.__dict__.items():
            setattr(s, key, value)
        return [GameEvent("hatched", {"generation": s.generation})]

    # ------------------------------------------------------------------ Hilfen

    @staticmethod
    def _require_conscious(s: PetState) -> None:
        if s.fainted:
            raise ActionRefused("fainted")

    @staticmethod
    def _wake_if_needed(s: PetState) -> None:
        if s.sleeping:
            s.sleeping = False
            s.sleeping_manual = False

    @staticmethod
    def _set_activity(s: PetState, w: WorldContext, activity: Activity, seconds: int) -> None:
        s.activity = activity
        s.activity_until = w.now + timedelta(seconds=seconds)


__all__ = ["ActionRefused", "PetActions"]
