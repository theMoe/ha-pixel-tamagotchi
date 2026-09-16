"""Sensoren: Bedürfnisse, Stufe, Aktivität, Outfit und der Status-Sammelsensor für die Card."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorEntityDescription, SensorStateClass
from homeassistant.const import PERCENTAGE, EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry
from .entity import PixelEntity

Snapshot = dict[str, Any]


@dataclass(frozen=True, kw_only=True)
class PixelSensorDescription(SensorEntityDescription):
    value_fn: Callable[[Snapshot], Any]
    attributes_fn: Callable[[Snapshot], dict[str, Any]] | None = None


def _need(key: str, icon: str) -> PixelSensorDescription:
    return PixelSensorDescription(
        key=key,
        translation_key=key,
        icon=icon,
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda s: s.get(key),
    )


SENSORS: tuple[PixelSensorDescription, ...] = (
    _need("hunger", "mdi:food-apple"),
    _need("happiness", "mdi:emoticon-happy-outline"),
    _need("energy", "mdi:battery-heart-variant"),
    _need("health", "mdi:heart-pulse"),
    PixelSensorDescription(
        key="care_score",
        translation_key="care_score",
        icon="mdi:hand-heart",
        native_unit_of_measurement=PERCENTAGE,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda s: s.get("care_score"),
    ),
    PixelSensorDescription(
        key="age",
        translation_key="age",
        icon="mdi:cake-variant",
        native_unit_of_measurement="d",
        value_fn=lambda s: s.get("age_days"),
    ),
    PixelSensorDescription(
        key="stage",
        translation_key="stage",
        icon="mdi:egg",
        device_class=SensorDeviceClass.ENUM,
        options=["egg", "baby", "child", "teen", "adult", "senior"],
        value_fn=lambda s: s.get("stage"),
    ),
    PixelSensorDescription(
        key="activity",
        translation_key="activity",
        icon="mdi:run",
        device_class=SensorDeviceClass.ENUM,
        options=["idle", "sleeping", "eating", "playing", "building", "sick", "fainted"],
        value_fn=lambda s: s.get("activity"),
    ),
    PixelSensorDescription(
        key="outfit",
        translation_key="outfit",
        icon="mdi:sunglasses",
        value_fn=lambda s: ", ".join(v for v in (s.get("outfit") or {}).values() if v) or "none",
        attributes_fn=lambda s: dict(s.get("outfit") or {}),
    ),
    PixelSensorDescription(
        key="builds",
        translation_key="builds",
        icon="mdi:home-plus-outline",
        value_fn=lambda s: len(s.get("builds") or []),
        attributes_fn=lambda s: {"items": s.get("builds") or []},
    ),
    PixelSensorDescription(
        key="stress_level",
        translation_key="stress_level",
        icon="mdi:calendar-alert",
        value_fn=lambda s: s.get("stress_level"),
        attributes_fn=lambda s: {
            "appointments_24h": s.get("appointments_24h"),
            "next_event_title": s.get("next_event_title"),
            "next_event_in_minutes": s.get("next_event_in_minutes"),
        },
    ),
    PixelSensorDescription(
        key="status",
        translation_key="status",
        icon="mdi:ghost",
        value_fn=lambda s: s.get("mood"),
        attributes_fn=lambda s: dict(s),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(PixelSensor(entry.runtime_data, d) for d in SENSORS)


class PixelSensor(PixelEntity, SensorEntity):
    entity_description: PixelSensorDescription

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self.snapshot)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        fn = self.entity_description.attributes_fn
        return fn(self.snapshot) if fn else None
