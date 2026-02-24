#!/usr/bin/env python3
"""
Transform Understat 2024-25 EPL data into xR app format.
Assigns matchweek numbers and generates xR predictions.

Usage:
  python scripts/build_from_understat.py

Output:
  data/processed/epl_matches.json
  data/processed/epl_predictions.json
  data/processed/season_metadata.json
"""

import json
import os
import sys
import math
from datetime import datetime, timezone

# Add scripts dir to path for imports
sys.path.insert(0, os.path.dirname(__file__))
from xr_model import compute_rolling_form, compute_matchup_xg, compute_match_probabilities

# ─── Config ────────────────────────────────────────────────────────────────────

INPUT_PATH = "data_processed/matches_epl.json"
OUTPUT_DIR = "data/processed"

SEASON = "2024-25"
LEAGUE = "Premier League"

# Canonical team name mapping (Understat → display name)
TEAM_NAME_MAP = {
    "Manchester United":      "Manchester United",
    "Fulham":                 "Fulham",
    "Ipswich":                "Ipswich Town",
    "Liverpool":              "Liverpool",
    "Arsenal":                "Arsenal",
    "Wolverhampton Wanderers": "Wolves",
    "Brighton":               "Brighton",
    "Manchester City":        "Manchester City",
    "Chelsea":                "Chelsea",
    "Brentford":              "Brentford",
    "Crystal Palace":         "Crystal Palace",
    "West Ham":               "West Ham United",
    "Aston Villa":            "Aston Villa",
    "Newcastle United":       "Newcastle United",
    "Tottenham":              "Tottenham Hotspur",
    "Bournemouth":            "Bournemouth",
    "Everton":                "Everton",
    "Leicester":              "Leicester City",
    "Southampton":            "Southampton",
    "Nottingham Forest":      "Nottingham Forest",
}

# ─── Load & normalise ──────────────────────────────────────────────────────────

def load_understat(path: str) -> list:
    with open(path) as f:
        raw = json.load(f)
    return raw


def normalise_matches(raw: list) -> list:
    """Convert Understat format → xR app format."""
    matches = []
    for r in raw:
        home = TEAM_NAME_MAP.get(r["homeTeam"], r["homeTeam"])
        away = TEAM_NAME_MAP.get(r["awayTeam"], r["awayTeam"])
        # Parse kickoff ISO → date string
        kickoff = r.get("kickoffISO", "")
        try:
            dt = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
            date_str = dt.strftime("%Y-%m-%d")
        except Exception:
            date_str = kickoff[:10] if kickoff else "2024-08-17"

        matches.append({
            "date": date_str,
            "kickoff_iso": kickoff,
            "round": None,          # filled later
            "home": home,
            "away": away,
            "home_goals": r.get("homeGoals"),
            "away_goals": r.get("awayGoals"),
            "home_xg": round(float(r.get("homeXG") or 0), 4),
            "away_xg": round(float(r.get("awayXG") or 0), 4),
            "home_shots": int(r.get("homeShots") or 0),
            "away_shots": int(r.get("awayShots") or 0),
            "home_sot": int(r.get("homeSOT") or 0),
            "away_sot": int(r.get("awaySOT") or 0),
            "season": SEASON,
        })

    # Sort chronologically
    matches.sort(key=lambda m: m["date"])
    return matches


def assign_rounds(matches: list) -> list:
    """
    Assign matchweek numbers based on date grouping.
    Matches on the same date cluster belong to the same round.
    Use a sliding window: group by proximity.
    """
    # Group dates; each 'cluster' within a 10-day span = one matchweek
    from itertools import groupby

    dates_sorted = sorted(set(m["date"] for m in matches))
    date_to_round: dict = {}
    round_num = 0
    prev_date = None

    for d in dates_sorted:
        dt = datetime.strptime(d, "%Y-%m-%d")
        if prev_date is None or (dt - prev_date).days > 10:
            round_num += 1
        date_to_round[d] = round_num
        prev_date = dt

    for m in matches:
        m["round"] = str(date_to_round[m["date"]])

    return matches


# ─── Predictions ──────────────────────────────────────────────────────────────

def build_predictions(matches: list) -> list:
    """Build xR predictions for every match."""
    print(f"Building predictions for {len(matches)} matches...")
    predictions = []
    now = datetime.now(timezone.utc)

    for match in matches:
        try:
            # Use noon UTC as kickoff time if only date available
            kickoff_str = match.get("kickoff_iso") or f"{match['date']}T12:00:00Z"
            kickoff = datetime.fromisoformat(kickoff_str.replace("Z", "+00:00"))
        except Exception:
            kickoff = datetime.fromisoformat(f"{match['date']}T12:00:00+00:00")

        home_team = match["home"]
        away_team = match["away"]
        match_date = kickoff.replace(tzinfo=None)  # naive for model compat

        # Model uses naive datetimes
        match_date_naive = kickoff.replace(tzinfo=None)

        # Compute rolling form (needs naive dt)
        # Build naive match list for model
        naive_matches = [{**m, "date": m["date"] + "T12:00:00"} for m in matches]

        home_form, _ = compute_rolling_form(
            naive_matches, home_team, match_date_naive, window_size=10, halflife=4
        )
        away_form, _ = compute_rolling_form(
            naive_matches, away_team, match_date_naive, window_size=10, halflife=4
        )

        pred_xg_home, pred_xg_away, adjustments = compute_matchup_xg(
            home_form, away_form, home_advantage=0.3
        )

        probs = compute_match_probabilities(pred_xg_home, pred_xg_away)

        hours_until = (kickoff - now).total_seconds() / 3600

        predictions.append({
            "date": match["date"],
            "kickoff_datetime": kickoff.isoformat(),
            "home": home_team,
            "away": away_team,
            "round": match.get("round"),
            "home_form": {
                "matches": home_form.matches_count,
                "xg_for": round(home_form.xg_for, 2),
                "xg_against": round(home_form.xg_against, 2),
                "goals": round(home_form.goals, 1),
                "possession_pct": round(home_form.possession_pct, 1),
                "pass_completion_pct": round(home_form.pass_completion_pct, 1),
            },
            "away_form": {
                "matches": away_form.matches_count,
                "xg_for": round(away_form.xg_for, 2),
                "xg_against": round(away_form.xg_against, 2),
                "goals": round(away_form.goals, 1),
                "possession_pct": round(away_form.possession_pct, 1),
                "pass_completion_pct": round(away_form.pass_completion_pct, 1),
            },
            "base_xg_home": round(home_form.xg_for, 2),
            "base_xg_away": round(away_form.xg_for, 2),
            "pred_xg_home": round(pred_xg_home, 2),
            "pred_xg_away": round(pred_xg_away, 2),
            "matchup_adjustments": adjustments,
            "win_home_pct": probs["win_home_pct"],
            "draw_pct": probs["draw_pct"],
            "win_away_pct": probs["win_away_pct"],
            "xpts_home": probs["xpts_home"],
            "xpts_away": probs["xpts_away"],
            "most_likely_scoreline": probs["most_likely_scoreline"],
            "top_5_scorelines": probs["top_5_scorelines"],
            "hours_until_kickoff": round(hours_until, 1),
            # For completed matches show prediction always; for future matches use 72h rule
            "show_prediction": True,  # All visible for portfolio
            "home_goals": match.get("home_goals"),
            "away_goals": match.get("away_goals"),
            "season": SEASON,
        })

    print(f"  Done. {len(predictions)} predictions built.")
    return predictions


# ─── Metadata ─────────────────────────────────────────────────────────────────

def build_metadata(matches: list, predictions: list) -> dict:
    teams = sorted(set(m["home"] for m in matches) | set(m["away"] for m in matches))
    return {
        "season": SEASON,
        "league": LEAGUE,
        "built_at": datetime.now().isoformat(),
        "match_count": len(matches),
        "prediction_count": len(predictions),
        "teams": teams,
        "team_count": len(teams),
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Loading {INPUT_PATH}...")
    raw = load_understat(INPUT_PATH)
    print(f"  {len(raw)} raw records loaded.")

    matches = normalise_matches(raw)
    matches = assign_rounds(matches)

    # Save matches
    matches_path = os.path.join(OUTPUT_DIR, "epl_matches.json")
    with open(matches_path, "w") as f:
        json.dump(matches, f, indent=2)
    print(f"  Saved matches → {matches_path}")

    # Build predictions
    predictions = build_predictions(matches)

    pred_path = os.path.join(OUTPUT_DIR, "epl_predictions.json")
    with open(pred_path, "w") as f:
        json.dump(predictions, f, indent=2)
    print(f"  Saved predictions → {pred_path}")

    # Save metadata
    meta = build_metadata(matches, predictions)
    meta_path = os.path.join(OUTPUT_DIR, "season_metadata.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved metadata → {meta_path}")

    # Print summary
    rounds = sorted(set(m["round"] for m in matches), key=lambda x: int(x))
    print(f"\nSummary:")
    print(f"  Season: {SEASON}")
    print(f"  Matches: {len(matches)}")
    print(f"  Matchweeks: {len(rounds)}")
    print(f"  Teams: {meta['team_count']}")
    print(f"  Predictions: {len(predictions)}")
    completed = sum(1 for m in matches if m["home_goals"] is not None and m["away_goals"] is not None)
    print(f"  Completed matches: {completed}")


if __name__ == "__main__":
    main()
