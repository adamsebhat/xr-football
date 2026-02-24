# xR Data Pipeline Documentation

## Overview

This is a complete data → features → prediction pipeline for "The xRphilosophy" Premier League xR (Expected Result) analytics app.

**Key capabilities:**
- Scrapes FBref data for 2025-26 Premier League via `soccerdata`
- Computes rolling team form (last 10 matches, exponentially weighted)
- Builds matchup-aware xG predictions (not just "good team always wins")
- Generates Poisson-based match probabilities and scoreline predictions
- Validates season/team correctness before outputting data
- Produces JSON suitable for Next.js frontend consumption

## Directory Structure

```
scripts/
├── config.py                      # Centralized season/league config
├── xr_model.py                    # Feature engineering + Poisson model
├── build_fbref_epl_2025_26.py     # Main scraper/pipeline
└── build_data.mjs                 # Node orchestrator (calls Python)

data/
└── processed/
    ├── epl_2025-26_matches.json       # Raw matches from FBref
    ├── epl_2025-26_predictions.json   # Full xR predictions
    ├── epl_matches.json               # App-friendly matches
    ├── epl_predictions.json           # App-friendly predictions
    └── season_metadata.json           # Season info & team list

app/
└── lib/
    └── xr_data.ts                 # TypeScript loaders for Next.js
```

## Installation

### 1. Install Python Dependencies

```bash
pip install -r requirements-data.txt
```

This installs:
- `soccerdata` - FBref/Understat web scraper
- `scipy` - Poisson distribution
- `numpy`, `pandas` - Data manipulation
- `selenium` - Browser automation for FBref

### 2. Install Node Dependencies (if not already done)

```bash
npm install
```

## Usage

### Build Data Pipeline

```bash
npm run build:data
```

This will:
1. Download 2025-26 Premier League data from FBref
2. Validate team list (must match expected 20 EPL teams)
3. Compute rolling form for all teams
4. Generate xR predictions for every fixture
5. Output JSON files to `data/processed/`
6. Display season metadata and team list

**Expected output:**
```
============================================================
xR Data Pipeline - 2025/26 Premier League
============================================================

[1/3] Running FBref scraper & xR model...
Found 380 fixtures
Normalized 380 matches
✓ Team validation passed

[2/3] Verifying output files...
✓ Matches: data/processed/epl_2025-26_matches.json
✓ Predictions: data/processed/epl_2025-26_predictions.json

[3/3] Building app-friendly outputs...
✓ Matches count: 380
✓ Predictions count: 380

Teams (20):
  - Arsenal
  - Aston Villa
  - ...

✓ Pipeline complete
============================================================
```

### Rebuild for Different Season

To scrape a different season, edit `scripts/config.py`:

```python
SEASON = "2024-25"  # Change from "2025-26"
EXPECTED_EPL_2024_25_TEAMS = {
    # Update expected teams for that season
}
```

Then run:
```bash
rm -rf .cache/soccerdata
npm run build:data
```

### Debug Individual Components

**Test scraper directly:**
```bash
cd scripts
python3 build_fbref_epl_2025_26.py --season 2025-26
```

**Clear cache (if data is stale):**
```bash
rm -rf .cache/soccerdata
```

## Data Schema

### Match Object

```typescript
{
  date: string;                    // ISO datetime
  round?: string;                  // Matchweek/round number
  home: string;                    // Home team name
  away: string;                    // Away team name
  home_goals?: number;             // Final score (if result known)
  away_goals?: number;
  home_xg: number;                 // Shot xG value
  away_xg: number;
  home_shots: number;
  away_shots: number;
  home_sot: number;                // Shots on target
  away_sot: number;
  season: string;                  // "2025-26"
}
```

### Prediction Object

```typescript
{
  date: string;
  kickoff_datetime: string;        // ISO (enables 72-hour unlock check)
  home: string;
  away: string;
  round?: string;
  
  // Form stats (computed from last 10 matches)
  home_form: {
    matches: number;
    xg_for: number;
    xg_against: number;
    goals: number;
    possession_pct: number;
    pass_completion_pct: number;
  };
  away_form: { ... };
  
  // Base xG from form
  base_xg_home: number;
  base_xg_away: number;
  
  // Adjusted xG after matchup considerations
  pred_xg_home: number;
  pred_xg_away: number;
  
  // Matchup adjustments breakdown
  matchup_adjustments: [
    {
      name: string;                // e.g., "Home pressing vs Away pass completion"
      magnitude: number;           // xG adjustment
      [key: string]: any;         // Explanation details
    }
  ];
  
  // Poisson-derived probabilities
  win_home_pct: number;           // 0-100
  draw_pct: number;
  win_away_pct: number;
  xpts_home: number;              // Expected points (3*win + 1*draw)
  xpts_away: number;
  
  // Scoreline probabilities
  most_likely_scoreline: [number, number];  // e.g., [2, 1]
  top_5_scorelines: [
    [2, 1, 45.2],                // [home_goals, away_goals, probability %]
    [1, 1, 22.5],
    ...
  ];
  
  // 72-hour unlock rule (for frontend)
  hours_until_kickoff: number;
  show_prediction: boolean;       // true if 0 < hours <= 72
  
  // Result (populated after match)
  home_goals?: number | null;
  away_goals?: number | null;
  
  season: string;
}
```

### Season Metadata

```typescript
{
  season: string;                 // "2025-26"
  league: string;                 // "Premier League"
  built_at: string;               // ISO datetime of build
  match_count: number;            // 380 for full EPL
  prediction_count: number;       // 380
  teams: string[];                // ["Arsenal", "Aston Villa", ...]
  team_count: number;             // 20
}
```

## Feature Engineering Details

### Rolling Form Calculation

For each team, before each match:
1. Find all previous matches for that team
2. Take the most recent 10 (or fewer if early season)
3. Apply exponential weights: most recent = highest weight
   - Weight halflife = 4 matches
   - Oldest match in window ≈ 8% weight
   - Most recent match ≈ 30% weight

4. Compute weighted average of:
   - xG for/against
   - Shots, shots on target
   - Possession %
   - Pass completion %
   - Progressive passes/carries
   - Pressures, tackles in final 3rd, interceptions
   - Crosses, corners

### Matchup-Aware xG Prediction

Base xG blends:
- Team's attacking form (60% weight)
- Opponent's defensive form (40% weight)

Then apply 3 style-of-play adjustments:

**1. Pressing vs Pass Completion**
- If Team A has high pressures + Team B has low pass completion % → boost Team A xG
- Magnitude: up to +0.3 xG

**2. Crossing Threat vs Box Defense**
- If Team A has high crosses + progressive passes, Team B has weak final-3rd defense → boost Team A xG
- Magnitude: up to +0.25 xG

**3. Possession Control vs Counter Threat**
- If Team A dominates possession but Team B has high xG per shot (efficient counters) → boost Team B xG slightly
- Magnitude: up to +0.2 xG

**4. Home Advantage**
- Fixed +0.3 xG to home team

**Bounds:**
- All predictions clamped to [0.2, 3.5] xG to prevent unrealistic values

### Poisson Scoreline Model

Given predicted xG for both teams:

1. Compute Poisson probability for each possible scoreline (0-10 goals each team)
   - P(Home i, Away j) = Poisson(home_xg, i) × Poisson(away_xg, j)

2. Aggregate:
   - P(Home Win) = Σ P(h > a)
   - P(Draw) = Σ P(h == a)
   - P(Away Win) = Σ P(h < a)

3. Compute xPoints (expected points):
   - Home xPts = 3×P(Win) + 1×P(Draw)
   - Away xPts = 3×P(Win) + 1×P(Draw)

4. Extract top 5 most likely scorelines

## Validation & Safety

### Team Sanity Check

On every build, the pipeline:
1. Extracts all unique teams from FBref data
2. Compares against `EXPECTED_EPL_2025_26_TEAMS` in `config.py`
3. **Fails build if mismatch** with clear error message

Example mismatch scenario:
```
ERROR: Team count mismatch: found 22, expected 20
Missing expected teams: {'Luton Town', 'Sheffield United'}
Unexpected teams (may be non-EPL): {'Bournemouth', 'Ipswich'}
```

**To fix:**
1. Clear cache: `rm -rf .cache/soccerdata`
2. Verify FBref has 2025-26 EPL data available
3. Update `EXPECTED_EPL_2025_26_TEAMS` if roster changed

### Data Integrity Checks

- Match count ≈ 380 (sometimes ±5 if not all played yet)
- All team names match expected set
- No NaN/null values in critical fields (xG, shots, etc.)
- Dates in chronological order
- Season label consistent across all outputs

## Frontend Integration

### Load in Next.js

```typescript
// app/some-page.tsx
import { loadPredictions, loadSeasonMetadata } from "@/lib/xr_data";

export default async function Page() {
  const predictions = loadPredictions();
  const metadata = loadSeasonMetadata();
  
  return (
    <div>
      <h1>Season: {metadata.season}</h1>
      {predictions.map(pred => (
        <div key={`${pred.home}-${pred.away}`}>
          {pred.show_prediction && (
            <p>{pred.home}: {pred.win_home_pct}% (xPts: {pred.xpts_home})</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

### TypeScript Types

All data structures have full TypeScript support via `app/lib/xr_data.ts`:

```typescript
import {
  XRMatch,
  XRPrediction,
  SeasonMetadata,
  loadMatches,
  loadPredictions,
  loadSeasonMetadata,
  getPredictionForMatch,
  getPredictionsForTeam,
  getUpcomingPredictions,
  getShowablePredictions,
} from "@/lib/xr_data";
```

## Performance Notes

- **Build time:** ~5-15 minutes (including FBref download)
- **File sizes:**
  - Matches: ~2 MB
  - Predictions: ~5 MB
- **Memory:** Python script ≈ 200-300 MB during build
- **Caching:** FBref data cached locally in `.cache/soccerdata/` (can be deleted to force fresh download)

## Troubleshooting

### Issue: "AttributeError: module 'soccerdata' has no attribute 'FBref'"

**Solution:**
```bash
pip install --upgrade soccerdata
```

### Issue: "Team count mismatch" error

**Possible causes:**
1. FBref data for 2025-26 not yet available (season not started)
2. Roster change mid-season (teams relegated/promoted)
3. Bad internet connection (partial download)

**Solutions:**
```bash
# Clear cache and retry
rm -rf .cache/soccerdata
npm run build:data

# Or manually verify FBref has data:
python3 -c "import soccerdata as sd; fb = sd.FBref(leagues='ENG-Premier League', seasons='2025-26', data_dir='.cache'); print(fb.read_schedule())"
```

### Issue: "Predictions file not found"

**Solution:**
```bash
# Run data build
npm run build:data

# Then start Next.js
npm run dev
```

### Issue: "selenium.common.exceptions.TimeoutException"

**Cause:** FBref blocked scraper (rate limiting)

**Solution:**
```bash
# Wait 1+ hour, then retry
rm -rf .cache/soccerdata
npm run build:data
```

## Citation & Credits

- **FBref data**: Football Reference (Stats Perform)
- **Scraper**: `soccerdata` library by Adin Amer et al.
- **Statistics**: xG model via StatsBomb/Understat methodology
- **Distribution**: Poisson model for match outcomes

## License

This project is for educational use. Respect FBref's terms of service when scraping.
