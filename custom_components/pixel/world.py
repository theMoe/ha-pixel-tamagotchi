"""Adapter, der aus Home-Assistant-Zuständen einen ``WorldContext`` baut.

Nur dieses Modul weiß, wie HA Wetter, Kalender und Anwesenheit darstellt.
Die Engine bekommt ausschließlich das neutrale ``WorldContext``-Objekt.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.const import STATE_PLAYING, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .engine import CalendarEvent, WeatherKind, WorldContext
from .settings import PixelSettings

_LOGGER = logging.getLogger(__name__)

_WEATHER_MAP: dict[str, WeatherKind] = {
    "sunny": WeatherKind.SUNNY,
    "clear": WeatherKind.SUNNY,
    "partlycloudy": WeatherKind.PARTLY_CLOUDY,
    "cloudy": WeatherKind.CLOUDY,
    "rainy": WeatherKind.RAINY,
    "pouring": WeatherKind.POURING,
    "hail": WeatherKind.POURING,
    "snowy": WeatherKind.SNOWY,
    "snowy-rainy": WeatherKind.SNOWY,
    "windy": WeatherKind.WINDY,
    "windy-variant": WeatherKind.WINDY,
    "lightning": WeatherKind.LIGHTNING,
    "lightning-rainy": WeatherKind.LIGHTNING,
    "fog": WeatherKind.FOGGY,
    "clear-night": WeatherKind.CLEAR_NIGHT,
    "exceptional": WeatherKind.UNKNOWN,
}

_CALENDAR_CACHE_TTL = timedelta(minutes=5)


class WorldAdapter:
    """Liest die Welt aus HA. Kalenderabfragen werden gedrosselt."""

    def __init__(self, hass: HomeAssistant, settings: PixelSettings) -> None:
        self._hass = hass
        self._settings = settings
        self._calendar_cache: tuple[datetime, list[CalendarEvent]] | None = None
        self._last_persons_home: int | None = None

    def update_settings(self, settings: PixelSettings) -> None:
        self._settings = settings
        self._calendar_cache = None

    async def build(self) -> WorldContext:
        now = dt_util.utcnow()
        events = await self._upcoming_events(now)
        persons_home = self._persons_home()
        arrived = (
            self._last_persons_home is not None and persons_home is not None and persons_home > self._last_persons_home
        )
        self._last_persons_home = persons_home
        weather, temperature = self._weather()
        return WorldContext(
            now=now,
            local_now=dt_util.as_local(now),
            weather=weather,
            temperature=temperature,
            appointments_24h=len(events),
            next_event=next((e for e in events if e.start >= now), None),
            persons_home=persons_home,
            media_playing=self._media_playing(),
            person_arrived=arrived,
        )

    # ------------------------------------------------------------------ Wetter

    def _weather(self) -> tuple[WeatherKind, float | None]:
        entity_id = self._settings.weather_entity
        if not entity_id:
            return WeatherKind.UNKNOWN, None
        state = self._hass.states.get(entity_id)
        if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            return WeatherKind.UNKNOWN, None
        kind = _WEATHER_MAP.get(state.state, WeatherKind.UNKNOWN)
        temperature = _as_float(state.attributes.get("temperature"))
        return kind, temperature

    # ------------------------------------------------------------------ Anwesenheit

    def _persons_home(self) -> int | None:
        entity_id = self._settings.presence_entity
        if not entity_id:
            return None
        state = self._hass.states.get(entity_id)
        if state is None or state.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
            return None
        if entity_id.startswith("zone."):
            value = _as_float(state.state)
            return int(value) if value is not None else None
        # Alternativ: ein group/binary_sensor "jemand zuhause"
        return 1 if state.state in ("on", "home") else 0

    # ------------------------------------------------------------------ Medien

    def _media_playing(self) -> bool:
        for entity_id in self._settings.media_players:
            state = self._hass.states.get(entity_id)
            if state is not None and state.state == STATE_PLAYING:
                return True
        return False

    # ------------------------------------------------------------------ Kalender

    async def _upcoming_events(self, now: datetime) -> list[CalendarEvent]:
        if not self._settings.calendar_entities:
            return []
        if self._calendar_cache and now - self._calendar_cache[0] < _CALENDAR_CACHE_TTL:
            return [e for e in self._calendar_cache[1] if e.start >= now - timedelta(minutes=1) or e.all_day]
        try:
            response = await self._hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": list(self._settings.calendar_entities),
                    "start_date_time": now.isoformat(),
                    "duration": {"hours": 24},
                },
                blocking=True,
                return_response=True,
            )
        except Exception as err:
            _LOGGER.debug("Kalenderabfrage fehlgeschlagen: %s", err)
            return self._calendar_cache[1] if self._calendar_cache else []

        events = sorted(_parse_calendar_response(response or {}), key=lambda e: e.start)
        self._calendar_cache = (now, events)
        return events


def _parse_calendar_response(response: dict[str, Any]) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    for entity_id, payload in response.items():
        for raw in payload.get("events", []):
            start_raw = raw.get("start")
            if not start_raw:
                continue
            all_day = "T" not in str(start_raw)
            start = dt_util.parse_datetime(str(start_raw)) if not all_day else None
            if all_day:
                day = dt_util.parse_date(str(start_raw))
                if day is None:
                    continue
                start = dt_util.start_of_local_day(day)
            if start is None:
                continue
            start = dt_util.as_utc(start)
            title = raw.get("summary") or "Termin"
            uid = raw.get("uid") or f"{entity_id}:{title}:{start.isoformat()}"
            events.append(CalendarEvent(uid=str(uid), title=str(title), start=start, all_day=all_day))
    return events


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
