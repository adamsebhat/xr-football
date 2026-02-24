import json
import os
from understatapi import UnderstatClient

SEASON = 2024
LEAGUE = "EPL"
OUT_PATH = "data_raw/sources/understat_epl.json"

os.makedirs("data_raw/sources", exist_ok=True)


def safe_float(x):
    try:
        return float(x)
    except Exception:
        return None


def normalize_shots(shots):
    """
    understatapi shot data can come back in multiple shapes depending on version/data:

    A) list of dicts: [{...,"h_a":"h"}, {...,"h_a":"a"}]
    B) dict with 'h'/'a' values as dicts: {"h": {"1": {...}}, "a": {"2": {...}}}
    C) dict with 'h'/'a' values as lists: {"h": [{...}], "a": [{...}]}

    This function returns (home_shots_list, away_shots_list) always.
    """

    # A) list-of-dicts
    if isinstance(shots, list):
        home = [s for s in shots if isinstance(s, dict) and s.get("h_a") == "h"]
        away = [s for s in shots if isinstance(s, dict) and s.get("h_a") == "a"]
        return home, away

    # B/C) dict with 'h' and 'a'
    if isinstance(shots, dict) and "h" in shots and "a" in shots:
        h = shots["h"]
        a = shots["a"]

        # h/a could be dicts or lists
        if isinstance(h, dict):
            home = list(h.values())
        elif isinstance(h, list):
            home = h
        else:
            home = []

        if isinstance(a, dict):
            away = list(a.values())
        elif isinstance(a, list):
            away = a
        else:
            away = []

        # sometimes nested dicts appear; keep only dict shots
        home = [s for s in home if isinstance(s, dict)]
        away = [s for s in away if isinstance(s, dict)]
        return home, away

    # Unknown shape
    return [], []


def main():
    all_matches = []
    skipped = 0

    # CRITICAL: never allow exceptions to escape this 'with'
    with UnderstatClient() as understat:
        try:
            matches = understat.league(LEAGUE).get_match_data(SEASON)
            print(f"Found {len(matches)} matches")

            for idx, match in enumerate(matches, start=1):
                match_id = match.get("id")

                try:
                    shots = understat.match(match_id).get_shot_data()
                    home_shots, away_shots = normalize_shots(shots)

                    record = {
                        "match_id": str(match_id),
                        "date": match.get("datetime") or match.get("date") or "",
                        "home": (match.get("h") or {}).get("title", ""),
                        "away": (match.get("a") or {}).get("title", ""),
                        "home_goals": int((match.get("goals") or {}).get("h", 0)),
                        "away_goals": int((match.get("goals") or {}).get("a", 0)),
                        "home_xg": safe_float((match.get("xG") or {}).get("h")),
                        "away_xg": safe_float((match.get("xG") or {}).get("a")),
                        "home_shots": len(home_shots),
                        "away_shots": len(away_shots),
                        # NOTE: Understat shot dicts always have "result" ("Goal", "SavedShot", etc.)
                        "home_goals_from_shots": sum(1 for s in home_shots if s.get("result") == "Goal"),
                        "away_goals_from_shots": sum(1 for s in away_shots if s.get("result") == "Goal"),
                    }

                    all_matches.append(record)

                except Exception as e:
                    skipped += 1
                    # keep it short so your terminal doesn't spam
                    if skipped <= 10:
                        print(f"Skipping match {match_id}: {type(e).__name__}: {e}")
                    continue

                if idx % 50 == 0:
                    print(f"Processed {idx} / {len(matches)}")

        except Exception as e:
            # even league fetch errors won't crash the context manager
            print(f"FATAL: {type(e).__name__}: {e}")

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_matches, f, indent=2)

    print(f"✅ Saved {len(all_matches)} matches to {OUT_PATH} (skipped {skipped})")


if __name__ == "__main__":
    main()





