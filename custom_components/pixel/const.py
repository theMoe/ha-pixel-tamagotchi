"""Konstanten der Pixel-Integration."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "pixel"
VERSION = "0.2.0"
EVENT_TYPE = f"{DOMAIN}_event"
TICK_INTERVAL = timedelta(seconds=60)

# Konfigurations-Schlüssel (Config-Flow / Optionen)
CONF_NAME = "name"
CONF_WEATHER_ENTITY = "weather_entity"
CONF_CALENDAR_ENTITIES = "calendar_entities"
CONF_MEDIA_PLAYERS = "media_players"
CONF_PRESENCE_ENTITY = "presence_entity"
CONF_FEEDING_WINDOWS = "feeding_windows"
CONF_NIGHT_START = "night_start"
CONF_NIGHT_END = "night_end"
CONF_HARDCORE = "hardcore"
CONF_DECAY_SPEED = "decay_speed"

DEFAULT_NAME = "Pixel"
DEFAULT_PRESENCE_ENTITY = "zone.home"
DEFAULT_FEEDING_WINDOWS = "07:00-09:00, 12:00-14:00, 18:00-20:00"
DEFAULT_NIGHT_START = "22:00:00"
DEFAULT_NIGHT_END = "06:30:00"
DEFAULT_DECAY_SPEED = 1.0

# Services
SERVICE_FEED = "feed"
SERVICE_PLAY = "play"
SERVICE_PET = "pet"
SERVICE_CLEAN = "clean"
SERVICE_MEDICINE = "medicine"
SERVICE_SLEEP = "sleep"
SERVICE_WAKE = "wake"
SERVICE_SET_MOOD = "set_mood"
SERVICE_SAY = "say"
SERVICE_TRICK = "trick"
SERVICE_RESET = "reset"
SERVICE_REMOVE_BUILD = "remove_build"
SERVICE_SET_VACATION = "set_vacation"

ATTR_MEAL = "meal"
ATTR_MOOD = "mood"
ATTR_MINUTES = "minutes"
ATTR_TEXT = "text"
ATTR_DURATION = "duration"
ATTR_TRICK = "trick"
ATTR_NAME = "name"
ATTR_COUNT = "count"
ATTR_BUILD_ID = "build_id"
ATTR_ENABLED = "enabled"
ATTR_CONFIG_ENTRY = "config_entry_id"

# Frontend
FRONTEND_URL_BASE = f"/{DOMAIN}-static"
CARD_FILENAME = "pixel-card.js"
