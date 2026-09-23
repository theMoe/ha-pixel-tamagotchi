"""Pixel - ein Tamagotchi, das auf dem Home-Assistant-Dashboard lebt."""

from __future__ import annotations

import logging

from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .coordinator import PixelConfigEntry, PixelCoordinator
from .frontend import async_register_frontend
from .services import async_register_services
from .settings import PixelSettings
from .store import PetStore
from .websocket import async_register_websocket

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SELECT,
    Platform.SWITCH,
    Platform.BUTTON,
]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Domain-weite Einrichtung: Services, Card-Auslieferung und Event-Abo der Card."""
    async_register_services(hass)
    async_register_websocket(hass)
    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PixelConfigEntry) -> bool:
    coordinator = PixelCoordinator(hass, entry)
    await coordinator.async_setup()
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    _LOGGER.info("%s ist geschlüpft (Generation %s)", coordinator.state.name, coordinator.state.generation)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PixelConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.async_shutdown()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: PixelConfigEntry) -> None:
    """Integration gelöscht → gespeicherten Zustand mitnehmen."""
    await PetStore(hass, entry.entry_id).async_remove()


async def _async_options_updated(hass: HomeAssistant, entry: PixelConfigEntry) -> None:
    """Optionen geändert: Engine-Konfiguration ohne Neustart übernehmen."""
    entry.runtime_data.apply_settings(PixelSettings.from_entry(entry))
    await entry.runtime_data.async_request_refresh()


__all__ = ["DOMAIN"]
