"""Switch: Animationen auf der Card an/aus (z. B. wenn niemand vor dem Display steht)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry
from .entity import PixelEntity

ANIMATIONS = SwitchEntityDescription(
    key="animations_enabled",
    translation_key="animations_enabled",
    icon="mdi:animation-play",
    entity_category=EntityCategory.CONFIG,
)


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([PixelAnimationsSwitch(entry.runtime_data)])


class PixelAnimationsSwitch(PixelEntity, SwitchEntity):
    def __init__(self, coordinator) -> None:  # noqa: ANN001
        super().__init__(coordinator, ANIMATIONS)

    @property
    def is_on(self) -> bool:
        return bool(self.snapshot.get("animations_enabled", True))

    async def async_turn_on(self, **kwargs: Any) -> None:
        self.coordinator.set_animations_enabled(True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        self.coordinator.set_animations_enabled(False)
