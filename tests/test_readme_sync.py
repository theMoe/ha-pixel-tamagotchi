"""Prüft, dass README.md (englisch) und README.de.md (deutsch) strukturell deckungsgleich bleiben.

Der Test kennt keine Übersetzung, er vergleicht nur, was sprachunabhängig ist: Abschnittsnummern,
Tabellenzeilen pro Abschnitt, Codeblöcke und die genannten Pixel-Bezeichner. Wer eine Datei ändert
und die andere vergisst, fällt hier auf.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
README_EN = ROOT / "README.md"
README_DE = ROOT / "README.de.md"

# Bezeichner, die in beiden Sprachen identisch sein müssen (Entities, Services, Events, WS-Befehl)
_PIXEL_ID = re.compile(r"`((?:[a-z_]+\.pixel_[a-z_]+)|(?:pixel\.[a-z_]+)|(?:pixel/[a-z_]+)|(?:_[a-z_]+))`")
_SECTION = re.compile(r"^## (\d+)\. ", re.MULTILINE)


def _sections(text: str) -> dict[str, str]:
    """Zerlegt den Text an den nummerierten `## N.`-Überschriften; Schlüssel ist die Nummer."""
    parts = _SECTION.split(text)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


def _table_rows(section: str) -> int:
    return sum(1 for line in section.splitlines() if line.startswith("|"))


def _code_fences(section: str) -> list[str]:
    """Sprachkennung jedes öffnenden Codeblocks, in Reihenfolge."""
    fences = [line.strip() for line in section.splitlines() if line.strip().startswith("```")]
    return fences[0::2]


@pytest.fixture(scope="module")
def readmes() -> tuple[str, str]:
    return README_EN.read_text(encoding="utf-8"), README_DE.read_text(encoding="utf-8")


def test_language_switch_links(readmes: tuple[str, str]) -> None:
    en, de = readmes
    assert en.splitlines()[0] == "**English** | [Deutsch](README.de.md)"
    assert de.splitlines()[0] == "**Deutsch** | [English](README.md)"


def test_same_sections(readmes: tuple[str, str]) -> None:
    en, de = readmes
    assert list(_sections(en)) == list(_sections(de))


def test_same_table_rows_per_section(readmes: tuple[str, str]) -> None:
    en, de = (_sections(t) for t in readmes)
    for number in en:
        assert _table_rows(en[number]) == _table_rows(de[number]), f"Abschnitt {number}: Tabellenzeilen weichen ab"


def test_same_code_blocks_per_section(readmes: tuple[str, str]) -> None:
    en, de = (_sections(t) for t in readmes)
    for number in en:
        assert _code_fences(en[number]) == _code_fences(de[number]), f"Abschnitt {number}: Codeblöcke weichen ab"


def test_same_event_list(readmes: tuple[str, str]) -> None:
    def events(text: str) -> list[str]:
        line = next(line for line in text.splitlines() if line.startswith("**Events:**"))
        return re.findall(r"`([^`]+)`", line)

    en, de = (events(t) for t in readmes)
    assert en == de


def test_same_pixel_identifiers(readmes: tuple[str, str]) -> None:
    en, de = (set(_PIXEL_ID.findall(t)) for t in readmes)
    assert en == de, f"nur EN: {sorted(en - de)}, nur DE: {sorted(de - en)}"
