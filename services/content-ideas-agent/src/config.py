"""Config loader: YAML + .env."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()

CONFIG_PATH = Path(os.getenv("CONFIG_PATH", "config.yaml"))


@dataclass
class MonitoringCfg:
    interval_hours: int = 6
    batch_size: int = 50
    max_content_age_days: int = 7


@dataclass
class ScoringCfg:
    relevance_threshold: int = 60
    categories: dict[str, float] = field(default_factory=dict)


@dataclass
class GenerationCfg:
    content_types: list[str] = field(default_factory=lambda: ["telegram", "youtube"])
    claude_model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 2000
    max_ideas_per_topic: int = 2
    max_topics_per_run: int = 20


@dataclass
class TelegramBotCfg:
    instant_notification_threshold: int = 85
    digest_min_score: int = 75


@dataclass
class AppConfig:
    monitoring: MonitoringCfg
    scoring: ScoringCfg
    generation: GenerationCfg
    telegram_bot: TelegramBotCfg
    log_level: str

    # secrets
    supabase_url: str
    supabase_key: str
    anthropic_api_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    gmail_address: str
    gmail_app_password: str
    gmail_imap_host: str
    gmail_imap_port: int


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_config(path: Path | None = None) -> AppConfig:
    raw = _load_yaml(path or CONFIG_PATH)

    return AppConfig(
        monitoring=MonitoringCfg(**(raw.get("monitoring") or {})),
        scoring=ScoringCfg(**(raw.get("scoring") or {})),
        generation=GenerationCfg(**(raw.get("generation") or {})),
        telegram_bot=TelegramBotCfg(**(raw.get("telegram_bot") or {})),
        log_level=(raw.get("logging") or {}).get("level", "INFO"),
        supabase_url=os.getenv("SUPABASE_URL", ""),
        supabase_key=os.getenv("SUPABASE_KEY", ""),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        gmail_address=os.getenv("GMAIL_ADDRESS", ""),
        gmail_app_password=os.getenv("GMAIL_APP_PASSWORD", ""),
        gmail_imap_host=os.getenv("GMAIL_IMAP_HOST", "imap.gmail.com"),
        gmail_imap_port=int(os.getenv("GMAIL_IMAP_PORT", "993")),
    )
