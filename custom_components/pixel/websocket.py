"""WebSocket-Befehl, über den die Card die Spielereignisse abonniert.

Home Assistant erlaubt ``subscribe_events`` für eigene Event-Typen nur Admins. Ein
Wandtablet oder Kiosk meldet sich aber meist als normaler Nutzer an und bekäme dann
kein einziges ``pixel_event``. Dieser Befehl reicht dieselben Events an jeden
angemeldeten Nutzer weiter. Sie enthalten nichts, was der Status-Sensor nicht ohnehin
zeigt. Automationen hören weiter direkt auf den Bus.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import Event, HomeAssistant, callback

from .const import DOMAIN, EVENT_TYPE

WS_SUBSCRIBE_EVENTS = f"{DOMAIN}/subscribe_events"


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, _ws_subscribe_events)


@websocket_api.websocket_command({vol.Required("type"): WS_SUBSCRIBE_EVENTS})
@callback
def _ws_subscribe_events(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Leitet ``pixel_event`` an die Verbindung weiter, bis die Card abbestellt."""

    @callback
    def forward(event: Event) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_TYPE, forward)
    connection.send_result(msg["id"])


__all__ = ["WS_SUBSCRIBE_EVENTS", "async_register_websocket"]
