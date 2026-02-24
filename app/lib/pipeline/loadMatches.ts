/**
 * app/lib/pipeline/loadMatches.ts
 * 
 * Server-side function to load normalized Match data from data_processed/matches_epl.json
 * Handles missing files and parse errors gracefully.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Match } from "../normalize";

/**
 * Load matches from data_processed/matches_epl.json
 * 
 * @returns { matches: Match[], error: string | null }
 *   - On success: matches array and error=null
 *   - On failure: empty array and descriptive error message
 */
export function loadProcessedMatches(): {
  matches: Match[];
  error: string | null;
} {
  const processedPath = join(
    process.cwd(),
    "data_processed",
    "matches_epl.json"
  );

  // Check if file exists
  if (!existsSync(processedPath)) {
    return {
      matches: [],
      error: `Processed data not found at ${processedPath}. Run 'npm run build:data' first.`,
    };
  }

  // Try to read and parse
  try {
    const raw = readFileSync(processedPath, "utf-8");
    const data = JSON.parse(raw);

    // Validate it's an array of Match objects
    if (!Array.isArray(data)) {
      return {
        matches: [],
        error: `Expected array of Match objects, got ${typeof data}`,
      };
    }

    // Basic validation: each item should have id, league, season
    const validated = data.filter(
      (m): m is Match =>
        typeof m === "object" &&
        m !== null &&
        typeof m.id === "string" &&
        typeof m.league === "string" &&
        typeof m.season === "string"
    );

    if (validated.length === 0) {
      return {
        matches: [],
        error: `No valid Match objects found in ${processedPath}`,
      };
    }

    if (validated.length < data.length) {
      console.warn(
        `⚠️  Loaded ${validated.length}/${data.length} matches (some skipped due to schema mismatch)`
      );
    }

    return {
      matches: validated,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      matches: [],
      error: `Failed to parse ${processedPath}: ${message}`,
    };
  }
}
