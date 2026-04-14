"""Run the pipeline once for local testing."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.config import load_config  # noqa: E402
from src.graph import run_pipeline  # noqa: E402
from src.utils.logger import configure_logging  # noqa: E402


def main() -> None:
    cfg = load_config()
    configure_logging(cfg.log_level)
    state = run_pipeline()
    print("=== METRICS ===")
    for stage, m in (state.get("metrics") or {}).items():
        print(f"  {stage}: {m}")
    errors = state.get("errors") or []
    if errors:
        print(f"=== ERRORS ({len(errors)}) ===")
        for e in errors[:10]:
            print(f"  {e}")


if __name__ == "__main__":
    main()
