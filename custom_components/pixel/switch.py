"""Switches: Animationen der Card an/aus, Urlaub an/aus.

Jeder Schalter ist eine Tabellenzeile: ``is_on_fn`` liest aus dem Snapshot,
``set_fn`` schreibt über den Coordinator (direkt oder als Engine-Aktion).
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry, PixelCoordinator
from .entity import PixelEntity


@dataclass(frozen=True, kw_only=True)
class PixelSwitchDescription(SwitchEntityDescription):
    is_on_fn: Callable[[dict[str, Any]], bool]
    set_fn: Callable[[PixelCoordinator, bool], Awaitable[None]]


async def _set_animations(coordinator: PixelCoordinator, enabled: bool) -> None:
    coordinator.set_animations_enabled(enabled)


async def _set_vacation(coordinator: PixelCoordinator, enabled: bool) -> None:
    await coordinator.async_act("set_vacation", enabled=enabled)


SWITCHES: tuple[PixelSwitchDescription, ...] = (
    PixelSwitchDescription(
        key="animations_enabled",
        translation_key="animations_enabled",
        icon="mdi:animation-play",
        entity_category=EntityCategory.CONFIG,
        is_on_fn=lambda s: bool(s.get("animations_enabled", True)),
        set_fn=_set_animations,
    ),
    PixelSwitchDescription(
        key="vacation",
        translation_key="vacation",
        icon="mdi:beach",
        is_on_fn=lambda s: bool(s.get("vacation")),
        set_fn=_set_vacation,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(PixelSwitch(entry.runtime_data, d) for d in SWITCHES)


class PixelSwitch(PixelEntity, SwitchEntity):
    entity_description: PixelSwitchDescription

    @property
    def is_on(self) -> bool:
        return self.entity_description.is_on_fn(self.snapshot)

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.entity_description.set_fn(self.coordinator, True)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.entity_description.set_fn(self.coordinator, False)
