"""Gemeinsame Fixtures für Engine-Tests."""

from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

# Engine direkt importierbar machen, ohne homeassistant zu installieren.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "custom_components" / "pixel"))

from engine import GameConfig, PetEngine, PetState, WeatherKind, WorldContext  # noqa: E402

BERLIN = timezone(timedelta(hours=2))


def make_world(
    now: datetime | None = None,
    hour: int = 10,
    weather: WeatherKind = WeatherKind.CLOUDY,
    **kwargs,
) -> WorldContext:
    """Weltkontext an einem festen Werktag (Mi, 15.04.2026) zur angegebenen Stunde."""
    if now is None:
        local = datetime(2026, 4, 15, hour, 0, tzinfo=BERLIN)
        now = local.astimezone(UTC)
    local_now = now.astimezone(BERLIN)
    return WorldContext(now=now, local_now=local_now, weather=weather, **kwargs)


def advance(world: WorldContext, **delta) -> WorldContext:
    """Neuer Kontext, um ``delta`` in der Zeit versetzt."""
    now = world.now + timedelta(**delta)
    return WorldContext(
        now=now,
        local_now=now.astimezone(BERLIN),
        weather=world.weather,
        temperature=world.temperature,
        appointments_24h=world.appointments_24h,
        next_event=world.next_event,
        persons_home=world.persons_home,
        media_playing=world.media_playing,
    )


@pytest.fixture
def cfg() -> GameConfig:
    return GameConfig()


@pytest.fixture
def world() -> WorldContext:
    return make_world()


@pytest.fixture
def engine(cfg, world) -> PetEngine:
    state = PetState(born_at=world.now, last_tick=world.now)
    return PetEngine(state, cfg)
