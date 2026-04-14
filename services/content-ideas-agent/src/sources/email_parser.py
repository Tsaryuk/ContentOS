"""Gmail IMAP source: fetch recent messages from a specific sender."""
from __future__ import annotations

import email
import imaplib
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.message import Message
from typing import Any

from src.config import load_config
from src.sources.base import FetchedItem
from src.utils.logger import get_logger

log = get_logger(__name__)


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _extract_body(msg: Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disposition = (part.get("Content-Disposition") or "").lower()
            if ctype == "text/plain" and "attachment" not in disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        # fallback to html
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        return ""
    payload = msg.get_payload(decode=True)
    if payload:
        return payload.decode(msg.get_content_charset() or "utf-8", errors="replace")
    return ""


def fetch_latest(source: dict[str, Any], days: int = 7, max_items: int = 30) -> list[FetchedItem]:
    cfg = load_config()
    if not cfg.gmail_address or not cfg.gmail_app_password:
        log.warning("gmail.skip", reason="missing_credentials")
        return []

    sender = source["identifier"]
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%d-%b-%Y")

    items: list[FetchedItem] = []

    try:
        with imaplib.IMAP4_SSL(cfg.gmail_imap_host, cfg.gmail_imap_port) as imap:
            imap.login(cfg.gmail_address, cfg.gmail_app_password)
            imap.select("INBOX")

            criteria = f'(FROM "{sender}" SINCE {since})'
            status, data = imap.search(None, criteria)
            if status != "OK" or not data or not data[0]:
                log.info("gmail.no_messages", sender=sender)
                return []

            ids = data[0].split()[-max_items:]
            for msg_id in ids:
                status, msg_data = imap.fetch(msg_id, "(RFC822)")
                if status != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)

                subject = _decode(msg.get("Subject"))
                from_ = _decode(msg.get("From"))
                date_str = msg.get("Date")
                published = None
                if date_str:
                    try:
                        published = email.utils.parsedate_to_datetime(date_str)
                    except Exception:
                        published = None

                body = _extract_body(msg).strip()
                if not body:
                    continue

                items.append(
                    FetchedItem(
                        title=subject or "(no subject)",
                        content=f"{subject}\n\n{body}",
                        url=None,
                        published_at=published,
                        metadata={"from": from_, "imap_id": msg_id.decode()},
                    )
                )
    except Exception as exc:
        log.error("gmail.fetch_failed", sender=sender, error=str(exc))
        return items

    log.info("gmail.fetched", sender=sender, count=len(items))
    return items
