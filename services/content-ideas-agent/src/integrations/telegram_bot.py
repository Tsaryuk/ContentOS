"""Telegram bot for notifications. Sync wrapper around python-telegram-bot."""
from __future__ import annotations

import asyncio
from typing import Any

from telegram import Bot
from telegram.constants import ParseMode

from src.config import load_config
from src.utils.logger import get_logger

log = get_logger(__name__)

CATEGORY_RU = {
    "strategy": "Стратегия",
    "philosophy": "Философия",
    "wellbeing": "Благополучие",
    "fatherhood": "Отцовство",
    "business": "Бизнес",
    "other": "Другое",
}

CONTENT_TYPE_RU = {
    "telegram": "Telegram пост",
    "youtube": "YouTube видео",
    "podcast": "Подкаст",
    "email": "Email рассылка",
    "reels": "Reels / Shorts",
}


def format_idea(idea: dict[str, Any], category: str | None = None) -> str:
    score = idea.get("score") or 0
    title = idea.get("title", "(без названия)")
    ctype = CONTENT_TYPE_RU.get(idea.get("content_type", ""), idea.get("content_type", ""))
    cat = CATEGORY_RU.get(category or "other", "Другое")
    body_preview = (idea.get("body") or "")[:300].strip()
    return (
        f"🔥 Новая идея (Score: {score})\n\n"
        f"📂 {cat}\n"
        f"📺 {ctype}\n\n"
        f"💡 {title}\n\n"
        f"{body_preview}{'...' if len(idea.get('body') or '') > 300 else ''}"
    )


async def _send(bot_token: str, chat_id: str, text: str) -> None:
    bot = Bot(token=bot_token)
    async with bot:
        await bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode=None,
            disable_web_page_preview=True,
        )


def send_message(text: str) -> None:
    """Sync entrypoint used by graph nodes."""
    cfg = load_config()
    if not cfg.telegram_bot_token or not cfg.telegram_chat_id:
        log.warning("telegram_bot.skip", reason="missing_credentials")
        return
    try:
        asyncio.run(_send(cfg.telegram_bot_token, cfg.telegram_chat_id, text))
    except Exception as exc:
        log.error("telegram_bot.send_failed", error=str(exc))
