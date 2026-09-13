"""Gemeinsame Basis aller Pixel-Entities."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import EntityDescription
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, VERSION
from .coordinator import PixelCoordinator


class PixelEntity(CoordinatorEntity[PixelCoordinator]):
    """Bindet eine Entity an den Coordinator und das virtuelle Gerät 'Pixel'."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: PixelCoordinator, description: EntityDescription) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.entry.entry_id)},
            name=coordinator.settings.name,
            manufacturer="theMoe",
            model="Dashboard-Tamagotchi",
            sw_version=VERSION,
        )

    @property
    def snapshot(self) -> dict[str, Any]:
        return self.coordinator.data or {}
