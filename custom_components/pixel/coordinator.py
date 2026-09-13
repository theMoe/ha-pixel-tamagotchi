"""Der Coordinator verbindet Engine, Welt-Adapter, Persistenz und HA-Event-Bus."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN, EVENT_TYPE, TICK_INTERVAL
from .engine import ActionRefused, GameEvent, PetEngine, PetState, WorldContext
from .settings import PixelSettings
from .store import PetStore
from .world import WorldAdapter

_LOGGER = logging.getLogger(__name__)

type PixelConfigEntry = ConfigEntry[PixelCoordinator]


class PixelCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Tickt jede Minute, führt Aktionen aus und liefert den Snapshot an die Entities.

    ``self.data`` ist der Engine-Snapshot (dict), damit Entities ohne Kenntnis
    der Engine-Klassen auskommen. Der rohe Zustand bleibt über ``state`` erreichbar.
    """

    def __init__(self, hass: HomeAssistant, entry: PixelConfigEntry) -> None:
        super().__init__(hass, _LOGGER, name=f"{DOMAIN} {entry.title}", update_interval=TICK_INTERVAL)
        self.entry = entry
        self.settings = PixelSettings.from_entry(entry)
        self._store = PetStore(hass, entry.entry_id)
        self._world = WorldAdapter(hass, self.settings)
        self._engine: PetEngine | None = None
        self._last_world: WorldContext | None = None

    # ------------------------------------------------------------------ Lebenszyklus

    async def async_setup(self) -> None:
        state = await self._store.async_load(self.settings.name)
        self._engine = PetEngine(state, self.settings.game)

    async def async_shutdown(self) -> None:
        await super().async_shutdown()
        if self._engine is not None:
            await self._store.async_save_now()

    async def async_remove_storage(self) -> None:
        await self._store.async_remove()

    def apply_settings(self, settings: PixelSettings) -> None:
        """Nach Optionsänderung: Engine-Konfiguration tauschen, Zustand behalten."""
        self.settings = settings
        self._world.update_settings(settings)
        if self._engine is not None:
            self._engine = PetEngine(self._engine.state, settings.game)

    # ------------------------------------------------------------------ Zugriff

    @property
    def engine(self) -> PetEngine:
        assert self._engine is not None, "Coordinator nicht initialisiert"
        return self._engine

    @property
    def state(self) -> PetState:
        return self.engine.state

    @property
    def world(self) -> WorldContext | None:
        return self._last_world

    # ------------------------------------------------------------------ Takt

    async def _async_update_data(self) -> dict[str, Any]:
        world = await self._world.build()
        events = self.engine.tick(world)
        self._last_world = world
        self._publish(events)
        return self._snapshot(world)

    # ------------------------------------------------------------------ Aktionen

    async def async_act(self, action: str, **kwargs: Any) -> list[GameEvent]:
        """Aktion ausführen, Events feuern, speichern, Entities aktualisieren."""
        world = self._last_world or await self._world.build()
        try:
            events = self.engine.act(action, world, **kwargs)
        except ActionRefused as err:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="action_refused",
                translation_placeholders={"reason": str(err)},
            ) from err
        self._publish(events)
        self.async_set_updated_data(self._snapshot(world))
        return events

    def set_animations_enabled(self, enabled: bool) -> None:
        self.state.animations_enabled = enabled
        self._store.schedule_save(self.state)
        if self.data is not None:
            self.async_set_updated_data({**self.data, "animations_enabled": enabled})

    def fire_card_event(self, event_type: str, **data: Any) -> None:
        """Ereignisse, die nur die Card interessieren (sagen, Trick, gehe zu)."""
        self._publish([GameEvent(event_type, data)])

    # ------------------------------------------------------------------ intern

    def _snapshot(self, world: WorldContext) -> dict[str, Any]:
        """Engine-Snapshot plus HA-Bezug (entry_id), damit die Card Events zuordnen kann."""
        return {**self.engine.snapshot(world), "entry_id": self.entry.entry_id}

    def _publish(self, events: list[GameEvent]) -> None:
        self._store.schedule_save(self.state)
        for event in events:
            payload = {"entry_id": self.entry.entry_id, "name": self.state.name, "type": event.type, **event.data}
            self.hass.bus.async_fire(EVENT_TYPE, payload)
            _LOGGER.debug("Event %s: %s", event.type, event.data)
