/**
 * scripts/build_processed.mjs
 * 
 * Normalize raw Understat data from data_raw/sources/understat_epl.json
 * into our internal Match schema and write to data_processed/matches_epl.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Defensive normalizer that handles multiple key name formats
 */
function normalizeUnderstatEPL(rawMatches, opts = {}) {
  const season = opts.season ?? "2024-25";
  
  if (!Array.isArray(rawMatches)) {
    throw new Error("normalizeUnderstatEPL expected an array of matches.");
  }

  return rawMatches.map((m, idx) => {
    function pickString(obj, keys) {
      for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "string" && v.trim() !== "") return v.trim();
        if (typeof v === "number" && Number.isFinite(v)) return String(v);
      }
      return null;
    }

    function toNumber(v) {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (trimmed === "") return null;
        const n = Number(trimmed);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    function pickNumber(obj, keys) {
      for (const k of keys) {
        const n = toNumber(obj?.[k]);
        if (n !== null) return n;
      }
      return null;
    }

    function normalizeDateToISO(dateStr) {
      if (!dateStr) return null;
      const asDate = new Date(dateStr);
      if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
      return null;
    }

    function countIfArray(v) {
      return Array.isArray(v) ? v.length : null;
    }

    function countFromShotsStructure(m, side, rootKey) {
      const container = m?.[rootKey];
      if (!container) return null;
      const sideVal = container?.[side];
      if (Array.isArray(sideVal)) return sideVal.length;
      return null;
    }

    const matchId =
      pickString(m, ["match_id", "id", "game_id", "matchId"]) ?? `idx_${idx}`;

    const kickoffISO =
      normalizeDateToISO(
        pickString(m, ["date", "datetime", "kickoff", "kickoffISO", "utc_date"])
      ) ?? new Date().toISOString();

    const homeTeam =
      pickString(m, ["home", "h_team", "home_team", "team_h", "homeTeam"]) ??
      "Unknown Home";
    const awayTeam =
      pickString(m, ["away", "a_team", "away_team", "team_a", "awayTeam"]) ??
      "Unknown Away";

    const homeGoals =
      pickNumber(m, ["home_goals", "homeGoals"]) ??
      pickNumber(m?.goals, ["h", "home"]) ??
      pickNumber(m?.result, ["h", "home"]) ??
      null;

    const awayGoals =
      pickNumber(m, ["away_goals", "awayGoals"]) ??
      pickNumber(m?.goals, ["a", "away"]) ??
      pickNumber(m?.result, ["a", "away"]) ??
      null;

    const homeXG =
      pickNumber(m, ["home_xg", "homeXG"]) ??
      pickNumber(m?.xg, ["h", "home"]) ??
      pickNumber(m?.xG, ["h", "home"]) ??
      null;

    const awayXG =
      pickNumber(m, ["away_xg", "awayXG"]) ??
      pickNumber(m?.xg, ["a", "away"]) ??
      pickNumber(m?.xG, ["a", "away"]) ??
      null;

    const homeShots =
      pickNumber(m, ["home_shots", "homeShots"]) ??
      countIfArray(m?.shots_home) ??
      countIfArray(m?.home_shots_list) ??
      countFromShotsStructure(m, "h", "shots") ??
      null;

    const awayShots =
      pickNumber(m, ["away_shots", "awayShots"]) ??
      countIfArray(m?.shots_away) ??
      countIfArray(m?.away_shots_list) ??
      countFromShotsStructure(m, "a", "shots") ??
      null;

    const homeSOT =
      pickNumber(m, ["home_sot", "homeSOT", "home_shots_on_target"]) ??
      pickNumber(m?.sot, ["h", "home"]) ??
      pickNumber(m?.shots_on_target, ["h", "home"]) ??
      null;

    const awaySOT =
      pickNumber(m, ["away_sot", "awaySOT", "away_shots_on_target"]) ??
      pickNumber(m?.sot, ["a", "away"]) ??
      pickNumber(m?.shots_on_target, ["a", "away"]) ??
      null;

    const homeCards =
      pickNumber(m, ["home_cards", "homeCards"]) ??
      pickNumber(m?.cards, ["h", "home"]) ??
      null;

    const awayCards =
      pickNumber(m, ["away_cards", "awayCards"]) ??
      pickNumber(m?.cards, ["a", "away"]) ??
      null;

    return {
      id: `understat:${String(matchId)}`,
      league: "EPL",
      season,
      kickoffISO,
      homeTeam,
      awayTeam,
      homeGoals,
      awayGoals,
      homeXG,
      awayXG,
      homeShots,
      awayShots,
      homeSOT,
      awaySOT,
      homeCards,
      awayCards,
    };
  });
}

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const rawPath = path.join(projectRoot, "data_raw", "sources", "understat_epl.json");
  const outDir = path.join(projectRoot, "data_processed");
  const outPath = path.join(outDir, "matches_epl.json");

  console.log(`📖 Reading raw data from: ${rawPath}`);

  if (!fs.existsSync(rawPath)) {
    console.error(`❌ Raw data file not found: ${rawPath}`);
    process.exit(1);
  }

  let rawMatches;
  try {
    const raw = fs.readFileSync(rawPath, "utf-8");
    rawMatches = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to parse raw JSON:`, err.message);
    process.exit(1);
  }

  console.log(`📊 Normalizing ${rawMatches.length} matches...`);

  let matches;
  try {
    matches = normalizeUnderstatEPL(rawMatches, {
      season: "2024-25",
    });
  } catch (err) {
    console.error(`❌ Normalization failed:`, err.message);
    process.exit(1);
  }

  console.log(`✅ Normalized ${matches.length} matches`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    console.log(`📁 Created output directory: ${outDir}`);
  }

  try {
    fs.writeFileSync(outPath, JSON.stringify(matches, null, 2), "utf-8");
    console.log(`✅ Wrote processed data to: ${outPath}`);
  } catch (err) {
    console.error(`❌ Failed to write output:`, err.message);
    process.exit(1);
  }

  console.log(`\n✨ Pipeline complete. Ready to load in Next.js app.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
