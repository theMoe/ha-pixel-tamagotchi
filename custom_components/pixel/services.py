"""Domain-Services (``pixel.feed`` usw.).

Alle Services haben dasselbe Muster: Coordinator ermitteln, Aktion delegieren.
Neue Services werden nur in ``_SERVICE_TABLE`` ergänzt.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_CONFIG_ENTRY,
    ATTR_DURATION,
    ATTR_MEAL,
    ATTR_MINUTES,
    ATTR_MOOD,
    ATTR_NAME,
    ATTR_TEXT,
    ATTR_TRICK,
    DOMAIN,
    SERVICE_CLEAN,
    SERVICE_FEED,
    SERVICE_MEDICINE,
    SERVICE_PET,
    SERVICE_PLAY,
    SERVICE_RESET,
    SERVICE_SAY,
    SERVICE_SET_MOOD,
    SERVICE_SLEEP,
    SERVICE_TRICK,
    SERVICE_WAKE,
)
from .coordinator import PixelCoordinator
from .engine import Meal, Mood

Handler = Callable[[PixelCoordinator, ServiceCall], Awaitable[None]]

_BASE = {vol.Optional(ATTR_CONFIG_ENTRY): cv.string}


@dataclass(frozen=True)
class ServiceSpec:
    name: str
    schema: vol.Schema
    handler: Handler


async def _feed(c: PixelCoordinator, call: ServiceCall) -> None:
    await c.async_act("feed", meal=Meal(call.data.get(ATTR_MEAL, Meal.MEAL)), user=await _user_name(c, call))


async def _play(c: PixelCoordinator, call: ServiceCall) -> None:
    await c.async_act("play", user=await _user_name(c, call))


async def _set_mood(c: PixelCoordinator, call: ServiceCall) -> None:
    raw = call.data.get(ATTR_MOOD)
    mood = Mood(raw) if raw and raw != "auto" else None
    await c.async_act("set_mood", mood=mood, minutes=call.data.get(ATTR_MINUTES))


async def _say(c: PixelCoordinator, call: ServiceCall) -> None:
    c.fire_card_event("say", text=call.data[ATTR_TEXT], duration=call.data.get(ATTR_DURATION, 4))


async def _trick(c: PixelCoordinator, call: ServiceCall) -> None:
    c.fire_card_event("trick", trick=call.data.get(ATTR_TRICK, "random"))


async def _reset(c: PixelCoordinator, call: ServiceCall) -> None:
    await c.async_act("reset", name=call.data.get(ATTR_NAME))


def _table() -> list[ServiceSpec]:
    return [
        ServiceSpec(
            SERVICE_FEED,
            vol.Schema({**_BASE, vol.Optional(ATTR_MEAL, default=str(Meal.MEAL)): vol.In([str(m) for m in Meal])}),
            _feed,
        ),
        ServiceSpec(SERVICE_PLAY, vol.Schema(_BASE), _play),
        ServiceSpec(SERVICE_PET, vol.Schema(_BASE), _make_simple("pet")),
        ServiceSpec(SERVICE_CLEAN, vol.Schema(_BASE), _make_simple("clean")),
        ServiceSpec(SERVICE_MEDICINE, vol.Schema(_BASE), _make_simple("medicine")),
        ServiceSpec(SERVICE_SLEEP, vol.Schema(_BASE), _make_simple("sleep")),
        ServiceSpec(SERVICE_WAKE, vol.Schema(_BASE), _make_simple("wake")),
        ServiceSpec(
            SERVICE_SET_MOOD,
            vol.Schema(
                {
                    **_BASE,
                    vol.Required(ATTR_MOOD): vol.In([*(str(m) for m in Mood), "auto"]),
                    vol.Optional(ATTR_MINUTES): vol.All(vol.Coerce(int), vol.Range(min=1, max=1440)),
                }
            ),
            _set_mood,
        ),
        ServiceSpec(
            SERVICE_SAY,
            vol.Schema(
                {
                    **_BASE,
                    vol.Required(ATTR_TEXT): cv.string,
                    vol.Optional(ATTR_DURATION, default=4): vol.All(vol.Coerce(int), vol.Range(min=1, max=60)),
                }
            ),
            _say,
        ),
        ServiceSpec(
            SERVICE_TRICK, vol.Schema({**_BASE, vol.Optional(ATTR_TRICK, default="random"): cv.string}), _trick
        ),
        ServiceSpec(SERVICE_RESET, vol.Schema({**_BASE, vol.Optional(ATTR_NAME): cv.string}), _reset),
    ]


def _make_simple(action: str) -> Handler:
    async def handler(c: PixelCoordinator, call: ServiceCall) -> None:
        await c.async_act(action)

    return handler


def async_register_services(hass: HomeAssistant) -> None:
    """Services einmalig registrieren (Aufruf aus ``async_setup``)."""
    if hass.services.has_service(DOMAIN, SERVICE_FEED):
        return

    for spec in _table():

        def _bind(handler: Handler) -> Callable[[ServiceCall], Awaitable[None]]:
            async def service(call: ServiceCall) -> None:
                await handler(_resolve_coordinator(hass, call), call)

            return service

        hass.services.async_register(DOMAIN, spec.name, _bind(spec.handler), schema=spec.schema)


def _resolve_coordinator(hass: HomeAssistant, call: ServiceCall) -> PixelCoordinator:
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if hasattr(e, "runtime_data") and e.runtime_data]
    if not entries:
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="no_pet")
    wanted = call.data.get(ATTR_CONFIG_ENTRY)
    if wanted:
        for entry in entries:
            if entry.entry_id == wanted:
                return entry.runtime_data
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="unknown_entry")
    return entries[0].runtime_data


async def _user_name(c: PixelCoordinator, call: ServiceCall) -> str | None:
    """Wer hat gefüttert? Für die Familienstatistik."""
    if not call.context.user_id:
        return None
    user = await c.hass.auth.async_get_user(call.context.user_id)
    return user.name if user else None
