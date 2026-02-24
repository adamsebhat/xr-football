"""
Centralized configuration for data pipeline.
Single source of truth for season, league, and validation.
"""

# Season configuration
# soccerdata uses "2425" format for 2024-25, "2526" for 2025-26
SEASON = "2526"          # soccerdata season key
SEASON_LABEL = "2025-26" # Display label
SEASON_START_YEAR = 2025

# League configuration
LEAGUE = "ENG-Premier League"
LEAGUE_ABBREV = "ENG"

# Expected teams for 2025-26 Premier League
# Relegation 2024-25: Ipswich, Leicester, Southampton
# Promotion 2025-26: Burnley, Sunderland, Leeds (to be confirmed from FBref)
# Validation is now flexible — we accept whatever FBref returns for the season
# so we don't block the build if one team name differs.
EXPECTED_EPL_TEAM_COUNT = 20  # Validate count only, not exact names

# Paths
DATA_RAW_DIR = "data_raw/fbref"
DATA_PROCESSED_DIR = "data/processed"
SOCCERDATA_CACHE_DIR = ".cache/soccerdata"

# Feature engineering
ROLLING_WINDOW = 10  # Last N matches for form calculation
ROLLING_WEIGHT_HALFLIFE = 4  # Matches; recent matches weighted higher

# xG prediction bounds
MIN_XG_PREDICTION = 0.2
MAX_XG_PREDICTION = 3.5

# Poisson model parameters
POISSON_HOME_ADVANTAGE = 0.3  # Added to home xG predictions
