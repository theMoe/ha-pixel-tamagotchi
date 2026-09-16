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
    # Versioniertes Pfadsegment statt "?v=": die Card besteht aus mehreren ES-Modulen, und
    # ein relativer Import erbt die Query nicht. Unter /pixel-static/<version>/ loesen die
    # Imports der Module automatisch mit auf, ein Versionswechsel bustet also alle auf einmal.
    base = f"{FRONTEND_URL_BASE}/{VERSION}"
    await hass.http.async_register_static_paths([StaticPathConfig(base, str(frontend_dir), cache_headers=False)])
    url = f"{base}/{CARD_FILENAME}"
    add_extra_js_url(hass, url)
    _LOGGER.debug("Pixel-Card registriert unter %s", url)
