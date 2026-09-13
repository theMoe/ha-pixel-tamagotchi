"""Spielkonfiguration - alle Balancing-Zahlen an einem Ort."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time

from .models import Meal, Stage


@dataclass(frozen=True)
class FeedingWindow:
    """Zeitfenster, in dem das Tier gefüttert werden möchte (lokale Zeit)."""

    start: time
    end: time

    def contains(self, t: time) -> bool:
        if self.start <= self.end:
            return self.start <= t <= self.end
        return t >= self.start or t <= self.end  # über Mitternacht


@dataclass(frozen=True)
class GameConfig:
    """Balancing und Nutzeroptionen. Werte pro Stunde, außer wo angegeben."""

    # Verfall pro Stunde
    hunger_decay: float = 4.0
    happiness_decay: float = 2.0
    energy_decay: float = 3.0
    energy_regen_sleeping: float = 12.0
    health_regen: float = 3.0
    health_damage_hungry: float = 6.0
    health_damage_poop: float = 2.0
    happiness_extra_decay_stressed: float = 2.0
    happiness_extra_decay_lonely: float = 1.5

    # Schwellen
    hungry_threshold: float = 30.0
    starving_threshold: float = 15.0
    sick_threshold: float = 30.0
    recovered_threshold: float = 50.0
    low_energy_threshold: float = 15.0
    rested_threshold: float = 60.0
    lonely_happiness_threshold: float = 40.0
    bored_after_hours: float = 6.0
    stress_busy_appointments: int = 3
    stress_high_appointments: int = 6
    empty_house_slowdown_after_hours: float = 4.0
    empty_house_decay_factor: float = 0.5

    # Mahlzeiten: (Hunger, Laune)
    meal_values: dict[Meal, tuple[float, float]] = field(
        default_factory=lambda: {
            Meal.SNACK: (15.0, 2.0),
            Meal.MEAL: (35.0, 5.0),
            Meal.TREAT: (10.0, 15.0),
        }
    )
    max_treats_per_day: int = 3
    overfed_threshold: float = 95.0
    poop_delay_minutes: int = 120

    # Aktionen
    play_happiness: float = 25.0
    play_energy_cost: float = 8.0
    play_min_energy: float = 20.0
    pet_happiness: float = 5.0
    clean_happiness: float = 5.0
    medicine_health: float = 45.0
    medicine_refused_happiness_penalty: float = 5.0
    eating_seconds: int = 20
    playing_seconds: int = 15
    mood_override_minutes: int = 30

    # Stufen: Mindestalter in Tagen bei durchschnittlicher Pflege
    stage_days: dict[Stage, int] = field(
        default_factory=lambda: {
            Stage.EGG: 0,
            Stage.BABY: 1,
            Stage.CHILD: 4,
            Stage.TEEN: 11,
            Stage.ADULT: 25,
            Stage.SENIOR: 90,
        }
    )
    # Gute Pflege beschleunigt bis zu 30 %, schlechte verzögert bis zu 50 %
    care_speed_bonus: float = 0.3
    care_speed_penalty: float = 0.5

    # Termin-Erinnerung
    appointment_warn_minutes: int = 15

    # Nutzeroptionen
    feeding_windows: tuple[FeedingWindow, ...] = (
        FeedingWindow(time(7, 0), time(9, 0)),
        FeedingWindow(time(12, 0), time(14, 0)),
        FeedingWindow(time(18, 0), time(20, 0)),
    )
    night_start: time = time(22, 0)
    night_end: time = time(6, 30)
    hardcore: bool = False

    def is_night(self, t: time) -> bool:
        return FeedingWindow(self.night_start, self.night_end).contains(t)

    def in_feeding_window(self, t: time) -> FeedingWindow | None:
        for window in self.feeding_windows:
            if window.contains(t):
                return window
        return None


__all__ = ["FeedingWindow", "GameConfig"]
