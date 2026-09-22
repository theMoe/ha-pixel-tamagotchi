"""Auswertungen, die aus Zustand + Welt abgeleitete Werte berechnen.

Stimmung und Outfit sind keine gespeicherten Bedürfnisse, sondern Ableitungen.
Sie werden nach jedem Tick und nach jeder Aktion neu berechnet.
"""

from __future__ import annotations

from datetime import datetime

from .config import GameConfig
from .models import Activity, Mood, Outfit, PetState, WeatherKind, WorldContext


class MoodEvaluator:
    """Ermittelt die Stimmung nach fester Priorität (siehe Konzept, Abschnitt 3.1)."""

    def evaluate(self, state: PetState, world: WorldContext, cfg: GameConfig) -> Mood:
        if state.mood_override is not None:
            return state.mood_override
        if state.fainted:
            return Mood.FAINTED
        if state.is_sick:
            return Mood.SICK
        if state.sleeping:
            return Mood.SLEEPING
        if state.vacation:
            return Mood.VACATION
        if state.hunger < cfg.hungry_threshold:
            return Mood.HUNGRY
        if world.appointments_24h >= cfg.stress_high_appointments:
            return Mood.STRESSED
        if (
            state.house_empty_since is not None
            and (world.now - state.house_empty_since).total_seconds() >= 4 * 3600
            and state.happiness < cfg.lonely_happiness_threshold
        ):
            return Mood.LONELY
        if world.person_arrived or state.activity is Activity.PLAYING:
            return Mood.EXCITED
        if world.appointments_24h >= cfg.stress_busy_appointments:
            return Mood.BUSY
        if _hours_since(state.last_interaction, world.now) >= cfg.bored_after_hours and not world.media_playing:
            return Mood.BORED
        return Mood.HAPPY


def _hours_since(then: datetime | None, now: datetime) -> float:
    if then is None:
        return float("inf")
    return (now - then).total_seconds() / 3600


class OutfitResolver:
    """Kleidung aus Wetter, Zeit, Terminen und Jahreszeit (Konzept 4.1, 4.2, 4.5)."""

    def resolve(self, state: PetState, world: WorldContext, cfg: GameConfig) -> Outfit:
        outfit = Outfit()
        if state.sleeping:
            outfit.hat = "sleep_cap"
            return outfit
        if state.fainted or state.is_sick:
            outfit.accessory = "thermometer"
            return outfit
        if state.vacation:
            outfit.hat = "sun_hat"
            outfit.item = "cocktail"
            return outfit

        self._apply_weather(outfit, world)
        self._apply_calendar(outfit, world, cfg)
        self._apply_season(outfit, world)
        return outfit

    @staticmethod
    def _apply_weather(outfit: Outfit, world: WorldContext) -> None:
        w, temp = world.weather, world.temperature
        if w in (WeatherKind.SUNNY, WeatherKind.PARTLY_CLOUDY):
            outfit.accessory = "sunglasses"
            if temp is not None and temp >= 26:
                outfit.item = "ice_cream"
            elif temp is not None and temp <= 8:
                outfit.accessory = "sunglasses"
                outfit.hat = "beanie"
        elif w in (WeatherKind.RAINY, WeatherKind.POURING):
            outfit.item = "umbrella"
        elif w is WeatherKind.SNOWY:
            outfit.hat = "beanie"
            outfit.accessory = "scarf"
        elif w is WeatherKind.WINDY:
            outfit.accessory = "scarf"
        elif w is WeatherKind.FOGGY:
            outfit.item = "lantern"
        elif w is WeatherKind.LIGHTNING:
            outfit.item = "umbrella"
        if temp is not None and temp <= 0 and not outfit.hat:
            outfit.hat = "beanie"

    @staticmethod
    def _apply_calendar(outfit: Outfit, world: WorldContext, cfg: GameConfig) -> None:
        if world.appointments_24h >= cfg.stress_high_appointments:
            outfit.item = outfit.item or "coffee"
        elif world.appointments_24h >= cfg.stress_busy_appointments:
            outfit.item = outfit.item or "clipboard"

    @staticmethod
    def _apply_season(outfit: Outfit, world: WorldContext) -> None:
        month, day = world.local_now.month, world.local_now.day
        if month == 12 and not outfit.hat:
            outfit.hat = "santa_hat"
        elif month == 10 and day >= 20 and not outfit.item:
            outfit.item = "pumpkin"
        elif month in (3, 4) and not outfit.hat and world.is_weekend:
            outfit.hat = "bunny_ears"


class StressEvaluator:
    """0 = entspannt, 1 = beschäftigt, 2 = gestresst."""

    def evaluate(self, world: WorldContext, cfg: GameConfig) -> int:
        if world.appointments_24h >= cfg.stress_high_appointments:
            return 2
        if world.appointments_24h >= cfg.stress_busy_appointments:
            return 1
        return 0


__all__ = ["MoodEvaluator", "OutfitResolver", "StressEvaluator"]
