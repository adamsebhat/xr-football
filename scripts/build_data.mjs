#!/usr/bin/env node
/**
 * scripts/build_data.mjs
 * 
 * Orchestrates the full xR data pipeline:
 * 1. Run Python FBref scraper & prediction model
 * 2. Generate season metadata
 * 3. Validate integrity
 * 4. Output JSON for Next.js app
 * 
 * Usage:
 *   npm run build:data
 *   npm run build:data -- --no-predictions
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PYTHON_SCRIPT = path.join(__dirname, "build_fbref_epl_2025_26.py");
const SEASON = "2025-26";
const DATA_PROCESSED_DIR = path.join(ROOT, "data", "processed");

// Ensure directories exist
if (!fs.existsSync(DATA_PROCESSED_DIR)) {
  fs.mkdirSync(DATA_PROCESSED_DIR, { recursive: true });
}

console.log("\n" + "=".repeat(60));
console.log("xR Data Pipeline - 2025/26 Premier League");
console.log("=".repeat(60));

try {
  // Run Python pipeline
  console.log(`\n[1/3] Running FBref scraper & xR model...`);
  const pythonCmd = `cd "${ROOT}" && python3 "${PYTHON_SCRIPT}" --season "${SEASON}"`;
  console.log(`Command: ${pythonCmd}`);
  
  execSync(pythonCmd, { stdio: "inherit" });
  
  // Verify output files exist
  console.log(`\n[2/3] Verifying output files...`);
  
  const matchesFile = path.join(DATA_PROCESSED_DIR, `epl_${SEASON}_matches.json`);
  const predictionsFile = path.join(DATA_PROCESSED_DIR, `epl_${SEASON}_predictions.json`);
  
  if (!fs.existsSync(matchesFile)) {
    throw new Error(`Missing output: ${matchesFile}`);
  }
  console.log(`✓ Matches: ${matchesFile}`);
  
  if (!fs.existsSync(predictionsFile)) {
    throw new Error(`Missing output: ${predictionsFile}`);
  }
  console.log(`✓ Predictions: ${predictionsFile}`);
  
  // Load and validate
  console.log(`\n[3/3] Building app-friendly outputs...`);
  
  const matchesRaw = JSON.parse(fs.readFileSync(matchesFile, "utf-8"));
  const predictionsRaw = JSON.parse(fs.readFileSync(predictionsFile, "utf-8"));
  
  if (!Array.isArray(matchesRaw)) {
    throw new Error("matches.json is not an array");
  }
  if (!Array.isArray(predictionsRaw)) {
    throw new Error("predictions.json is not an array");
  }
  
  console.log(`✓ Matches count: ${matchesRaw.length}`);
  console.log(`✓ Predictions count: ${predictionsRaw.length}`);
  
  // Extract unique teams
  const teamsSet = new Set();
  for (const m of matchesRaw) {
    teamsSet.add(m.home);
    teamsSet.add(m.away);
  }
  const teams = Array.from(teamsSet).sort();
  
  // Create app-friendly versions with season metadata
  const appMatches = matchesRaw.map((m) => ({
    ...m,
    season: SEASON,
  }));
  
  const appPredictions = predictionsRaw.map((p) => ({
    ...p,
    season: SEASON,
  }));
  
  // Save app-friendly versions
  const appMatchesFile = path.join(DATA_PROCESSED_DIR, "epl_matches.json");
  const appPredictionsFile = path.join(DATA_PROCESSED_DIR, "epl_predictions.json");
  const metadataFile = path.join(DATA_PROCESSED_DIR, "season_metadata.json");
  
  fs.writeFileSync(appMatchesFile, JSON.stringify(appMatches, null, 2));
  fs.writeFileSync(appPredictionsFile, JSON.stringify(appPredictions, null, 2));
  
  const metadata = {
    season: SEASON,
    league: "Premier League",
    built_at: new Date().toISOString(),
    match_count: matchesRaw.length,
    prediction_count: predictionsRaw.length,
    teams: teams,
    team_count: teams.length,
  };
  
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
  
  console.log(`✓ Wrote app-friendly outputs:`);
  console.log(`  - ${path.relative(ROOT, appMatchesFile)}`);
  console.log(`  - ${path.relative(ROOT, appPredictionsFile)}`);
  console.log(`  - ${path.relative(ROOT, metadataFile)}`);
  
  console.log(`\nTeams (${teams.length}):`);
  teams.forEach((team) => console.log(`  - ${team}`));
  
  console.log("\n" + "=".repeat(60));
  console.log("✓ Pipeline complete");
  console.log("=".repeat(60) + "\n");
  
  process.exit(0);
} catch (error) {
  console.error("\n" + "=".repeat(60));
  console.error("✗ Pipeline failed");
  console.error("=".repeat(60));
  console.error(`Error: ${error.message}`);
  
  if (error.status) {
    console.error(`Exit code: ${error.status}`);
  }
  
  console.error("\nTroubleshooting:");
  console.error("  1. Ensure Python 3.8+ is installed: python3 --version");
  console.error("  2. Install dependencies: pip install soccerdata scipy");
  console.error("  3. Verify FBref 2025-26 data availability");
  console.error("  4. Clear cache: rm -rf .cache/soccerdata");
  console.error("  5. Run scraper directly: python3 scripts/build_fbref_epl_2025_26.py");
  
  process.exit(1);
}
