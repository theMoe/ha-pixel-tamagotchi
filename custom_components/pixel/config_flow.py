"""Config-Flow: Ersteinrichtung und Optionen."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

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
    DOMAIN,
)
from .settings import validate_feeding_windows


def _world_schema(defaults: dict[str, Any]) -> vol.Schema:
    """Welche HA-Entities das Tier wahrnimmt."""
    return vol.Schema(
        {
            vol.Optional(CONF_WEATHER_ENTITY, default=defaults.get(CONF_WEATHER_ENTITY, vol.UNDEFINED)): (
                selector.EntitySelector(selector.EntitySelectorConfig(domain="weather"))
            ),
            vol.Optional(CONF_CALENDAR_ENTITIES, default=defaults.get(CONF_CALENDAR_ENTITIES, [])): (
                selector.EntitySelector(selector.EntitySelectorConfig(domain="calendar", multiple=True))
            ),
            vol.Optional(CONF_MEDIA_PLAYERS, default=defaults.get(CONF_MEDIA_PLAYERS, [])): (
                selector.EntitySelector(selector.EntitySelectorConfig(domain="media_player", multiple=True))
            ),
            vol.Optional(CONF_PRESENCE_ENTITY, default=defaults.get(CONF_PRESENCE_ENTITY, DEFAULT_PRESENCE_ENTITY)): (
                selector.EntitySelector(
                    selector.EntitySelectorConfig(domain=["zone", "binary_sensor", "group", "input_boolean"])
                )
            ),
        }
    )


def _game_schema(defaults: dict[str, Any]) -> vol.Schema:
    """Spielregeln, die der Nutzer beeinflussen darf."""
    return vol.Schema(
        {
            vol.Required(CONF_FEEDING_WINDOWS, default=defaults.get(CONF_FEEDING_WINDOWS, DEFAULT_FEEDING_WINDOWS)): (
                selector.TextSelector()
            ),
            vol.Required(CONF_NIGHT_START, default=defaults.get(CONF_NIGHT_START, DEFAULT_NIGHT_START)): (
                selector.TimeSelector()
            ),
            vol.Required(CONF_NIGHT_END, default=defaults.get(CONF_NIGHT_END, DEFAULT_NIGHT_END)): (
                selector.TimeSelector()
            ),
            vol.Required(CONF_DECAY_SPEED, default=defaults.get(CONF_DECAY_SPEED, DEFAULT_DECAY_SPEED)): (
                selector.NumberSelector(
                    selector.NumberSelectorConfig(min=0.25, max=3.0, step=0.25, mode=selector.NumberSelectorMode.SLIDER)
                )
            ),
            vol.Required(CONF_HARDCORE, default=defaults.get(CONF_HARDCORE, False)): selector.BooleanSelector(),
        }
    )


def _validate_game(user_input: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    if not validate_feeding_windows(user_input.get(CONF_FEEDING_WINDOWS, "")):
        errors[CONF_FEEDING_WINDOWS] = "invalid_feeding_windows"
    return errors


class PixelConfigFlow(ConfigFlow, domain=DOMAIN):
    """Dreischrittige Einrichtung: Name → Welt → Spielregeln."""

    VERSION = 1

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_world()
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required(CONF_NAME, default=DEFAULT_NAME): selector.TextSelector()}),
        )

    async def async_step_world(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._data.update(user_input)
            return await self.async_step_game()
        return self.async_show_form(step_id="world", data_schema=_world_schema(self._data))

    async def async_step_game(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate_game(user_input)
            if not errors:
                self._data.update(user_input)
                await self.async_set_unique_id(f"{DOMAIN}_{self._data[CONF_NAME].lower()}")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=self._data[CONF_NAME], data=self._data)
        return self.async_show_form(step_id="game", data_schema=_game_schema(self._data), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> PixelOptionsFlow:
        return PixelOptionsFlow()


class PixelOptionsFlow(OptionsFlow):
    """Nachträgliches Anpassen von Welt und Spielregeln."""

    def __init__(self) -> None:
        self._pending: dict[str, Any] = {}

    @property
    def _current(self) -> dict[str, Any]:
        return {**self.config_entry.data, **self.config_entry.options, **self._pending}

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._pending.update(user_input)
            return await self.async_step_game()
        return self.async_show_form(step_id="init", data_schema=_world_schema(self._current))

    async def async_step_game(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate_game(user_input)
            if not errors:
                self._pending.update(user_input)
                return self.async_create_entry(title="", data=self._pending)
        return self.async_show_form(step_id="game", data_schema=_game_schema(self._current), errors=errors)
