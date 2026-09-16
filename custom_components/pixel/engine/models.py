"""Datenmodelle der Pixel-Engine.

Dieses Modul kennt Home Assistant nicht. Alles hier ist reine Domänenlogik,
damit die Engine ohne HA getestet werden kann.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any


def utcnow() -> datetime:
    """Aktuelle Zeit in UTC, zeitzonenbewusst."""
    return datetime.now(UTC)


class Mood(StrEnum):
    """Stimmung des Tiers - Reihenfolge entspricht der Auswertungspriorität."""

    FAINTED = "fainted"
    SICK = "sick"
    SLEEPING = "sleeping"
    HUNGRY = "hungry"
    STRESSED = "stressed"
    LONELY = "lonely"
    EXCITED = "excited"
    BUSY = "busy"
    BORED = "bored"
    HAPPY = "happy"


class Stage(StrEnum):
    """Lebensstufe."""

    EGG = "egg"
    BABY = "baby"
    CHILD = "child"
    TEEN = "teen"
    ADULT = "adult"
    SENIOR = "senior"


STAGE_ORDER: tuple[Stage, ...] = (
    Stage.EGG,
    Stage.BABY,
    Stage.CHILD,
    Stage.TEEN,
    Stage.ADULT,
    Stage.SENIOR,
)


class Activity(StrEnum):
    """Grobe Aktivität, die das Backend vorgibt. Feinbewegung macht die Card."""

    IDLE = "idle"
    SLEEPING = "sleeping"
    EATING = "eating"
    PLAYING = "playing"
    BUILDING = "building"
    SICK = "sick"
    FAINTED = "fainted"


class Meal(StrEnum):
    """Mahlzeitentypen für den Service pixel.feed."""

    SNACK = "snack"
    MEAL = "meal"
    TREAT = "treat"


class WeatherKind(StrEnum):
    """Vereinfachte Wetterlage - auf diese Werte mappt der HA-Adapter."""

    UNKNOWN = "unknown"
    SUNNY = "sunny"
    PARTLY_CLOUDY = "partlycloudy"
    CLOUDY = "cloudy"
    RAINY = "rainy"
    POURING = "pouring"
    SNOWY = "snowy"
    WINDY = "windy"
    LIGHTNING = "lightning"
    FOGGY = "foggy"
    CLEAR_NIGHT = "clear-night"


@dataclass(frozen=True)
class GameEvent:
    """Ein Ereignis, das die Engine nach außen meldet (HA feuert es als Event)."""

    type: str
    data: dict[str, Any] = field(default_factory=dict)


class BuildKind(StrEnum):
    """Was das Tier bauen kann."""

    HOUSE = "house"
    SWING = "swing"
    FLOWERS = "flowers"
    SNOWMAN = "snowman"
    GOLF = "golf"


@dataclass
class Build:
    """Ein gebautes Objekt.

    ``rx`` ist die waagerechte Lage als Verhältnis 0..1 und gilt für alle Geräte
    gleichermaßen; die Höhe bestimmt jede Card selbst aus ihrem eigenen Kartenlayout.
    ``created`` ist bewusst ein ISO-String und kein ``datetime``: ``to_dict`` wandelt nur
    Felder der obersten Ebene, ein Zeitstempel in der Liste bräche den Roundtrip.
    """

    id: str = ""
    kind: str = BuildKind.HOUSE
    rx: float = 0.5
    created: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Outfit:
    """Was das Tier gerade trägt. Leerer String = nichts."""

    hat: str = ""
    accessory: str = ""
    item: str = ""

    def as_dict(self) -> dict[str, str]:
        return asdict(self)


@dataclass
class CalendarEvent:
    """Ein anstehender Termin, minimal reduziert."""

    uid: str
    title: str
    start: datetime
    all_day: bool = False


@dataclass
class WorldContext:
    """Was die Engine über die Welt weiß - vom HA-Adapter befüllt.

    Die Engine liest nur, sie verändert den Kontext nie.
    """

    now: datetime
    local_now: datetime
    weather: WeatherKind = WeatherKind.UNKNOWN
    temperature: float | None = None
    appointments_24h: int = 0
    next_event: CalendarEvent | None = None
    persons_home: int | None = None
    media_playing: bool = False
    person_arrived: bool = False

    @property
    def house_empty(self) -> bool:
        return self.persons_home == 0

    @property
    def is_weekend(self) -> bool:
        return self.local_now.weekday() >= 5


@dataclass
class PetState:
    """Der vollständige, persistierte Zustand des Tiers."""

    name: str = "Pixel"
    born_at: datetime = field(default_factory=utcnow)
    last_tick: datetime = field(default_factory=utcnow)
    generation: int = 1

    # Bedürfnisse 0-100
    hunger: float = 70.0
    happiness: float = 75.0
    energy: float = 85.0
    health: float = 100.0
    care_score: float = 70.0

    # Abgeleitete Zustände
    stage: Stage = Stage.EGG
    mood: Mood = Mood.HAPPY
    activity: Activity = Activity.IDLE
    activity_until: datetime | None = None
    outfit: Outfit = field(default_factory=Outfit)

    sleeping: bool = False
    sleeping_manual: bool | None = None  # None = automatisch
    fainted: bool = False
    sick_since: datetime | None = None

    poop_count: int = 0
    poop_due_at: datetime | None = None

    builds: list[Build] = field(default_factory=list)
    build_due_at: datetime | None = None

    mood_override: Mood | None = None
    mood_override_until: datetime | None = None

    last_fed: datetime | None = None
    last_interaction: datetime | None = None
    house_empty_since: datetime | None = None
    announced_event_uid: str | None = None

    treats_today: int = 0
    treats_day: str = ""  # ISO-Datum

    total_feeds: int = 0
    total_plays: int = 0
    feeds_by_user: dict[str, int] = field(default_factory=dict)

    animations_enabled: bool = True

    # ---------------------------------------------------------------- Ableitungen

    @property
    def is_sick(self) -> bool:
        return self.sick_since is not None

    def age_days(self, now: datetime) -> int:
        return max(0, (now - self.born_at).days)

    def treats_day_key(self, local_now: datetime) -> str:
        return local_now.date().isoformat()

    # ---------------------------------------------------------------- Serialisierung

    def to_dict(self) -> dict[str, Any]:
        """Für die Persistenz: Datumsfelder als ISO-Strings, Enums als Strings."""
        data = asdict(self)
        for key, value in list(data.items()):
            if isinstance(value, datetime):
                data[key] = value.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PetState:
        """Robust gegen fehlende/zusätzliche Felder (Migrationen)."""
        known = {f for f in cls.__dataclass_fields__}
        kwargs: dict[str, Any] = {}
        for key, value in data.items():
            if key not in known:
                continue
            kwargs[key] = _deserialize_field(key, value)
        return cls(**kwargs)


_DATETIME_FIELDS = {
    "born_at",
    "last_tick",
    "activity_until",
    "sick_since",
    "poop_due_at",
    "mood_override_until",
    "build_due_at",
    "last_fed",
    "last_interaction",
    "house_empty_since",
}
_ENUM_FIELDS = {"stage": Stage, "mood": Mood, "activity": Activity, "mood_override": Mood}


def _deserialize_field(key: str, value: Any) -> Any:
    if value is None:
        return None
    if key in _DATETIME_FIELDS:
        parsed = datetime.fromisoformat(value) if isinstance(value, str) else value
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    if key in _ENUM_FIELDS:
        enum_cls = _ENUM_FIELDS[key]
        try:
            return enum_cls(value)
        except ValueError:
            return None if key == "mood_override" else list(enum_cls)[-1]
    if key == "builds" and isinstance(value, list):
        known = Build.__dataclass_fields__
        return [Build(**{k: v for k, v in item.items() if k in known}) for item in value if isinstance(item, dict)]
    if key == "outfit" and isinstance(value, dict):
        return Outfit(**{k: v for k, v in value.items() if k in Outfit.__dataclass_fields__})
    return value


__all__ = [
    "STAGE_ORDER",
    "Activity",
    "Build",
    "BuildKind",
    "CalendarEvent",
    "GameEvent",
    "Meal",
    "Mood",
    "Outfit",
    "PetState",
    "Stage",
    "WeatherKind",
    "WorldContext",
    "date",
    "utcnow",
]
