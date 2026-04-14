"""Base contracts for source parsers."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class FetchedItem:
    title: str
    content: str
    url: str | None = None
    published_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_row(self, source_id: str, content_hash: str) -> dict[str, Any]:
        return {
            "source_id": source_id,
            "title": self.title,
            "content": self.content,
            "url": self.url,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "metadata": self.metadata,
            "content_hash": content_hash,
        }
