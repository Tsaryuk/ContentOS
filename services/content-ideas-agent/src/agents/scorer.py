"""Relevance Scorer agent: assign 0-100 score and category to topics."""
from __future__ import annotations

from typing import Any

from src.agents._claude import call_claude, parse_json_loose
from src.integrations.supabase_client import table
from src.utils.logger import get_logger
from src.utils.prompts import RELEVANCE_SCORING_PROMPT

log = get_logger(__name__)

VALID_CATEGORIES = {"strategy", "philosophy", "wellbeing", "fatherhood", "business", "other"}


def _score_one(topic: dict[str, Any]) -> dict[str, Any]:
    prompt = RELEVANCE_SCORING_PROMPT.format(
        title=topic.get("title", ""),
        description=topic.get("description", ""),
        keywords=", ".join(topic.get("keywords") or []),
        relevance_note=topic.get("relevance_note", ""),
    )
    raw = call_claude(prompt, max_tokens=500)
    parsed = parse_json_loose(raw)

    score = int(parsed.get("score", 0))
    score = max(0, min(100, score))
    category = parsed.get("category", "other")
    if category not in VALID_CATEGORIES:
        category = "other"
    return {"score": score, "category": category}


def run() -> dict[str, Any]:
    topics_resp = table("topics").select("*").is_("score", "null").limit(50).execute()
    topics = topics_resp.data or []

    scored = 0
    errors: list[dict[str, Any]] = []

    for topic in topics:
        try:
            result = _score_one(topic)
            table("topics").update(result).eq("id", topic["id"]).execute()
            scored += 1
        except Exception as exc:
            log.error("score.failed", topic_id=topic["id"], error=str(exc))
            errors.append({"stage": "score", "topic_id": topic["id"], "error": str(exc)})

    log.info("score.done", scored=scored, errors=len(errors))
    return {
        "items_processed": len(topics),
        "items_generated": scored,
        "errors": errors,
    }
