"""Notifier: Telegram alerts for fresh high-score ideas."""
from __future__ import annotations

from typing import Any

from src.config import load_config
from src.integrations import telegram_bot
from src.integrations.supabase_client import table
from src.utils.logger import get_logger

log = get_logger(__name__)


def run(new_ideas: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    cfg = load_config()
    threshold = cfg.telegram_bot.instant_notification_threshold

    if new_ideas is None:
        resp = (
            table("content_ideas")
            .select("*")
            .eq("status", "new")
            .gte("score", threshold)
            .execute()
        )
        new_ideas = resp.data or []

    sent = 0
    errors: list[dict[str, Any]] = []

    for idea in new_ideas:
        try:
            if (idea.get("score") or 0) < threshold:
                continue
            text = telegram_bot.format_idea(idea, category=idea.get("_category"))
            telegram_bot.send_message(text)
            table("content_ideas").update({"status": "reviewed"}).eq("id", idea["id"]).execute()
            sent += 1
        except Exception as exc:
            log.error("notify.failed", idea_id=idea.get("id"), error=str(exc))
            errors.append({"stage": "notify", "idea_id": idea.get("id"), "error": str(exc)})

    log.info("notify.done", sent=sent, errors=len(errors))
    return {"items_processed": len(new_ideas), "items_generated": sent, "errors": errors}
