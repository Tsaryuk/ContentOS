"""Seed initial sources. Edit SOURCES below for your real list."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.integrations.supabase_client import table  # noqa: E402
from src.utils.logger import configure_logging, get_logger  # noqa: E402

SOURCES = [
    {
        "type": "youtube",
        "identifier": "UCXuqSBlHAE6Xw-yeJA0Tunw",  # Linus Tech Tips — placeholder
        "name": "Example YouTube Channel",
        "priority": "medium",
        "is_active": True,
        "metadata": {},
    },
    {
        "type": "email",
        "identifier": "newsletter@example.com",
        "name": "Example Newsletter",
        "priority": "medium",
        "is_active": True,
        "metadata": {},
    },
]


def main() -> None:
    configure_logging("INFO")
    log = get_logger("seed")
    for src in SOURCES:
        try:
            table("sources").upsert(src, on_conflict="type,identifier").execute()
            log.info("seed.upsert", name=src["name"], type=src["type"])
        except Exception as exc:
            log.error("seed.failed", name=src["name"], error=str(exc))


if __name__ == "__main__":
    main()
