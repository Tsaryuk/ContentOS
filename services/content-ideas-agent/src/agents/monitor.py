"""Source Monitor agent: fetch new items from active sources into raw_content."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from src.integrations.supabase_client import table
from src.sources import email_parser, youtube
from src.utils.hashing import content_hash
from src.utils.logger import get_logger

log = get_logger(__name__)


def _fetch_for_source(source: dict[str, Any]) -> list[dict[str, Any]]:
    stype = source["type"]
    if stype == "youtube":
        items = youtube.fetch_latest(source)
    elif stype == "email":
        items = email_parser.fetch_latest(source)
    else:
        log.info("monitor.skip_unsupported", type=stype)
        return []

    rows: list[dict[str, Any]] = []
    for item in items:
        h = content_hash(item.content)
        rows.append(item.to_row(source_id=source["id"], content_hash=h))
    return rows


def run() -> dict[str, Any]:
    """Returns metrics dict."""
    sources_resp = table("sources").select("*").eq("is_active", True).execute()
    sources = sources_resp.data or []

    items_fetched = 0
    items_inserted = 0
    errors: list[dict[str, Any]] = []

    for src in sources:
        try:
            rows = _fetch_for_source(src)
            items_fetched += len(rows)

            for row in rows:
                try:
                    res = (
                        table("raw_content")
                        .upsert(row, on_conflict="source_id,content_hash", ignore_duplicates=True)
                        .execute()
                    )
                    if res.data:
                        items_inserted += len(res.data)
                except Exception as exc:
                    errors.append(
                        {"stage": "monitor.insert", "source_id": src["id"], "error": str(exc)}
                    )

            table("sources").update(
                {"last_checked_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", src["id"]).execute()

        except Exception as exc:
            log.error("monitor.source_failed", source=src.get("name"), error=str(exc))
            errors.append({"stage": "monitor.fetch", "source_id": src["id"], "error": str(exc)})

    log.info(
        "monitor.done",
        sources=len(sources),
        fetched=items_fetched,
        inserted=items_inserted,
        errors=len(errors),
    )
    return {
        "sources_count": len(sources),
        "items_processed": items_fetched,
        "items_generated": items_inserted,
        "errors": errors,
    }
