/**
 * scripts/build_processed.ts
 * 
 * Normalize raw Understat data from data_raw/sources/understat_epl.json
 * into our internal Match schema and write to data_processed/matches_epl.json
 */

import fs from "fs";
import path from "path";
import { normalizeUnderstatEPL, type Match } from "../app/lib/normalize";

async function main() {
  // Resolve paths relative to project root
  const projectRoot = path.resolve(__dirname, "..");
  const rawPath = path.join(projectRoot, "data_raw", "sources", "understat_epl.json");
  const outDir = path.join(projectRoot, "data_processed");
  const outPath = path.join(outDir, "matches_epl.json");

  console.log(`📖 Reading raw data from: ${rawPath}`);

  // Check if raw file exists
  if (!fs.existsSync(rawPath)) {
    console.error(`❌ Raw data file not found: ${rawPath}`);
    process.exit(1);
  }

  // Read and parse raw JSON
  let rawMatches: unknown;
  try {
    const raw = fs.readFileSync(rawPath, "utf-8");
    rawMatches = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to parse raw JSON:`, err);
    process.exit(1);
  }

  console.log(`📊 Normalizing matches...`);

  // Normalize using the schema
  let matches: Match[];
  try {
    matches = normalizeUnderstatEPL(rawMatches, {
      season: "2024-25",
      keepRaw: false,
    });
  } catch (err) {
    console.error(`❌ Normalization failed:`, err);
    process.exit(1);
  }

  console.log(`✅ Normalized ${matches.length} matches`);

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`📁 Created output directory: ${outDir}`);
  }

  // Write processed data
  try {
    fs.writeFileSync(outPath, JSON.stringify(matches, null, 2), "utf-8");
    console.log(`✅ Wrote processed data to: ${outPath}`);
  } catch (err) {
    console.error(`❌ Failed to write output:`, err);
    process.exit(1);
  }

  console.log(`\n✨ Pipeline complete. Ready to load in Next.js app.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
