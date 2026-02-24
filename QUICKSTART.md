# Quick Start Guide for xR Pipeline

## 5-Minute Setup

### Step 1: Install Dependencies (2 min)

```bash
# Install Node packages
npm install

# Install Python packages
pip install -r requirements-data.txt
```

Verify installations:
```bash
python3 --version        # Should be 3.8+
node --version          # Should be 16+
pip list | grep soccerdata  # Should show soccerdata installed
```

### Step 2: Build Data Pipeline (3-5 min)

```bash
npm run build:data
```

**Expected output:**
```
============================================================
xR Data Pipeline - 2025/26 Premier League
============================================================

[1/3] Running FBref scraper & xR model...
Found 380 fixtures
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
  - Bournemouth
  - Brentford
  - Brighton and Hove Albion
  - Chelsea
  - Coventry City
  - Crystal Palace
  - Everton
  - Fulham
  - Ipswich Town
  - Leicester City
  - Liverpool
  - Manchester City
  - Manchester United
  - Newcastle United
  - Nottingham Forest
  - Southampton
  - Tottenham Hotspur
  - West Ham United

✓ Pipeline complete
============================================================
```

**What happened:**
- Downloaded 2025-26 EPL schedule from FBref
- Extracted team stats (xG, possession, passing, defense, etc.)
- Computed rolling form for all teams
- Generated xR predictions with Poisson model
- Validated 20 teams were found (safety check)
- Created app-friendly JSON files

**Output files created:**
```
data/processed/
├── epl_matches.json              # 380 fixtures
├── epl_predictions.json          # 380 predictions
├── season_metadata.json          # Season info
├── epl_2025-26_matches.json      # (archived)
└── epl_2025-26_predictions.json  # (archived)
```

### Step 3: Run the App

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

**You should see:**
- Home page with "The xRphilosophy" title and season "2025-26"
- Navigation links: Matchweeks, Clubs, About
- Hero section explaining xR vs xG

## What Just Happened?

### The Data Pipeline

1. **Python scraper** (`scripts/build_fbref_epl_2025_26.py`):
   - Fetches FBref data via `soccerdata` library
   - Extracts: fixtures, xG, shots, possession, passing, defense stats
   - Validates: team list matches 2025-26 EPL
   - Outputs: `epl_2025-26_matches.json`

2. **Feature engineering** (`scripts/xr_model.py`):
   - Computes last-10 form for each team
   - Applies exponential weighting (recent matches weighted higher)
   - Calculates matchup-aware xG adjustments
   - Outputs: `epl_2025-26_predictions.json`

3. **Node orchestrator** (`scripts/build_data.mjs`):
   - Calls Python scraper
   - Validates output files
   - Creates app-friendly JSON
   - Generates `season_metadata.json`

### The Output

**Per-match prediction includes:**
- Expected result probabilities (P(Win), P(Draw), P(Loss))
- xPoints (expected points for each team)
- Most likely scoreline + top 5
- Form stats (xG for/against, possession, passing %)
- Matchup adjustment breakdown
- 72-hour unlock flag

## Exploring the Data

### Check predictions manually

```bash
# View a single prediction
cat data/processed/epl_predictions.json | python3 -m json.tool | head -100

# Count predictions
cat data/processed/epl_predictions.json | python3 -m json.tool | grep '"home":' | wc -l
# Should output: 380
```

### Load in TypeScript

```typescript
// app/lib/example-page.tsx
import { loadPredictions } from "@/lib/xr_data";

export default async function ExamplePage() {
  const predictions = loadPredictions();
  
  // Get first match
  const firstMatch = predictions[0];
  console.log(`${firstMatch.home} vs ${firstMatch.away}`);
  console.log(`Home Win: ${firstMatch.win_home_pct}%`);
  console.log(`Most likely: ${firstMatch.most_likely_scoreline.join("-")}`);
  
  return <div>{/* Use predictions here */}</div>;
}
```

## Troubleshooting

### Error: "soccerdata not installed"

```bash
pip install soccerdata scipy numpy pandas
```

### Error: "Team count mismatch"

This means the FBref data doesn't have the expected 20 EPL teams.

**Possible causes:**
1. Season hasn't started yet on FBref
2. Mid-season roster change
3. FBref rate-limiting (blocks excessive requests)

**Solutions:**
```bash
# Wait 1 hour, then clear cache and retry
rm -rf .cache/soccerdata
npm run build:data

# Or check manually:
python3 -c "import soccerdata as sd; fb = sd.FBref(leagues='ENG-Premier League', seasons='2025-26', data_dir='.cache'); df = fb.read_schedule(); print(df['Home'].nunique())"
# Should output: 20
```

### Error: "Predictions file not found"

```bash
# Rebuild data
npm run build:data

# Then restart dev server
npm run dev
```

### Slow build (10+ minutes)?

FBref download times vary. This is normal, especially on first run. Subsequent builds are faster (cached).

## Configuration

### Change Season

To scrape a different season, edit `scripts/config.py`:

```python
# Before: 2025-26
SEASON = "2024-25"

# Update team list for that season:
EXPECTED_EPL_2024_25_TEAMS = {
    # ... teams for 2024-25
}
```

Then:
```bash
rm -rf .cache/soccerdata
npm run build:data
```

### Adjust Model Parameters

Edit `scripts/config.py`:

```python
ROLLING_WINDOW = 10              # Match window size
ROLLING_WEIGHT_HALFLIFE = 4      # Recent match weighting
POISSON_HOME_ADVANTAGE = 0.3     # Home team xG boost
MIN_XG_PREDICTION = 0.2          # Minimum xG
MAX_XG_PREDICTION = 3.5          # Maximum xG
```

Then rebuild:
```bash
npm run build:data
```

## Next Steps

1. **Browse fixtures**: Visit `/matchweeks` to see predictions
2. **Explore clubs**: Visit `/clubs` to see team form
3. **Read methodology**: Visit `/about` for how xR works
4. **Integrate predictions**: Use `loadPredictions()` in your components

## Production Deployment

Before deploying:

1. **Build data locally:**
   ```bash
   npm run build:data
   ```

2. **Commit output files:**
   ```bash
   git add data/processed/epl_*.json
   ```

3. **Or use CI/CD:**
   - Add `npm run build:data` to your build step
   - Cache `.cache/soccerdata/` to speed up rebuilds

## Performance Stats

- **Build time**: 3-10 minutes (depends on FBref download speed)
- **Output size**: ~7 MB total (matches + predictions)
- **Prediction accuracy**: Varies by model calibration (see `/about` for caveats)

## Support

- See [DATA_PIPELINE.md](./DATA_PIPELINE.md) for full documentation
- Check Python scraper directly: `python3 scripts/build_fbref_epl_2025_26.py`
- Review feature engineering: `scripts/xr_model.py`

Happy predicting! ⚽📊
