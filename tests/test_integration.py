"""Integrationstests der Pixel-Integration gegen einen echten HA-Kern (pytest-homeassistant-custom-component)."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

import pytest
from custom_components.pixel.const import (
    CONF_CALENDAR_ENTITIES,
    CONF_FEEDING_WINDOWS,
    CONF_NAME,
    CONF_WEATHER_ENTITY,
    DOMAIN,
    EVENT_TYPE,
)
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Custom Components im Test-HA zulassen."""
    yield


@pytest.fixture
def entry() -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Pixel",
        data={CONF_NAME: "Pixel", CONF_WEATHER_ENTITY: "weather.home", CONF_CALENDAR_ENTITIES: []},
        options={},
        unique_id="pixel_pixel",
    )


async def setup_integration(hass: HomeAssistant, entry: MockConfigEntry) -> MockConfigEntry:
    hass.states.async_set("weather.home", "sunny", {"temperature": 24})
    hass.states.async_set("zone.home", "2")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_creates_entities_and_services(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    assert entry.state is ConfigEntryState.LOADED

    status = hass.states.get("sensor.pixel_status")
    assert status is not None
    assert status.attributes["stage"] == "egg"
    assert status.attributes["outfit"]["accessory"] == "sunglasses", "Sonnenbrille bei sonnigem Wetter"
    assert status.attributes["entry_id"] == entry.entry_id

    for entity_id in (
        "sensor.pixel_hunger",
        "sensor.pixel_stage",
        "binary_sensor.pixel_needs_attention",
        "select.pixel_mood",
        "switch.pixel_animations",
        "button.pixel_feed",
    ):
        assert hass.states.get(entity_id) is not None, entity_id

    for service in (
        "feed",
        "play",
        "pet",
        "clean",
        "remove_build",
        "medicine",
        "sleep",
        "wake",
        "set_mood",
        "say",
        "trick",
        "reset",
    ):
        assert hass.services.has_service(DOMAIN, service)


async def test_feed_service_updates_state_and_fires_event(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    events = []
    hass.bus.async_listen(EVENT_TYPE, lambda e: events.append(e.data))

    before = float(hass.states.get("sensor.pixel_hunger").state)
    await hass.services.async_call(DOMAIN, "feed", {"meal": "meal"}, blocking=True)
    await hass.async_block_till_done()

    after = float(hass.states.get("sensor.pixel_hunger").state)
    assert after > before
    assert any(e["type"] == "fed" for e in events)
    assert hass.states.get("sensor.pixel_activity").state == "eating"


async def test_button_press_feeds(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    before = float(hass.states.get("sensor.pixel_hunger").state)
    await hass.services.async_call("button", "press", {"entity_id": "button.pixel_snack"}, blocking=True)
    await hass.async_block_till_done()
    assert float(hass.states.get("sensor.pixel_hunger").state) == before + 15


async def test_mood_select_override_and_auto(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    await hass.services.async_call(
        "select", "select_option", {"entity_id": "select.pixel_mood", "option": "excited"}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get("select.pixel_mood").state == "excited"
    assert hass.states.get("select.pixel_mood").attributes["mode"] == "manual"
    await hass.services.async_call(
        "select", "select_option", {"entity_id": "select.pixel_mood", "option": "auto"}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get("select.pixel_mood").attributes["mode"] == "auto"


async def test_say_fires_card_event_without_state_change(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    events = []
    hass.bus.async_listen(EVENT_TYPE, lambda e: events.append(e.data))
    await hass.services.async_call(DOMAIN, "say", {"text": "Hallo Familie", "duration": 3}, blocking=True)
    await hass.async_block_till_done()
    assert events[-1]["type"] == "say"
    assert events[-1]["text"] == "Hallo Familie"


async def test_tick_advances_time(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    before = float(hass.states.get("sensor.pixel_hunger").state)
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(minutes=61))
    await hass.async_block_till_done()
    # Der Coordinator tickt gegen die echte Uhr; Verfall wird über last_tick berechnet.
    coordinator = entry.runtime_data
    with patch("custom_components.pixel.world.dt_util.utcnow", return_value=dt_util.utcnow() + timedelta(hours=2)):
        await coordinator.async_refresh()
    await hass.async_block_till_done()
    assert float(hass.states.get("sensor.pixel_hunger").state) < before


async def test_state_survives_reload(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    await hass.services.async_call(DOMAIN, "feed", {"meal": "meal"}, blocking=True)
    await hass.async_block_till_done()
    fed = float(hass.states.get("sensor.pixel_hunger").state)
    total = hass.states.get("sensor.pixel_status").attributes["total_feeds"]

    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    assert float(hass.states.get("sensor.pixel_hunger").state) == pytest.approx(fed, abs=1)
    assert hass.states.get("sensor.pixel_status").attributes["total_feeds"] == total


async def test_options_update_changes_feeding_windows(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    hass.config_entries.async_update_entry(entry, options={CONF_FEEDING_WINDOWS: "00:00-23:59"})
    await hass.async_block_till_done()
    assert entry.runtime_data.settings.game.feeding_windows[0].start.hour == 0
    assert hass.states.get("binary_sensor.pixel_feeding_time").state == "on"


async def test_medicine_refused_raises_no_error_but_event(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    events = []
    hass.bus.async_listen(EVENT_TYPE, lambda e: events.append(e.data))
    await hass.services.async_call(DOMAIN, "medicine", {}, blocking=True)
    await hass.async_block_till_done()
    assert any(e["type"] == "medicine_refused" for e in events)


async def test_unload(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await setup_integration(hass, entry)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED
