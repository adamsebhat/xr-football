#!/usr/bin/env python3
"""
Generate realistic 2025-26 Premier League data for the xRphilosophy app.
Creates 380 fixtures (38 matchweeks × 10 matches), with matchweeks 1-25
having results and MW 26-38 as upcoming fixtures.

This script provides the demo dataset while the live FBref pipeline
(build_fbref_epl_2025_26.py) is used for production scraping.
"""

import json, os, sys, random
from datetime import datetime, timedelta, timezone
from itertools import permutations

sys.path.insert(0, os.path.dirname(__file__))
from xr_model import compute_rolling_form, compute_matchup_xg, compute_match_probabilities

random.seed(42)

# ─── Teams ──────────────────────────────────────────────────────────────────────

TEAMS = [
    "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
    "Burnley", "Chelsea", "Crystal Palace", "Everton", "Fulham",
    "Leeds United", "Liverpool", "Manchester City", "Manchester United",
    "Newcastle United", "Nottingham Forest", "Sunderland", "Tottenham Hotspur",
    "West Ham United", "Wolverhampton Wanderers",
]

# Team strength profiles: (attack_xg, defense_xg_against, possession, pass_pct)
# Based on realistic 2025-26 season form
TEAM_PROFILES = {
    "Liverpool":              (2.10, 0.80, 62, 88),
    "Arsenal":                (2.05, 0.75, 61, 89),
    "Manchester City":        (1.95, 0.85, 64, 90),
    "Newcastle United":       (1.65, 1.00, 54, 82),
    "Chelsea":                (1.70, 1.05, 56, 85),
    "Aston Villa":            (1.55, 1.10, 52, 81),
    "Tottenham Hotspur":      (1.60, 1.20, 53, 83),
    "Manchester United":      (1.40, 1.15, 51, 82),
    "Brighton":               (1.50, 1.10, 58, 86),
    "Nottingham Forest":      (1.30, 1.05, 46, 78),
    "Fulham":                 (1.25, 1.20, 48, 80),
    "Brentford":              (1.35, 1.25, 47, 77),
    "Crystal Palace":         (1.10, 1.20, 44, 76),
    "West Ham United":        (1.20, 1.30, 48, 79),
    "Bournemouth":            (1.15, 1.35, 46, 79),
    "Wolverhampton Wanderers":(1.10, 1.30, 45, 78),
    "Everton":                (1.05, 1.35, 44, 77),
    "Leeds United":           (1.00, 1.50, 50, 80),
    "Sunderland":             (0.90, 1.60, 43, 76),
    "Burnley":                (0.85, 1.70, 42, 75),
}

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
SEASON = "2025-26"
COMPLETED_MATCHWEEKS = 25  # MW 1-25 have results, 26-38 upcoming
SEASON_START = datetime(2025, 8, 16)


# ─── Fixture Generator ──────────────────────────────────────────────────────────

def build_schedule(teams: list) -> list:
    """
    Build a double round-robin schedule: home + away fixture for each pair.
    Returns list of (home, away) tuples in matchweek order.
    """
    n = len(teams)
    # Standard round-robin algorithm (polygon method)
    fixed = teams[0]
    rotating = teams[1:]
    matchweeks_first_half = []

    for rnd in range(n - 1):
        pairs = []
        # Match fixed vs rotating[0]
        if rnd % 2 == 0:
            pairs.append((fixed, rotating[0]))
        else:
            pairs.append((rotating[0], fixed))
        # Match remaining pairs
        for i in range(1, n // 2):
            h = rotating[i]
            a = rotating[n - 1 - i]
            if (rnd + i) % 2 == 0:
                pairs.append((h, a))
            else:
                pairs.append((a, h))
        matchweeks_first_half.append(pairs)
        rotating = [rotating[-1]] + rotating[:-1]

    # Second half: flip home/away
    matchweeks_second_half = [
        [(a, h) for h, a in mw]
        for mw in matchweeks_first_half
    ]

    # Shuffle second half to avoid exact mirror sequencing
    random.shuffle(matchweeks_second_half)

    return matchweeks_first_half + matchweeks_second_half


def assign_dates(matchweeks: list) -> list:
    """Assign realistic dates to each matchweek."""
    result = []
    date = SEASON_START
    for mw_idx, pairs in enumerate(matchweeks):
        mw_num = mw_idx + 1
        # Each matchweek spans Saturday-Tuesday; space ~7 days apart
        mw_date = SEASON_START + timedelta(weeks=mw_idx)
        # Spread 10 games over 3 days (Sat, Sun, Mon/Tue)
        day_offsets = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2]
        random.shuffle(day_offsets)
        for i, (home, away) in enumerate(pairs):
            game_date = mw_date + timedelta(days=day_offsets[i])
            result.append({
                "matchweek": mw_num,
                "date": game_date.strftime("%Y-%m-%d"),
                "home": home,
                "away": away,
            })
    return result


# ─── Match Result Simulator ─────────────────────────────────────────────────────

def simulate_result(home: str, away: str, is_played: bool):
    """
    Generate realistic match stats using team profiles.
    Returns partial match dict (no goals if unplayed).
    """
    ha, hd, hp, hpc = TEAM_PROFILES.get(home, (1.2, 1.2, 50, 80))
    aa, ad, ap, apc = TEAM_PROFILES.get(away, (1.2, 1.2, 50, 80))

    # xG: weighted blend of attack vs opponent defense
    noise = lambda: random.gauss(0, 0.25)
    home_xg_actual = max(0.1, ha * 0.6 + (1 / max(ad, 0.5)) * 0.4 + 0.3 + noise())
    away_xg_actual = max(0.1, aa * 0.6 + (1 / max(hd, 0.5)) * 0.4 + noise())

    # Shots proportional to xG
    home_shots = max(3, int(home_xg_actual / 0.12 + random.gauss(0, 2)))
    away_shots = max(3, int(away_xg_actual / 0.12 + random.gauss(0, 2)))
    home_sot = max(1, int(home_shots * random.uniform(0.30, 0.50)))
    away_sot = max(1, int(away_shots * random.uniform(0.28, 0.45)))

    # Possession
    total = hp + ap
    home_poss = round(hp / total * 100 + random.gauss(0, 3), 1)
    home_poss = max(30, min(70, home_poss))

    if not is_played:
        return {
            "home_goals": None, "away_goals": None,
            "home_xg": round(home_xg_actual, 4),
            "away_xg": round(away_xg_actual, 4),
            "home_shots": home_shots, "away_shots": away_shots,
            "home_sot": home_sot, "away_sot": away_sot,
            "home_possession": home_poss,
        }

    # Simulate scoreline via Poisson
    import math
    def poisson_sample(lam):
        L = math.exp(-lam)
        k, p = 0, 1.0
        while p > L:
            k += 1
            p *= random.random()
        return k - 1

    home_goals = poisson_sample(home_xg_actual)
    away_goals = poisson_sample(away_xg_actual)

    # Slight regression toward form
    home_goals = max(0, min(8, home_goals))
    away_goals = max(0, min(7, away_goals))

    return {
        "home_goals": home_goals, "away_goals": away_goals,
        "home_xg": round(home_xg_actual, 4),
        "away_xg": round(away_xg_actual, 4),
        "home_shots": home_shots, "away_shots": away_shots,
        "home_sot": home_sot, "away_sot": away_sot,
        "home_possession": home_poss,
    }


# ─── Predictions ────────────────────────────────────────────────────────────────

def build_predictions(matches: list) -> list:
    print(f"  Building xR predictions for {len(matches)} matches...")
    predictions = []
    now = datetime.now(timezone.utc)

    model_matches = []
    for m in matches:
        mm = dict(m)
        mm["date"] = mm["date"] + "T12:00:00"  # Add time for model
        model_matches.append(mm)

    for match in matches:
        home_team = match["home"]
        away_team = match["away"]
        kickoff_str = match["date"] + "T12:00:00+00:00"
        kickoff = datetime.fromisoformat(kickoff_str)
        match_date_naive = kickoff.replace(tzinfo=None)

        home_form, _ = compute_rolling_form(
            model_matches, home_team, match_date_naive, window_size=10, halflife=4
        )
        away_form, _ = compute_rolling_form(
            model_matches, away_team, match_date_naive, window_size=10, halflife=4
        )

        pred_xg_home, pred_xg_away, adjustments = compute_matchup_xg(
            home_form, away_form, home_advantage=0.3
        )
        probs = compute_match_probabilities(pred_xg_home, pred_xg_away)

        hours_until = (kickoff - now).total_seconds() / 3600
        is_future = hours_until > 0
        show_prediction = (not is_future) or (hours_until <= 72)

        predictions.append({
            "date": match["date"],
            "kickoff_datetime": kickoff.isoformat(),
            "home": home_team,
            "away": away_team,
            "round": match["round"],
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
            "show_prediction": show_prediction,
            "home_goals": match.get("home_goals"),
            "away_goals": match.get("away_goals"),
            "season": SEASON,
        })

    return predictions


# ─── Main ────────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("Generating 2025-26 Premier League data...")

    # 1. Build schedule
    raw_schedule = build_schedule(TEAMS)
    scheduled = assign_dates(raw_schedule)
    print(f"  Generated {len(scheduled)} fixtures")

    # 2. Build match records
    matches = []
    for fix in scheduled:
        mw = fix["matchweek"]
        is_played = mw <= COMPLETED_MATCHWEEKS
        stats = simulate_result(fix["home"], fix["away"], is_played)
        matches.append({
            "date": fix["date"],
            "round": str(mw),
            "home": fix["home"],
            "away": fix["away"],
            "home_goals": stats["home_goals"],
            "away_goals": stats["away_goals"],
            "home_xg": stats["home_xg"],
            "away_xg": stats["away_xg"],
            "home_shots": stats["home_shots"],
            "away_shots": stats["away_shots"],
            "home_sot": stats["home_sot"],
            "away_sot": stats["away_sot"],
            "home_possession": stats["home_possession"],
            "season": SEASON,
        })

    matches.sort(key=lambda m: (m["date"], m["home"]))

    # 3. Save matches
    out = os.path.join(OUTPUT_DIR, "epl_matches.json")
    with open(out, "w") as f:
        json.dump(matches, f, indent=2)
    print(f"  Saved matches → {out}")

    # 4. Build predictions
    predictions = build_predictions(matches)
    out = os.path.join(OUTPUT_DIR, "epl_predictions.json")
    with open(out, "w") as f:
        json.dump(predictions, f, indent=2)
    print(f"  Saved predictions → {out}")

    # 5. Metadata
    teams = sorted(set(m["home"] for m in matches) | set(m["away"] for m in matches))
    completed = sum(1 for m in matches if m["home_goals"] is not None)
    meta = {
        "season": SEASON,
        "league": "Premier League",
        "built_at": datetime.now().isoformat(),
        "match_count": len(matches),
        "prediction_count": len(predictions),
        "teams": teams,
        "team_count": len(teams),
        "completed_matches": completed,
        "upcoming_matches": len(matches) - completed,
    }
    out = os.path.join(OUTPUT_DIR, "season_metadata.json")
    with open(out, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"  Saved metadata → {out}")

    print(f"\nDone:")
    print(f"  Season: {SEASON}")
    print(f"  Total matches: {len(matches)}")
    print(f"  Played (MW 1-{COMPLETED_MATCHWEEKS}): {completed}")
    print(f"  Upcoming (MW {COMPLETED_MATCHWEEKS+1}-38): {len(matches)-completed}")
    print(f"  Predictions: {len(predictions)}")


if __name__ == "__main__":
    main()
