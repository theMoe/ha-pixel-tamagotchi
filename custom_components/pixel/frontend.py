"""Liefert die Pixel-Card aus und registriert sie als Frontend-Ressource.

Der Nutzer muss so keine Lovelace-Ressource von Hand anlegen.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import CARD_FILENAME, DOMAIN, FRONTEND_URL_BASE, VERSION

_LOGGER = logging.getLogger(__name__)
_DATA_KEY = f"{DOMAIN}_frontend_registered"


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Idempotent: einmal pro HA-Lauf registrieren."""
    if hass.data.get(_DATA_KEY):
        return
    hass.data[_DATA_KEY] = True

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL_BASE, str(frontend_dir), cache_headers=False)]
    )
    url = f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={VERSION}"
    add_extra_js_url(hass, url)
    _LOGGER.debug("Pixel-Card registriert unter %s", url)
