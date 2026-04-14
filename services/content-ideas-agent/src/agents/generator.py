"""Idea Generator agent: turn high-score topics into content ideas per format."""
from __future__ import annotations

from typing import Any

from src.agents._claude import call_claude, parse_json_loose
from src.config import load_config
from src.integrations.supabase_client import table
from src.utils.logger import get_logger
from src.utils.prompts import PROMPTS_BY_TYPE

log = get_logger(__name__)


def _topic_already_generated(topic_id: str, content_type: str) -> bool:
    res = (
        table("content_ideas")
        .select("id")
        .eq("topic_id", topic_id)
        .eq("content_type", content_type)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _generate_one(topic: dict[str, Any], content_type: str) -> dict[str, Any]:
    template = PROMPTS_BY_TYPE.get(content_type)
    if not template:
        raise ValueError(f"No prompt template for content_type={content_type}")

    prompt = template.format(
        title=topic.get("title", ""),
        description=topic.get("description", ""),
        relevance_note=topic.get("relevance_note", ""),
    )
    cfg = load_config()
    raw = call_claude(prompt, max_tokens=cfg.generation.max_tokens)
    parsed = parse_json_loose(raw)

    return {
        "topic_id": topic["id"],
        "content_type": content_type,
        "title": parsed.get("title", "")[:500],
        "body": parsed.get("body", ""),
        "metadata": parsed.get("metadata") or {},
        "score": topic.get("score"),
        "status": "new",
    }


def run() -> dict[str, Any]:
    cfg = load_config()
    topics_resp = (
        table("topics")
        .select("*")
        .gte("score", cfg.scoring.relevance_threshold)
        .order("score", desc=True)
        .limit(cfg.generation.max_topics_per_run)
        .execute()
    )
    topics = topics_resp.data or []

    generated = 0
    errors: list[dict[str, Any]] = []
    new_ideas: list[dict[str, Any]] = []

    for topic in topics:
        for content_type in cfg.generation.content_types:
            if _topic_already_generated(topic["id"], content_type):
                continue
            try:
                idea = _generate_one(topic, content_type)
                inserted = table("content_ideas").insert(idea).execute()
                if inserted.data:
                    new_ideas.append({**inserted.data[0], "_category": topic.get("category")})
                generated += 1
            except Exception as exc:
                log.error(
                    "generate.failed",
                    topic_id=topic["id"],
                    content_type=content_type,
                    error=str(exc),
                )
                errors.append(
                    {
                        "stage": "generate",
                        "topic_id": topic["id"],
                        "content_type": content_type,
                        "error": str(exc),
                    }
                )

    log.info("generate.done", topics=len(topics), ideas=generated, errors=len(errors))
    return {
        "items_processed": len(topics),
        "items_generated": generated,
        "errors": errors,
        "new_ideas": new_ideas,
    }
