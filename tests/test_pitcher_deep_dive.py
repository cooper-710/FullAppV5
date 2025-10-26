import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from sequence_biolab_api.deep_dive import build_pitcher_deep_dive


@pytest.mark.parametrize(
    ("span", "rollup"),
    [
        ("regular", "season"),
        ("postseason", "career"),
    ],
)
def test_pitcher_deep_dive_sections(span: str, rollup: str) -> None:
    """Ensure deep dive endpoint returns core sections."""
    data = asyncio.run(build_pitcher_deep_dive(mlbam=543037, year=2024, span=span, rollup=rollup))  # Gerrit Cole
    assert "meta" in data
    required_sections = [
        "standard",
        "advanced",
        "statcast",
        "pitch_values",
        "pitch_type_mix",
        "movement_scatter",
        "pitch_velocity",
    ]
    for section in required_sections:
        assert section in data, f"{section} missing from payload"
        assert isinstance(data[section], list), f"{section} should be list"


def test_pitcher_deep_dive_handles_total_span() -> None:
    """Total span should merge regular and postseason results."""
    data = asyncio.run(build_pitcher_deep_dive(mlbam=543037, year=2024, span="total", rollup="last3"))
    assert data["standard"], "Expected standard rows for total span"
    seasons = {row.get("season") for row in data["standard"]}
    assert seasons, "Expected season labels present"
