"""LangGraph state machine wiring agents into a pipeline."""
from __future__ import annotations

import time
import uuid
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from src.agents import extractor, generator, monitor, notifier, scorer
from src.integrations.supabase_client import table
from src.utils.logger import get_logger

log = get_logger(__name__)


class ContentState(TypedDict, total=False):
    run_id: str
    metrics: dict[str, dict[str, Any]]
    errors: list[dict[str, Any]]
    new_ideas: list[dict[str, Any]]


def _stage(state: ContentState, name: str, fn) -> ContentState:
    started = time.time()
    try:
        result = fn()
    except Exception as exc:
        log.error("stage.crashed", stage=name, error=str(exc))
        state.setdefault("errors", []).append({"stage": name, "error": str(exc)})
        result = {"items_processed": 0, "items_generated": 0, "errors": []}

    duration_ms = int((time.time() - started) * 1000)
    state.setdefault("metrics", {})[name] = {
        "items_processed": result.get("items_processed", 0),
        "items_generated": result.get("items_generated", 0),
        "duration_ms": duration_ms,
        "errors_count": len(result.get("errors") or []),
    }
    state.setdefault("errors", []).extend(result.get("errors") or [])
    return result


def monitor_node(state: ContentState) -> ContentState:
    result = _stage(state, "monitor", monitor.run)
    state.setdefault("metrics", {})["monitor"]["sources_count"] = result.get("sources_count", 0)
    return state


def extract_node(state: ContentState) -> ContentState:
    _stage(state, "extract", extractor.run)
    return state


def score_node(state: ContentState) -> ContentState:
    _stage(state, "score", scorer.run)
    return state


def generate_node(state: ContentState) -> ContentState:
    result = _stage(state, "generate", generator.run)
    state["new_ideas"] = result.get("new_ideas") or []
    return state


def notify_node(state: ContentState) -> ContentState:
    new_ideas = state.get("new_ideas") or []
    _stage(state, "notify", lambda: notifier.run(new_ideas))
    return state


def log_node(state: ContentState) -> ContentState:
    run_id = state["run_id"]
    metrics = state.get("metrics") or {}
    rows = []
    for stage_name, m in metrics.items():
        rows.append(
            {
                "run_id": run_id,
                "stage": stage_name,
                "sources_count": m.get("sources_count"),
                "items_processed": m.get("items_processed", 0),
                "items_generated": m.get("items_generated", 0),
                "success": m.get("errors_count", 0) == 0,
                "duration_ms": m.get("duration_ms", 0),
                "errors": None,
            }
        )
    if rows:
        try:
            table("generation_log").insert(rows).execute()
        except Exception as exc:
            log.error("log_node.persist_failed", error=str(exc))
    log.info("pipeline.done", run_id=run_id, metrics=metrics, errors=len(state.get("errors") or []))
    return state


def build_graph():
    workflow = StateGraph(ContentState)
    workflow.add_node("monitor", monitor_node)
    workflow.add_node("extract", extract_node)
    workflow.add_node("score", score_node)
    workflow.add_node("generate", generate_node)
    workflow.add_node("notify", notify_node)
    workflow.add_node("log", log_node)

    workflow.set_entry_point("monitor")
    workflow.add_edge("monitor", "extract")
    workflow.add_edge("extract", "score")
    workflow.add_edge("score", "generate")
    workflow.add_edge("generate", "notify")
    workflow.add_edge("notify", "log")
    workflow.add_edge("log", END)

    return workflow.compile()


def run_pipeline() -> ContentState:
    app = build_graph()
    initial: ContentState = {
        "run_id": str(uuid.uuid4()),
        "metrics": {},
        "errors": [],
        "new_ideas": [],
    }
    log.info("pipeline.start", run_id=initial["run_id"])
    return app.invoke(initial)
