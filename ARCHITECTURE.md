# Architecture & Flow Diagrams

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    The xRphilosophy Pipeline                     │
└─────────────────────────────────────────────────────────────────┘

BUILD TIME (npm run build:data)
─────────────────────────────────────────────────────────────────

1. FBref Data Collection
   ┌──────────────┐
   │   FBref      │  ← Web scraping via soccerdata
   │  (2025-26)   │
   └──────────────┘
          ↓
   [fixtures, xG, shots, possession, passing, defense, etc.]

2. Python Pipeline (scripts/build_fbref_epl_2025_26.py)
   ┌────────────────────────────────────┐
   │  Download & Normalize              │
   │  - Extract 380 matches             │
   │  - Parse team stats                │
   │  - Normalize field names           │
   └────────────────────────────────────┘
          ↓
   ┌────────────────────────────────────┐
   │  Validate Season                   │
   │  - Found teams vs expected (20)    │
   │  - FAIL if mismatch                │
   └────────────────────────────────────┘
          ↓
   ┌────────────────────────────────────┐
   │  Feature Engineering               │
   │  - Compute rolling form (10 matches)
   │  - Exponential weighting           │
   │  - Extract attack/defense proxies  │
   └────────────────────────────────────┘
          ↓
   ┌────────────────────────────────────┐
   │  Prediction Generation             │
   │  - Matchup-aware xG (form + style) │
   │  - Poisson scoreline model         │
   │  - Compute P(W/D/L)                │
   │  - Calculate top 5 scorelines      │
   └────────────────────────────────────┘
          ↓
   data/processed/epl_2025-26_predictions.json (+ matches.json)

3. Node Orchestrator (scripts/build_data.mjs)
   ┌────────────────────────────────────┐
   │  Validate Python outputs           │
   │  Create app-friendly versions      │
   │  Generate season_metadata.json     │
   └────────────────────────────────────┘
          ↓
   data/processed/
   ├── epl_matches.json          ← Fixtures
   ├── epl_predictions.json      ← xR predictions
   └── season_metadata.json      ← Season info


RUNTIME (npm run dev)
─────────────────────────────────────────────────────────────────

Next.js App
   ├── app/lib/xr_data.ts        → Load JSON
   ├── app/layout.tsx             → Display season label
   ├── app/matchweeks/page.tsx    → Browse fixtures
   ├── app/clubs/page.tsx         → Team list
   └── app/about/page.tsx         → Methodology

Browser
   ├── "/" (Home)
   ├── "/matchweeks" (Fixtures with predictions)
   ├── "/clubs" (Team list)
   ├── "/clubs/[team]" (Team details)
   └── "/about" (How it works)
```

## Feature Engineering Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  For Each Team + Match Date: compute_rolling_form()             │
└─────────────────────────────────────────────────────────────────┘

Historical Matches
─────────────────────────────
Match 1 (oldest)    weight: 0.08
Match 2             weight: 0.09
Match 3             weight: 0.10
Match 4             weight: 0.11
Match 5             weight: 0.12
Match 6             weight: 0.14
Match 7             weight: 0.15
Match 8             weight: 0.17
Match 9             weight: 0.18
Match 10 (recent)   weight: 0.30  ← Most recent: 4x heavier
─────────────────────────────
Total: 1.00

Weighted Aggregation (xG example)
─────────────────────────────
xG = 0.08×M1_xg + 0.09×M2_xg + ... + 0.30×M10_xg

Applied to:
  • xG for / against
  • Shots, shots on target
  • Possession %
  • Pass completion %
  • Progressive passes / carries
  • Pressures, tackles, interceptions
  • Crosses, corners


┌─────────────────────────────────────────────────────────────────┐
│  Result: TeamFormStats with 20 rolling features                 │
└─────────────────────────────────────────────────────────────────┘

TeamFormStats {
  matches_count: 10,
  xg_for: 14.2,
  xg_against: 9.1,
  shots: 127,
  possession_pct: 52.3,
  pass_completion_pct: 81.4,
  ...
}
```

## xG Prediction with Matchup Adjustments

```
┌─────────────────────────────────────────────────────────────────┐
│  compute_matchup_xg(home_form, away_form)                       │
└─────────────────────────────────────────────────────────────────┘

1. BASE xG (blend of attacking form + opponent defense)
   ────────────────────────────────────────────────
   base_home_xg = 0.6 × home_attack_form + 0.4 × (1 - away_defense_form)
   base_away_xg = 0.6 × away_attack_form + 0.4 × (1 - home_defense_form)

   Example:
   home_attack_form: 1.8 xG/match → strong
   away_defense_form: 0.9 xG allowed/match → leaky
   
   base_home_xg = 0.6 × 1.8 + 0.4 × (1 - 0.9) = 1.08 + 0.04 = 1.12


2. MATCHUP ADJUSTMENT #1: Pressing vs Pass Completion
   ────────────────────────────────────────────────
   IF home_pressures > 20 AND away_pass_pct < 75%:
     Adjustment = min(+0.3, (80 - away_pass_pct) × 0.02)
     
   Example:
   home has 25 pressures/match (aggressive)
   away completing 71% passes (struggles with pressure)
   Adjustment = min(0.3, (80 - 71) × 0.02) = min(0.3, 0.18) = +0.18
   
   home_xg += 0.18  → 1.12 + 0.18 = 1.30


3. MATCHUP ADJUSTMENT #2: Crossing Threat vs Box Defense
   ────────────────────────────────────────────────
   IF home_crossing_threat > 30 AND away_defense_weak:
     Adjustment = min(+0.25, (home_crosses - 30) × 0.01)
     
   Example:
   home has 35 crosses/match (crossing-heavy)
   away has weak final-3rd defense (9 tackles)
   Adjustment = min(0.25, (35 - 30) × 0.01) = +0.05
   
   home_xg += 0.05  → 1.30 + 0.05 = 1.35


4. MATCHUP ADJUSTMENT #3: Possession Control vs Counters
   ────────────────────────────────────────────────
   IF home_possession_dominance > 15% AND away_has_efficient_counters:
     Adjustment = min(+0.2, dominance × away_efficiency)
     
   Example:
   home controls 65% possession, away 35%
   dominance = 30%
   away_xg_per_shot = 0.18 (efficient)
   Adjustment for away = min(0.2, 0.3 × 0.18) = +0.054
   
   away_xg += 0.054  → base_away_xg + 0.054


5. HOME ADVANTAGE
   ────────────────────────────────────────────────
   home_xg += 0.3  (fixed bonus for playing at home)
   
   1.35 + 0.3 = 1.65 final home_xg


6. CLAMP TO SANE RANGE
   ────────────────────────────────────────────────
   home_xg = clamp(1.65, min=0.2, max=3.5) = 1.65 ✓
   away_xg = clamp(...,   min=0.2, max=3.5) = ...


FINAL OUTPUT
─────────────────────────────────────────────────
{
  base_xg_home: 1.12,
  base_xg_away: 0.98,
  pred_xg_home: 1.65,
  pred_xg_away: 1.03,
  matchup_adjustments: [
    { name: "Home pressing vs Away pass completion", magnitude: 0.18 },
    { name: "Home crossing threat vs Away weak defense", magnitude: 0.05 },
    { name: "Away counter threat vs Home possession", magnitude: 0.054 },
    { name: "Home advantage", magnitude: 0.3 },
  ]
}
```

## Poisson Model: xG → Probabilities

```
Given: home_xg = 1.65, away_xg = 1.03

1. COMPUTE ALL SCORELINE PROBABILITIES
   ──────────────────────────────────────
   For each scoreline (h, a) from (0,0) to (10,10):
   
   P(h, a) = Poisson(home_xg=1.65, goals=h) × Poisson(away_xg=1.03, goals=a)
   
   P(1, 65, 0) = e^-1.65 × (1.65^0 / 0!) = 0.192 × 1 = 0.192
   P(1.65, 1) = e^-1.65 × (1.65^1 / 1!) = 0.192 × 1.65 = 0.317
   P(1.65, 2) = e^-1.65 × (1.65^2 / 2!) = 0.192 × 1.361 = 0.261
   ...
   P(0, 1.03, 0) = e^-1.03 × (1.03^0 / 0!) = 0.357 × 1 = 0.357
   P(1.03, 1) = e^-1.03 × (1.03^1 / 1!) = 0.357 × 1.03 = 0.368
   ...
   
   Combined scorelines (top 5):
   P(1, 1) = 0.317 × 0.368 = 0.117 ✓ Most likely
   P(2, 1) = 0.261 × 0.368 = 0.096
   P(2, 0) = 0.261 × 0.357 = 0.093
   P(1, 0) = 0.317 × 0.357 = 0.113
   P(3, 1) = 0.143 × 0.368 = 0.053


2. AGGREGATE INTO OUTCOMES
   ──────────────────────────────────────
   P(Home Win) = Σ P(h > a) = ... = 0.391
   P(Draw)     = Σ P(h = a) = ... = 0.241
   P(Away Win) = Σ P(h < a) = ... = 0.368


3. CALCULATE EXPECTED POINTS
   ──────────────────────────────────────
   Home xPts = 3 × P(Win) + 1 × P(Draw)
             = 3 × 0.391 + 1 × 0.241
             = 1.173 + 0.241
             = 1.414 points

   Away xPts = 3 × P(Win) + 1 × P(Draw)
             = 3 × 0.368 + 1 × 0.241
             = 1.104 + 0.241
             = 1.345 points


FINAL PREDICTION OUTPUT
──────────────────────────────────────────────
{
  pred_xg_home: 1.65,
  pred_xg_away: 1.03,
  win_home_pct: 39.1,
  draw_pct: 24.1,
  win_away_pct: 36.8,
  xpts_home: 1.41,
  xpts_away: 1.35,
  most_likely_scoreline: [1, 1],
  top_5_scorelines: [
    [1, 1, 11.7],
    [2, 1, 9.6],
    [2, 0, 9.3],
    [1, 0, 11.3],
    [3, 1, 5.3],
  ]
}
```

## 72-Hour Unlock Logic

```
For each prediction:

  Current time: 2026-01-20 15:00 UTC
  Kickoff time: 2026-01-22 20:00 UTC
  
  Hours until kickoff = (2026-01-22 20:00 - 2026-01-20 15:00) / 3600
                      = 53 hours
  
  show_prediction = (0 < hours_until_kickoff <= 72)
                  = (0 < 53 <= 72)
                  = TRUE ✓ Show prediction

CASES:
───────
  hours_until_kickoff < 0     → Match already played, hide
  0 <= hours_until < 72       → Within window, SHOW
  hours_until >= 72           → >3 days away, hide
  
Example Timeline:
─────────────────
  Wed Jan 20:  Match on Wed Jan 22 (48h away) → SHOW ✓
  Tue Jan 21:  Match on Wed Jan 22 (24h away) → SHOW ✓
  Wed Jan 22 18:00: Match at 20:00 (2h away) → SHOW ✓
  Wed Jan 22 20:30: Match played          → HIDE ✗
  Tue Jan 20:  Match on Wed Jan 22 (48h away, but check again) → depends on exact time
```

## Configuration Flow

```
Single Source of Truth: scripts/config.py
───────────────────────────────────────────

SEASON = "2025-26"
LEAGUE = "ENG-Premier League"
EXPECTED_EPL_2025_26_TEAMS = {20 teams}

    ↓ Used by ↓

build_fbref_epl_2025_26.py
  • Sets download URL
  • Validates team list
  • Logs season info

xr_model.py
  • ROLLING_WINDOW = 10
  • ROLLING_WEIGHT_HALFLIFE = 4
  • POISSON_HOME_ADVANTAGE = 0.3
  • MIN_XG_PREDICTION = 0.2
  • MAX_XG_PREDICTION = 3.5

season_metadata.json (output)
  • season: "2025-26"
  • teams: [20 teams]
  • team_count: 20

app/layout.tsx
  • getSeasonLabel() → metadata.season
  • Displays "Premier League 2025-26"


To change season:
─────────────────
1. Edit SEASON in config.py
2. Update EXPECTED_EPL_*_TEAMS
3. Run: rm -rf .cache/soccerdata && npm run build:data
```

## Error Handling Flow

```
npm run build:data
    ↓
[1] Python scraper starts
    ├─ FBref download fails
    │  └─ → FATAL: Connection error
    ├─ Schedule parse fails
    │  └─ → FATAL: Unexpected data format
    ├─ Teams found != 20
    │  └─ → FATAL: Team count mismatch
    │     Instructions: clear cache, verify FBref data
    ├─ Match normalization fails
    │  └─ → FATAL: Field missing
    └─ ✓ Success → outputs predictions.json

    ↓
[2] Node orchestrator validates
    ├─ predictions.json missing
    │  └─ → ERROR: File not found
    └─ ✓ Success → converts to app-friendly versions

    ↓
[3] Frontend tries to load at runtime
    ├─ epl_predictions.json missing
    │  └─ → xr_data.ts throws: "Run npm run build:data"
    └─ ✓ Success → displays predictions
```

## Dependencies Graph

```
Frontend
  ├─ Next.js 16
  ├─ React 19
  ├─ TypeScript
  └─ Tailwind CSS

Backend (Build Time)
  ├─ Python 3.8+
  │  ├─ soccerdata (FBref scraper)
  │  ├─ scipy (Poisson)
  │  ├─ numpy (arrays)
  │  ├─ pandas (DataFrames)
  │  └─ requests (HTTP)
  │
  └─ Node 16+
     ├─ soccerdata (via Python)
     └─ JSON I/O

Data Files (Committed)
  ├─ data/processed/epl_matches.json (2 MB)
  ├─ data/processed/epl_predictions.json (5 MB)
  └─ data/processed/season_metadata.json (2 KB)

Cache (Not Committed)
  ├─ .cache/soccerdata/ (FBref downloads)
  └─ node_modules/, .next/ (build artifacts)
```

## Summary: One Command to Rule Them All

```
$ npm run build:data

Runs:
  1. Python scraper + model
  2. Generates JSON
  3. Node validation + transformation
  4. Creates season metadata
  5. Done!

Output: Ready-to-use prediction data
Ready to deploy: npm run dev
```
