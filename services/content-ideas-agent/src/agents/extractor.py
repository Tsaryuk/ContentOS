"""Topic Extractor agent: pull unprocessed raw_content, extract topics via Claude."""
from __future__ import annotations

from typing import Any

from src.agents._claude import call_claude, parse_json_loose
from src.config import load_config
from src.integrations.supabase_client import table
from src.utils.logger import get_logger
from src.utils.prompts import TOPIC_EXTRACTION_PROMPT

log = get_logger(__name__)

MAX_CONTENT_CHARS = 8000


def _extract_one(content: str) -> list[dict[str, Any]]:
    snippet = content[:MAX_CONTENT_CHARS]
    prompt = TOPIC_EXTRACTION_PROMPT.format(content=snippet)
    raw = call_claude(prompt, max_tokens=2000)
    parsed = parse_json_loose(raw)
    if not isinstance(parsed, list):
        raise ValueError(f"Expected list of topics, got {type(parsed).__name__}")
    return parsed


def run() -> dict[str, Any]:
    cfg = load_config()
    raw_resp = (
        table("raw_content")
        .select("*")
        .eq("is_processed", False)
        .limit(cfg.monitoring.batch_size)
        .execute()
    )
    raw_items = raw_resp.data or []

    topics_extracted = 0
    errors: list[dict[str, Any]] = []

    for item in raw_items:
        try:
            topics = _extract_one(item["content"])
            for t in topics:
                table("topics").insert(
                    {
                        "raw_content_id": item["id"],
                        "title": t.get("title", "")[:500],
                        "description": t.get("description", ""),
                        "keywords": t.get("keywords") or [],
                        "relevance_note": t.get("relevance_note", ""),
                    }
                ).execute()
                topics_extracted += 1

            table("raw_content").update({"is_processed": True}).eq("id", item["id"]).execute()
        except Exception as exc:
            log.error("extract.failed", raw_content_id=item["id"], error=str(exc))
            errors.append(
                {"stage": "extract", "raw_content_id": item["id"], "error": str(exc)}
            )

    log.info(
        "extract.done",
        items_processed=len(raw_items),
        topics_extracted=topics_extracted,
        errors=len(errors),
    )
    return {
        "items_processed": len(raw_items),
        "items_generated": topics_extracted,
        "errors": errors,
    }
