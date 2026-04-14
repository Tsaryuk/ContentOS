"""Entry point: APScheduler runs the LangGraph pipeline every N hours."""
from __future__ import annotations

import signal
import sys
from datetime import datetime, timezone

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

from src.config import load_config
from src.graph import run_pipeline
from src.utils.logger import configure_logging, get_logger


def _job() -> None:
    log = get_logger("scheduler")
    started = datetime.now(timezone.utc)
    log.info("job.start", at=started.isoformat())
    try:
        run_pipeline()
    except Exception as exc:
        log.error("job.failed", error=str(exc))
    log.info("job.end", duration_s=(datetime.now(timezone.utc) - started).total_seconds())


def main() -> None:
    cfg = load_config()
    configure_logging(cfg.log_level)
    log = get_logger("main")

    log.info(
        "service.start",
        interval_hours=cfg.monitoring.interval_hours,
        model=cfg.generation.claude_model,
    )

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        _job,
        trigger=IntervalTrigger(hours=cfg.monitoring.interval_hours),
        id="content_ideas_pipeline",
        next_run_time=datetime.now(timezone.utc),  # run immediately on boot
        max_instances=1,
        coalesce=True,
    )

    def _shutdown(signum, frame):  # noqa: ARG001
        log.info("service.shutdown", signal=signum)
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    scheduler.start()


if __name__ == "__main__":
    main()
