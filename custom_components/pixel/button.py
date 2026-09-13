"""Buttons: Füttern, Spielen, Streicheln, Putzen, Medizin - für Dashboards ohne die Card."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .coordinator import PixelConfigEntry
from .engine import Meal
from .entity import PixelEntity


@dataclass(frozen=True, kw_only=True)
class PixelButtonDescription(ButtonEntityDescription):
    action: str
    kwargs: dict[str, object] | None = None


BUTTONS: tuple[PixelButtonDescription, ...] = (
    PixelButtonDescription(
        key="feed", translation_key="feed", icon="mdi:food-apple", action="feed", kwargs={"meal": Meal.MEAL}
    ),
    PixelButtonDescription(
        key="snack", translation_key="snack", icon="mdi:cookie", action="feed", kwargs={"meal": Meal.SNACK}
    ),
    PixelButtonDescription(
        key="treat", translation_key="treat", icon="mdi:candy", action="feed", kwargs={"meal": Meal.TREAT}
    ),
    PixelButtonDescription(key="play", translation_key="play", icon="mdi:soccer", action="play"),
    PixelButtonDescription(key="pet", translation_key="pet", icon="mdi:hand-heart-outline", action="pet"),
    PixelButtonDescription(key="clean", translation_key="clean", icon="mdi:broom", action="clean"),
    PixelButtonDescription(key="medicine", translation_key="medicine", icon="mdi:pill", action="medicine"),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: PixelConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities(PixelButton(entry.runtime_data, d) for d in BUTTONS)


class PixelButton(PixelEntity, ButtonEntity):
    entity_description: PixelButtonDescription

    async def async_press(self) -> None:
        kwargs = dict(self.entity_description.kwargs or {})
        if self.entity_description.action in ("feed", "play"):
            kwargs["user"] = await self._user_name()
        await self.coordinator.async_act(self.entity_description.action, **kwargs)

    async def _user_name(self) -> str | None:
        context = getattr(self, "_context", None)
        if context is None or not context.user_id:
            return None
        user = await self.hass.auth.async_get_user(context.user_id)
        return user.name if user else None
