"""YouTube channel monitoring via RSS."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import feedparser

from src.sources.base import FetchedItem
from src.utils.logger import get_logger

log = get_logger(__name__)

RSS_TEMPLATE = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"


def _rss_url(source: dict[str, Any]) -> str:
    meta = source.get("metadata") or {}
    if meta.get("rss_url"):
        return meta["rss_url"]
    # source.identifier should be a YouTube channel_id (UCxxxx...)
    return RSS_TEMPLATE.format(channel_id=source["identifier"])


def fetch_latest(source: dict[str, Any], max_items: int = 20) -> list[FetchedItem]:
    url = _rss_url(source)
    feed = feedparser.parse(url)

    if feed.bozo:
        log.warning("youtube.parse_warning", url=url, error=str(feed.bozo_exception))

    items: list[FetchedItem] = []
    for entry in feed.entries[:max_items]:
        title = entry.get("title", "").strip()
        summary = entry.get("summary", "").strip()
        link = entry.get("link")

        published = None
        if getattr(entry, "published_parsed", None):
            published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

        meta = {
            "video_id": entry.get("yt_videoid"),
            "channel_title": getattr(feed.feed, "title", None),
            "author": entry.get("author"),
        }

        content = f"{title}\n\n{summary}".strip()
        if not content:
            continue

        items.append(
            FetchedItem(
                title=title,
                content=content,
                url=link,
                published_at=published,
                metadata=meta,
            )
        )

    log.info("youtube.fetched", source=source.get("name"), count=len(items))
    return items
