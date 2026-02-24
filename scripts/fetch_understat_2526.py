#!/usr/bin/env python3
"""
Fetch real 2025-26 EPL data from understat.com and build processed JSON files.

Usage:
  python3 scripts/fetch_understat_2526.py

Output:
  data/processed/epl_matches.json
  data/processed/epl_predictions.json
  data/processed/season_metadata.json
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
from xr_model import compute_rolling_form, compute_matchup_xg, compute_match_probabilities

OUTPUT_DIR = "data/processed"
SEASON = "2025-26"
LEAGUE = "Premier League"

TEAM_NAME_MAP = {
    "Manchester United":       "Manchester United",
    "Fulham":                  "Fulham",
    "Ipswich":                 "Ipswich Town",
    "Liverpool":               "Liverpool",
    "Arsenal":                 "Arsenal",
    "Wolverhampton Wanderers": "Wolves",
    "Brighton":                "Brighton",
    "Manchester City":         "Manchester City",
    "Chelsea":                 "Chelsea",
    "Brentford":               "Brentford",
    "Crystal Palace":          "Crystal Palace",
    "West Ham":                "West Ham United",
    "Aston Villa":             "Aston Villa",
    "Newcastle United":        "Newcastle United",
    "Tottenham":               "Tottenham Hotspur",
    "Bournemouth":             "Bournemouth",
    "Everton":                 "Everton",
    "Leicester":               "Leicester City",
    "Southampton":             "Southampton",
    "Nottingham Forest":       "Nottingham Forest",
    "Sunderland":              "Sunderland",
}


def fetch_understat(season_year: int = 2025) -> list:
    url = f"https://understat.com/league/EPL/{season_year}"
    print(f"Fetching {url} ...")
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    scripts = soup.find_all("script")

    for script in scripts:
        text = script.string or ""
        if "datesData" in text:
            # Extract JSON from: var datesData = JSON.parse('...')
            match = re.search(r"datesData\s*=\s*JSON\.parse\('(.+?)'\)", text, re.DOTALL)
            if match:
                raw_json = match.group(1)
                # Unescape unicode sequences
                raw_json = raw_json.encode("utf-8").decode("unicode_escape")
                data = json.loads(raw_json)
                print(f"  Found {len(data)} fixtures")
                return data

    raise RuntimeError("Could not find datesData in understat page")


def normalise_matches(raw: list) -> list:
    matches = []
    for r in raw:
        home = TEAM_NAME_MAP.get(r.get("h", {}).get("title", ""), r.get("h", {}).get("title", ""))
        away = TEAM_NAME_MAP.get(r.get("a", {}).get("title", ""), r.get("a", {}).get("title", ""))

        kickoff = r.get("datetime", "")
        try:
            dt = datetime.strptime(kickoff, "%Y-%m-%d %H:%M:%S")
            date_str = dt.strftime("%Y-%m-%d")
            kickoff_iso = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            date_str = kickoff[:10] if kickoff else ""
            kickoff_iso = kickoff

        # Goals: understat uses "" for unplayed matches
        h_goals = r.get("goals", {}).get("h")
        a_goals = r.get("goals", {}).get("a")
        home_goals = int(h_goals) if h_goals not in (None, "") else None
        away_goals = int(a_goals) if a_goals not in (None, "") else None

        home_xg = float(r.get("xG", {}).get("h") or 0)
        away_xg = float(r.get("xG", {}).get("a") or 0)

        # Only include if both teams resolved
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
            "home_xg": round(home_xg, 4),
            "away_xg": round(away_xg, 4),
            "home_shots": int(r.get("shots", {}).get("h") or 0),
            "away_shots": int(r.get("shots", {}).get("a") or 0),
            "home_sot": None,
            "away_sot": None,
            "home_possession": None,
            "season": SEASON,
        })

    matches.sort(key=lambda m: m["date"])
    return matches


def assign_rounds(matches: list) -> list:
    dates_sorted = sorted(set(m["date"] for m in matches if m["date"]))
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
        m["round"] = str(date_to_round.get(m["date"], "1"))

    return matches


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

    raw = fetch_understat(2025)
    matches = normalise_matches(raw)
    matches = assign_rounds(matches)

    completed = sum(1 for m in matches if m["home_goals"] is not None)
    print(f"  {len(matches)} fixtures, {completed} completed")

    with open(f"{OUTPUT_DIR}/epl_matches.json", "w") as f:
        json.dump(matches, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/epl_matches.json")

    predictions = build_predictions(matches)

    with open(f"{OUTPUT_DIR}/epl_predictions.json", "w") as f:
        json.dump(predictions, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/epl_predictions.json")

    teams = sorted(set(m["home"] for m in matches) | set(m["away"] for m in matches))
    meta = {
        "season": SEASON,
        "league": LEAGUE,
        "built_at": datetime.now().isoformat(),
        "match_count": len(matches),
        "prediction_count": len(predictions),
        "teams": teams,
        "team_count": len(teams),
    }
    with open(f"{OUTPUT_DIR}/season_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved → {OUTPUT_DIR}/season_metadata.json")

    rounds = sorted(set(m["round"] for m in matches), key=lambda x: int(x))
    print(f"\nSummary:")
    print(f"  Season: {SEASON}  |  Matchweeks: {len(rounds)}  |  Teams: {len(teams)}")
    print(f"  Teams: {', '.join(teams)}")


if __name__ == "__main__":
    main()
