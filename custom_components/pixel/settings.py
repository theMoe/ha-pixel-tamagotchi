"""Übersetzt Config-Entry-Daten in Engine-Konfiguration und Adapter-Einstellungen."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import time

from homeassistant.config_entries import ConfigEntry

from .const import (
    CONF_CALENDAR_ENTITIES,
    CONF_DECAY_SPEED,
    CONF_FEEDING_WINDOWS,
    CONF_HARDCORE,
    CONF_MEDIA_PLAYERS,
    CONF_NAME,
    CONF_NIGHT_END,
    CONF_NIGHT_START,
    CONF_PRESENCE_ENTITY,
    CONF_WEATHER_ENTITY,
    DEFAULT_DECAY_SPEED,
    DEFAULT_FEEDING_WINDOWS,
    DEFAULT_NAME,
    DEFAULT_NIGHT_END,
    DEFAULT_NIGHT_START,
    DEFAULT_PRESENCE_ENTITY,
)
from .engine import FeedingWindow, GameConfig


@dataclass(frozen=True)
class PixelSettings:
    """Alles, was die HA-Schicht aus dem Config-Entry braucht."""

    name: str
    weather_entity: str | None
    calendar_entities: tuple[str, ...]
    media_players: tuple[str, ...]
    presence_entity: str | None
    game: GameConfig

    @classmethod
    def from_entry(cls, entry: ConfigEntry) -> PixelSettings:
        merged = {**entry.data, **entry.options}
        speed = float(merged.get(CONF_DECAY_SPEED, DEFAULT_DECAY_SPEED))
        base = GameConfig()
        game = replace(
            base,
            hunger_decay=base.hunger_decay * speed,
            happiness_decay=base.happiness_decay * speed,
            energy_decay=base.energy_decay * speed,
            feeding_windows=parse_feeding_windows(merged.get(CONF_FEEDING_WINDOWS, DEFAULT_FEEDING_WINDOWS)),
            night_start=parse_time(merged.get(CONF_NIGHT_START, DEFAULT_NIGHT_START)),
            night_end=parse_time(merged.get(CONF_NIGHT_END, DEFAULT_NIGHT_END)),
            hardcore=bool(merged.get(CONF_HARDCORE, False)),
        )
        return cls(
            name=merged.get(CONF_NAME, DEFAULT_NAME),
            weather_entity=merged.get(CONF_WEATHER_ENTITY) or None,
            calendar_entities=tuple(merged.get(CONF_CALENDAR_ENTITIES) or ()),
            media_players=tuple(merged.get(CONF_MEDIA_PLAYERS) or ()),
            presence_entity=merged.get(CONF_PRESENCE_ENTITY, DEFAULT_PRESENCE_ENTITY) or None,
            game=game,
        )


def parse_time(value: str | time) -> time:
    if isinstance(value, time):
        return value
    return time.fromisoformat(value)


def parse_feeding_windows(value: str) -> tuple[FeedingWindow, ...]:
    """'07:00-09:00, 12:00-14:00' → FeedingWindows. Ungültige Teile werden ignoriert."""
    windows: list[FeedingWindow] = []
    for part in value.split(","):
        part = part.strip()
        if not part or "-" not in part:
            continue
        start_s, end_s = (p.strip() for p in part.split("-", 1))
        try:
            windows.append(FeedingWindow(time.fromisoformat(start_s), time.fromisoformat(end_s)))
        except ValueError:
            continue
    return tuple(windows)


def validate_feeding_windows(value: str) -> bool:
    """Für den Config-Flow: mindestens ein gültiges Fenster und keine ungültigen Teile."""
    parts = [p for p in (x.strip() for x in value.split(",")) if p]
    return bool(parts) and len(parse_feeding_windows(value)) == len(parts)
