"""Shared Claude API helpers."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from anthropic import Anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import load_config


@lru_cache(maxsize=1)
def get_client() -> Anthropic:
    cfg = load_config()
    if not cfg.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return Anthropic(api_key=cfg.anthropic_api_key)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    reraise=True,
)
def call_claude(prompt: str, max_tokens: int = 2000, model: str | None = None) -> str:
    cfg = load_config()
    client = get_client()
    response = client.messages.create(
        model=model or cfg.generation.claude_model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text  # type: ignore[union-attr]


def parse_json_loose(text: str) -> Any:
    """Parse JSON tolerating ```json fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    return json.loads(cleaned)
