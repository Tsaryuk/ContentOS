"""Content hashing for deduplication."""
from __future__ import annotations

import hashlib


def content_hash(text: str) -> str:
    """Stable SHA-256 hex digest of UTF-8 text."""
    return hashlib.sha256(text.strip().encode("utf-8")).hexdigest()
