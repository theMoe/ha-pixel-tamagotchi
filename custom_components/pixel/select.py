"""Select: Stimmung anzeigen und manuell überschreiben ('auto' = Engine entscheidet)."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity, SelectEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry
from .engine import Mood
from .entity import PixelEntity

AUTO = "auto"
MOOD_DESCRIPTION = SelectEntityDescription(key="mood", translation_key="mood", icon="mdi:emoticon-outline")


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([PixelMoodSelect(entry.runtime_data)])


class PixelMoodSelect(PixelEntity, SelectEntity):
    _attr_options = [AUTO, *(str(m) for m in Mood)]

    def __init__(self, coordinator) -> None:  # noqa: ANN001
        super().__init__(coordinator, MOOD_DESCRIPTION)

    @property
    def current_option(self) -> str | None:
        return self.snapshot.get("mood_override") or self.snapshot.get("mood")

    @property
    def extra_state_attributes(self) -> dict[str, str | None]:
        return {"mode": "manual" if self.snapshot.get("mood_override") else AUTO}

    async def async_select_option(self, option: str) -> None:
        mood = None if option == AUTO else Mood(option)
        await self.coordinator.async_act("set_mood", mood=mood)
