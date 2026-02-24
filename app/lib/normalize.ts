// app/lib/normalize.ts

export type LeagueKey = "EPL";

export type TeamKey = string;

export interface Match {
  id: string; // stable string id (source + match id)
  league: LeagueKey;
  season: string; // "2025-26" (we can change later)
  kickoffISO: string; // ISO string
  homeTeam: TeamKey;
  awayTeam: TeamKey;

  // Result
  homeGoals: number | null;
  awayGoals: number | null;

  // Core stats (extend later)
  homeXG: number | null;
  awayXG: number | null;

  homeShots: number | null;
  awayShots: number | null;

  homeSOT: number | null;
  awaySOT: number | null;

  homeCards: number | null;
  awayCards: number | null;

  // Optional: keep raw for debugging if you want (set to undefined in prod)
  raw?: unknown;
}

/**
 * Understat scraper output can vary depending on how you saved it.
 * This normalizer is defensive: it tries multiple key names and coerces types.
 *
 * Expected input: JSON array of match objects from data_raw/sources/understat_epl.json
 */
export function normalizeUnderstatEPL(
  rawMatches: unknown,
  opts?: { season?: string; keepRaw?: boolean }
): Match[] {
  const season = opts?.season ?? "2025-26";
  const keepRaw = opts?.keepRaw ?? false;

  if (!Array.isArray(rawMatches)) {
    throw new Error("normalizeUnderstatEPL expected an array of matches.");
  }

  return rawMatches.map((m: any, idx: number) => {
    const matchId =
      pickString(m, ["match_id", "id", "game_id", "matchId"]) ??
      `idx_${idx}`;

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

    // goals can appear as:
    // - home_goals / away_goals
    // - goals: { h: 1, a: 2 }
    // - result: { home: 1, away: 2 }
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

    // xG can appear as:
    // - home_xg / away_xg
    // - xg: { h: 1.2, a: 0.9 }
    // - xG: { h: 1.2, a: 0.9 }
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

    // Shots / SOT / Cards can come as:
    // - counts (home_shots, away_shots, home_sot, away_sot, home_cards, away_cards)
    // - arrays of shot objects (shots_home, shots_away) -> count length
    // - shots may be a dict with "h" and "a"
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
      raw: keepRaw ? m : undefined,
    };
  });
}

/* ---------------- helpers ---------------- */

function pickString(obj: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    // sometimes ids come as numbers
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
}

function toNumber(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeDateToISO(dateStr: string | null): string | null {
  if (!dateStr) return null;

  // If already ISO-like
  const asDate = new Date(dateStr);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();

  return null;
}

function countIfArray(v: any): number | null {
  return Array.isArray(v) ? v.length : null;
}

/**
 * Some scraper outputs store shots like:
 * { shots: { h: [...], a: [...] } } OR { shots: { h: {..}, a: {..} } }
 * We only want a count if it's an array.
 */
function countFromShotsStructure(
  m: any,
  side: "h" | "a",
  rootKey: string
): number | null {
  const container = m?.[rootKey];
  if (!container) return null;
  const sideVal = container?.[side];
  if (Array.isArray(sideVal)) return sideVal.length;
  return null;
}
