"""Binäre Sensoren: braucht Aufmerksamkeit, krank, Häufchen, schläft, ohnmächtig."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry
from .entity import PixelEntity


@dataclass(frozen=True, kw_only=True)
class PixelBinarySensorDescription(BinarySensorEntityDescription):
    is_on_fn: Callable[[dict[str, Any]], bool]


BINARY_SENSORS: tuple[PixelBinarySensorDescription, ...] = (
    PixelBinarySensorDescription(
        key="needs_attention",
        translation_key="needs_attention",
        icon="mdi:bell-ring-outline",
        device_class=BinarySensorDeviceClass.PROBLEM,
        is_on_fn=lambda s: bool(s.get("needs_attention")),
    ),
    PixelBinarySensorDescription(
        key="sick",
        translation_key="sick",
        icon="mdi:thermometer-alert",
        device_class=BinarySensorDeviceClass.PROBLEM,
        is_on_fn=lambda s: bool(s.get("sick")),
    ),
    PixelBinarySensorDescription(
        key="poop",
        translation_key="poop",
        icon="mdi:emoticon-poop",
        is_on_fn=lambda s: (s.get("poop_count") or 0) > 0,
    ),
    PixelBinarySensorDescription(
        key="sleeping",
        translation_key="sleeping",
        icon="mdi:sleep",
        is_on_fn=lambda s: bool(s.get("sleeping")),
    ),
    PixelBinarySensorDescription(
        key="fainted",
        translation_key="fainted",
        icon="mdi:emoticon-dead-outline",
        device_class=BinarySensorDeviceClass.SAFETY,
        is_on_fn=lambda s: bool(s.get("fainted")),
    ),
    PixelBinarySensorDescription(
        key="feeding_window",
        translation_key="feeding_window",
        icon="mdi:silverware-fork-knife",
        is_on_fn=lambda s: bool(s.get("feeding_window")),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(PixelBinarySensor(entry.runtime_data, d) for d in BINARY_SENSORS)


class PixelBinarySensor(PixelEntity, BinarySensorEntity):
    entity_description: PixelBinarySensorDescription

    @property
    def is_on(self) -> bool:
        return self.entity_description.is_on_fn(self.snapshot)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.key == "poop":
            return {"count": self.snapshot.get("poop_count", 0)}
        return None
