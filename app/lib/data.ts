// app/lib/data.ts
import fs from "fs";
import path from "path";

export type MatchRow = {
  date: string; // YYYY-MM-DD
  home: string;
  away: string;
  home_goals: number;
  away_goals: number;
  home_xg: number;
  away_xg: number;
  home_xga: number;
  away_xga: number;
  home_shots: number;
  away_shots: number;
  home_sot: number;
  away_sot: number;
  home_cards: number;
  away_cards: number;
};

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Simple CSV reader (assumes no commas inside values)
export function readMatchesCSV(): MatchRow[] {
  const filePath = path.join(process.cwd(), "app", "data", "matches_epl.csv");
  const text = fs.readFileSync(filePath, "utf8").trim();

  const lines = text.split("\n").map((l) => l.trim());
  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1);

  const idx = (name: string) => header.indexOf(name);

  const out: MatchRow[] = rows
    .filter(Boolean)
    .map((line) => {
      const c = line.split(",").map((x) => x.trim());
      return {
        date: c[idx("date")],
        home: c[idx("home")],
        away: c[idx("away")],
        home_goals: toNum(c[idx("home_goals")]),
        away_goals: toNum(c[idx("away_goals")]),
        home_xg: toNum(c[idx("home_xg")]),
        away_xg: toNum(c[idx("away_xg")]),
        home_xga: toNum(c[idx("home_xga")]),
        away_xga: toNum(c[idx("away_xga")]),
        home_shots: toNum(c[idx("home_shots")]),
        away_shots: toNum(c[idx("away_shots")]),
        home_sot: toNum(c[idx("home_sot")]),
        away_sot: toNum(c[idx("away_sot")]),
        home_cards: toNum(c[idx("home_cards")]),
        away_cards: toNum(c[idx("away_cards")]),
      };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return out;
}

// Returns the last N matches (overall) for a team BEFORE a cutoff date
export function lastNMatchesForTeam(
  matches: MatchRow[],
  team: string,
  cutoffDateISO: string,
  n = 10
): MatchRow[] {
  const cutoffMs = new Date(cutoffDateISO).getTime();

  const played = matches.filter((m) => {
    const ms = new Date(m.date).getTime();
    if (ms >= cutoffMs) return false;
    return m.home === team || m.away === team;
  });

  // last N
  return played.slice(-n);
}

export type TeamForm = {
  team: string;
  n: number;
  xg_for: number;
  xg_against: number;
  shots_for: number;
  shots_against: number;
  sot_for: number;
  sot_against: number;
  cards_for: number;
  cards_against: number;
};

export function computeTeamForm(lastMatches: MatchRow[], team: string): TeamForm {
  let xg_for = 0,
    xg_against = 0,
    shots_for = 0,
    shots_against = 0,
    sot_for = 0,
    sot_against = 0,
    cards_for = 0,
    cards_against = 0;

  for (const m of lastMatches) {
    const isHome = m.home === team;

    const teamXg = isHome ? m.home_xg : m.away_xg;
    const oppXg = isHome ? m.away_xg : m.home_xg;

    const teamShots = isHome ? m.home_shots : m.away_shots;
    const oppShots = isHome ? m.away_shots : m.home_shots;

    const teamSot = isHome ? m.home_sot : m.away_sot;
    const oppSot = isHome ? m.away_sot : m.home_sot;

    const teamCards = isHome ? m.home_cards : m.away_cards;
    const oppCards = isHome ? m.away_cards : m.home_cards;

    xg_for += teamXg;
    xg_against += oppXg;
    shots_for += teamShots;
    shots_against += oppShots;
    sot_for += teamSot;
    sot_against += oppSot;
    cards_for += teamCards;
    cards_against += oppCards;
  }

  const n = Math.max(1, lastMatches.length);

  return {
    team,
    n: lastMatches.length,
    xg_for: xg_for / n,
    xg_against: xg_against / n,
    shots_for: shots_for / n,
    shots_against: shots_against / n,
    sot_for: sot_for / n,
    sot_against: sot_against / n,
    cards_for: cards_for / n,
    cards_against: cards_against / n,
  };
}
