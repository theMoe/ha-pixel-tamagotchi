"""Persistenz des Tierzustands in ``.storage/pixel.<entry_id>``."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .engine import PetState

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1
SAVE_DELAY_SECONDS = 5


class PetStore:
    """Dünne Hülle um ``Store`` - kennt nur ``PetState``."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}")
        self._state: PetState | None = None

    async def async_load(self, default_name: str) -> PetState:
        data = await self._store.async_load()
        if data:
            try:
                self._state = PetState.from_dict(data)
            except (TypeError, ValueError) as err:
                _LOGGER.warning("Gespeicherter Zustand unlesbar (%s) - neues Ei", err)
        if self._state is None:
            self._state = PetState(name=default_name)
        return self._state

    def schedule_save(self, state: PetState) -> None:
        self._state = state
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY_SECONDS)

    async def async_save_now(self) -> None:
        await self._store.async_save(self._data_to_save())

    async def async_remove(self) -> None:
        await self._store.async_remove()

    def _data_to_save(self) -> dict[str, Any]:
        assert self._state is not None
        return self._state.to_dict()
