"""Supabase client bound to the `content_ideas` schema.

Note: schema must be added to "Exposed schemas" in Supabase Dashboard
(API Settings → Exposed schemas) for PostgREST to access it.
"""
from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from src.config import load_config

SCHEMA = "content_ideas"


@lru_cache(maxsize=1)
def get_client() -> Client:
    cfg = load_config()
    if not cfg.supabase_url or not cfg.supabase_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY are not set")
    options = ClientOptions(schema=SCHEMA)
    return create_client(cfg.supabase_url, cfg.supabase_key, options=options)


def table(name: str):
    return get_client().table(name)
