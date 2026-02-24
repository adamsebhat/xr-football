#!/usr/bin/env python3
"""
Fetch real 2025-26 EPL data from ESPN API and build processed JSON files.

Usage:
  python3 scripts/fetch_espn_2526.py

Output:
  data/processed/epl_matches.json
  data/processed/epl_predictions.json
  data/processed/season_metadata.json
"""

import json
import os
import sys
from datetime import datetime, timezone, date, timedelta

import requests

sys.path.insert(0, os.path.dirname(__file__))
from xr_model import compute_rolling_form, compute_matchup_xg, compute_match_probabilities

OUTPUT_DIR = "data/processed"
SEASON = "2025-26"
LEAGUE = "Premier League"

# Canonical team names matching what ESPN returns
TEAM_NAME_MAP = {
    "AFC Bournemouth":           "Bournemouth",
    "Bournemouth":               "Bournemouth",
    "Liverpool":                 "Liverpool",
    "Arsenal":                   "Arsenal",
    "Chelsea":                   "Chelsea",
    "Manchester City":           "Manchester City",
    "Manchester United":         "Manchester United",
    "Newcastle United":          "Newcastle United",
    "Tottenham Hotspur":         "Tottenham Hotspur",
    "Aston Villa":               "Aston Villa",
    "Brighton & Hove Albion":    "Brighton",
    "Brighton":                  "Brighton",
    "Brentford":                 "Brentford",
    "Fulham":                    "Fulham",
    "Crystal Palace":            "Crystal Palace",
    "Everton":                   "Everton",
    "Nottingham Forest":         "Nottingham Forest",
    "Wolverhampton Wanderers":   "Wolves",
    "Wolves":                    "Wolves",
    "West Ham United":           "West Ham United",
    "West Ham":                  "West Ham United",
    "Ipswich Town":              "Ipswich Town",
    "Ipswich":                   "Ipswich Town",
    "Leicester City":            "Leicester City",
    "Leicester":                 "Leicester City",
    "Southampton":               "Southampton",
    "Sunderland":                "Sunderland",
    "Leeds United":              "Leeds United",
}


def fetch_espn() -> list:
    # Step 1: Broad season fetch for all 380 fixtures
    url = (
        "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
        "?dates=20250801-20260601&limit=500"
    )
    print("Fetching full season from ESPN API...")
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    events_by_id: dict = {e["id"]: e for e in resp.json().get("events", [])}
    print(f"  Season fetch: {len(events_by_id)} events")

    # Step 2: Fetch each of the last 30 days individually to get live/current scores.
    # The date-range URL can return stale match statuses for recent games;
    # per-day URLs always return the current live status.
    today = date.today()
    refreshed = 0
    for days_back in range(30):
        day = today - timedelta(days=days_back)
        day_url = (
            "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
            f"?dates={day.strftime('%Y%m%d')}"
        )
        try:
            day_resp = requests.get(day_url, timeout=15)
            day_resp.raise_for_status()
            for event in day_resp.json().get("events", []):
                eid = event["id"]
                if eid in events_by_id:
                    events_by_id[eid] = event  # overwrite with fresh status/score
                    refreshed += 1
                else:
                    events_by_id[eid] = event  # new event not in season fetch
        except Exception as e:
            print(f"  Warning: could not fetch {day}: {e}")

    print(f"  Refreshed {refreshed} recent events with live status")
    return list(events_by_id.values())


def parse_events(events: list) -> list:
    matches = []

    for event in events:
        date_str = event.get("date", "")[:10]  # "2025-08-15"
        kickoff_iso = event.get("date", "")

        competitions = event.get("competitions", [])
        if not competitions:
            continue
        comp = competitions[0]

        competitors = comp.get("competitors", [])
        if len(competitors) < 2:
            continue

        # ESPN: homeAway = "home" / "away"
        home_comp = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away_comp = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home_comp or not away_comp:
            continue

        def team_name(comp_obj):
            raw = comp_obj.get("team", {}).get("displayName", "")
            return TEAM_NAME_MAP.get(raw, raw)

        home = team_name(home_comp)
        away = team_name(away_comp)

        # Score
        status = comp.get("status", {}).get("type", {}).get("name", "")
        completed = status in ("STATUS_FINAL", "STATUS_FULL_TIME")

        home_goals = None
        away_goals = None
        if completed:
            try:
                home_goals = int(home_comp.get("score", ""))
                away_goals = int(away_comp.get("score", ""))
            except (ValueError, TypeError):
                pass

        # xG: ESPN doesn't provide xG, so use None for now (we'll use model predictions)
        home_xg = None
        away_xg = None
        # Check for statistics
        for stat_set in home_comp.get("statistics", []):
            if stat_set.get("name") == "expectedGoals":
                try:
                    home_xg = round(float(stat_set.get("displayValue", 0)), 4)
                except (ValueError, TypeError):
                    pass
        for stat_set in away_comp.get("statistics", []):
            if stat_set.get("name") == "expectedGoals":
                try:
                    away_xg = round(float(stat_set.get("displayValue", 0)), 4)
                except (ValueError, TypeError):
                    pass

        if not home or not away:
            continue

        matches.append({
            "date": date_str,
            "kickoff_iso": kickoff_iso,
            "round": None,
            "home": home,
            "away": away,
            "home_goals": home_goals,
            "away_goals": away_goals,
            "home_xg": home_xg,
            "away_xg": away_xg,
            "home_shots": None,
            "away_shots": None,
            "home_sot": None,
            "away_sot": None,
            "home_possession": None,
            "season": SEASON,
        })

    matches.sort(key=lambda m: m["date"])
    return matches


def assign_rounds(matches: list) -> list:
    """
    Assign matchweek numbers by sorting all matches chronologically and
    grouping them into clusters of 10 (one full matchweek = 10 games).
    This handles international breaks, rearranged fixtures, etc.
    """
    sorted_matches = sorted(matches, key=lambda m: (m["date"], m.get("kickoff_iso", "")))

    for i, match in enumerate(sorted_matches):
        match["round"] = str((i // 10) + 1)

    return sorted_matches


def build_predictions(matches: list) -> list:
    print(f"Building xR predictions for {len(matches)} matches...")
    predictions = []
    now = datetime.now(timezone.utc)
    naive_matches = [{**m, "date": m["date"] + "T12:00:00"} for m in matches]

    for match in matches:
        kickoff_str = match.get("kickoff_iso") or f"{match['date']}T12:00:00Z"
        try:
            kickoff = datetime.fromisoformat(kickoff_str.replace("Z", "+00:00"))
        except Exception:
            kickoff = datetime.fromisoformat(f"{match['date']}T12:00:00+00:00")

        match_date_naive = kickoff.replace(tzinfo=None)

        home_form, _ = compute_rolling_form(
            naive_matches, match["home"], match_date_naive, window_size=10, halflife=4
        )
        away_form, _ = compute_rolling_form(
            naive_matches, match["away"], match_date_naive, window_size=10, halflife=4
        )

        pred_xg_home, pred_xg_away, adjustments = compute_matchup_xg(
            home_form, away_form, home_advantage=0.3
        )
        probs = compute_match_probabilities(pred_xg_home, pred_xg_away)
        hours_until = (kickoff - now).total_seconds() / 3600

        predictions.append({
            "date": match["date"],
            "kickoff_datetime": kickoff.isoformat(),
            "home": match["home"],
            "away": match["away"],
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
            "show_prediction": True,
            "home_goals": match.get("home_goals"),
            "away_goals": match.get("away_goals"),
            "season": SEASON,
        })

    print(f"  Done. {len(predictions)} predictions built.")
    return predictions


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    events = fetch_espn()
    matches = parse_events(events)
    matches = assign_rounds(matches)

    completed = sum(1 for m in matches if m["home_goals"] is not None)
    rounds = sorted(set(m["round"] for m in matches), key=lambda x: int(x))
    teams = sorted(set(m["home"] for m in matches) | set(m["away"] for m in matches))

    print(f"  {len(matches)} fixtures | {completed} completed | {len(rounds)} matchweeks | {len(teams)} teams")
    print(f"  Teams: {', '.join(teams)}")

    with open(f"{OUTPUT_DIR}/epl_matches.json", "w") as f:
        json.dump(matches, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/epl_matches.json")

    predictions = build_predictions(matches)

    with open(f"{OUTPUT_DIR}/epl_predictions.json", "w") as f:
        json.dump(predictions, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/epl_predictions.json")

    meta = {
        "season": SEASON,
        "league": LEAGUE,
        "built_at": datetime.now().isoformat(),
        "match_count": len(matches),
        "prediction_count": len(predictions),
        "teams": teams,
        "team_count": len(teams),
        "source": "ESPN API",
    }
    with open(f"{OUTPUT_DIR}/season_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/season_metadata.json")


if __name__ == "__main__":
    main()
