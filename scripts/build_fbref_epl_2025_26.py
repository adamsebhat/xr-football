#!/usr/bin/env python3
"""
Build xR prediction pipeline from FBref 2025-26 Premier League data via soccerdata.

Usage:
  python scripts/build_fbref_epl_2025_26.py

Output files (read by the Next.js frontend):
  data/processed/epl_matches.json
  data/processed/epl_predictions.json
  data/processed/season_metadata.json
"""

import sys
import json
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

try:
    import soccerdata as sd
except ImportError:
    print("ERROR: soccerdata not installed. Run: pip install soccerdata")
    sys.exit(1)

# ── Config imports ──────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
from config import (
    SEASON,
    SEASON_LABEL,
    LEAGUE,
    DATA_PROCESSED_DIR,
    SOCCERDATA_CACHE_DIR,
    ROLLING_WINDOW,
    ROLLING_WEIGHT_HALFLIFE,
    POISSON_HOME_ADVANTAGE,
    EXPECTED_EPL_TEAM_COUNT,
)
from xr_model import (
    compute_rolling_form,
    compute_matchup_xg,
    compute_match_probabilities,
)

# ── Logging ─────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

os.makedirs(DATA_PROCESSED_DIR, exist_ok=True)
os.makedirs(SOCCERDATA_CACHE_DIR, exist_ok=True)


# ── Scrape ──────────────────────────────────────────────────────────────────────

def scrape_fbref(season: str, league: str):
    logger.info(f"Connecting to FBref: {league} {season}")
    fbref = sd.FBref(leagues=league, seasons=season, data_dir=Path(SOCCERDATA_CACHE_DIR))

    logger.info("Reading schedule...")
    schedule = fbref.read_schedule()
    logger.info(f"  Found {len(schedule)} fixtures")

    # Try to read match-by-match passing/possession stats
    game_stats = {}
    for stat in ["passing", "possession", "defense", "shooting"]:
        try:
            df = fbref.read_team_match_stats(stat_type=stat)
            game_stats[stat] = df
            logger.info(f"  Read per-match {stat} stats: {len(df)} rows")
        except Exception as e:
            logger.warning(f"  Could not read per-match {stat}: {e}")

    return schedule, game_stats


# ── Normalise ───────────────────────────────────────────────────────────────────

def _safe(row, *keys, default=0, cast=float):
    for k in keys:
        v = row.get(k)
        if v is not None and str(v) not in ("", "nan", "NaN", "None"):
            try:
                return cast(v)
            except (ValueError, TypeError):
                pass
    return default


def normalise_schedule(schedule) -> list:
    matches = []
    for _, row in schedule.iterrows():
        row = row.to_dict()
        # Date
        date_raw = row.get("date") or row.get("Date") or ""
        try:
            dt = datetime.strptime(str(date_raw)[:10], "%Y-%m-%d")
            date_str = dt.strftime("%Y-%m-%d")
        except Exception:
            date_str = str(date_raw)[:10]

        home = str(row.get("home_team") or row.get("Home") or "").strip()
        away = str(row.get("away_team") or row.get("Away") or "").strip()
        if not home or not away:
            continue

        # Scores (None if unplayed)
        hg = row.get("home_goals") or row.get("Home Goals")
        ag = row.get("away_goals") or row.get("Away Goals")
        try:
            hg = int(float(hg)) if hg is not None and str(hg) not in ("", "nan") else None
        except (ValueError, TypeError):
            hg = None
        try:
            ag = int(float(ag)) if ag is not None and str(ag) not in ("", "nan") else None
        except (ValueError, TypeError):
            ag = None

        # xG
        hxg = _safe(row, "home_xg", "Home xG", "xg_home")
        axg = _safe(row, "away_xg", "Away xG", "xg_away")

        # Shots
        hs = _safe(row, "home_shots", "Home Shots", cast=int)
        as_ = _safe(row, "away_shots", "Away Shots", cast=int)
        hsot = _safe(row, "home_sot", "Home Shots on Target", cast=int)
        asot = _safe(row, "away_sot", "Away Shots on Target", cast=int)

        # Possession
        hp = _safe(row, "home_possession", "Home Possession", default=50.0)
        ap = 100.0 - hp if hp else 50.0

        matches.append({
            "date": date_str,
            "round": str(row.get("round") or row.get("Round") or ""),
            "home": home,
            "away": away,
            "home_goals": hg,
            "away_goals": ag,
            "home_xg": round(hxg, 4),
            "away_xg": round(axg, 4),
            "home_shots": hs,
            "away_shots": as_,
            "home_sot": hsot,
            "away_sot": asot,
            "home_possession": hp,
            "away_possession": ap,
            "season": SEASON_LABEL,
        })

    matches.sort(key=lambda m: m["date"])

    # Fill round numbers if missing
    if any(not m["round"] for m in matches):
        matches = _assign_rounds(matches)

    return matches


def _assign_rounds(matches: list) -> list:
    dates = sorted(set(m["date"] for m in matches))
    date_to_round: dict = {}
    rn = 0
    prev = None
    for d in dates:
        dt = datetime.strptime(d, "%Y-%m-%d")
        if prev is None or (dt - prev).days > 10:
            rn += 1
        date_to_round[d] = rn
        prev = dt
    for m in matches:
        m["round"] = str(date_to_round.get(m["date"], "1"))
    return matches


# ── Validation ──────────────────────────────────────────────────────────────────

def validate(matches: list) -> bool:
    teams = set(m["home"] for m in matches) | set(m["away"] for m in matches)
    logger.info(f"Teams found: {len(teams)}")
    logger.info(f"Teams: {sorted(teams)}")
    if len(teams) != EXPECTED_EPL_TEAM_COUNT:
        logger.warning(f"Expected {EXPECTED_EPL_TEAM_COUNT} teams, found {len(teams)}. Proceeding anyway.")
    return True


# ── Predictions ──────────────────────────────────────────────────────────────────

def build_predictions(matches: list) -> list:
    logger.info(f"Building xR predictions for {len(matches)} matches...")
    predictions = []
    now = datetime.now(timezone.utc)

    # Model uses naive datetimes — add T12:00:00 for date-only entries
    model_matches = []
    for m in matches:
        mm = dict(m)
        if len(mm["date"]) == 10:
            mm["date"] = mm["date"] + "T12:00:00"
        model_matches.append(mm)

    for i, match in enumerate(matches):
        home_team = match["home"]
        away_team = match["away"]

        kickoff_str = match["date"] + "T12:00:00+00:00" if len(match["date"]) == 10 else match["date"]
        try:
            kickoff = datetime.fromisoformat(kickoff_str)
        except Exception:
            kickoff = datetime.fromisoformat(match["date"][:10] + "T12:00:00+00:00")

        match_date_naive = kickoff.replace(tzinfo=None)

        home_form, _ = compute_rolling_form(
            model_matches, home_team, match_date_naive,
            window_size=ROLLING_WINDOW, halflife=ROLLING_WEIGHT_HALFLIFE,
        )
        away_form, _ = compute_rolling_form(
            model_matches, away_team, match_date_naive,
            window_size=ROLLING_WINDOW, halflife=ROLLING_WEIGHT_HALFLIFE,
        )

        pred_xg_home, pred_xg_away, adjustments = compute_matchup_xg(
            home_form, away_form, home_advantage=POISSON_HOME_ADVANTAGE,
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
            "show_prediction": show_prediction,
            "home_goals": match.get("home_goals"),
            "away_goals": match.get("away_goals"),
            "season": SEASON_LABEL,
        })

    logger.info(f"  Built {len(predictions)} predictions")
    return predictions


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    logger.info("=" * 60)
    logger.info(f"xR Pipeline — {LEAGUE} {SEASON_LABEL}")
    logger.info("=" * 60)

    try:
        schedule, game_stats = scrape_fbref(SEASON, LEAGUE)
        matches = normalise_schedule(schedule)
        validate(matches)

        # Save matches
        out = os.path.join(DATA_PROCESSED_DIR, "epl_matches.json")
        with open(out, "w") as f:
            json.dump(matches, f, indent=2, default=str)
        logger.info(f"✓ Matches → {out}")

        # Build predictions
        predictions = build_predictions(matches)
        out = os.path.join(DATA_PROCESSED_DIR, "epl_predictions.json")
        with open(out, "w") as f:
            json.dump(predictions, f, indent=2, default=str)
        logger.info(f"✓ Predictions → {out}")

        # Metadata
        teams = sorted(set(m["home"] for m in matches) | set(m["away"] for m in matches))
        meta = {
            "season": SEASON_LABEL,
            "league": "Premier League",
            "built_at": datetime.now().isoformat(),
            "match_count": len(matches),
            "prediction_count": len(predictions),
            "teams": teams,
            "team_count": len(teams),
        }
        out = os.path.join(DATA_PROCESSED_DIR, "season_metadata.json")
        with open(out, "w") as f:
            json.dump(meta, f, indent=2)
        logger.info(f"✓ Metadata → {out}")

        completed = sum(1 for m in matches if m["home_goals"] is not None)
        future = len(matches) - completed
        logger.info("=" * 60)
        logger.info(f"Done: {len(matches)} matches ({completed} played, {future} upcoming)")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"FATAL: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
