// app/lib/league.ts
import { readMatchesCSV, MatchRow } from "./data";

export type LeagueAverages = {
  matches: number;
  xg: number;
  shots: number;
  sot: number;
  cards: number;
};

export function computeLeagueAverages(): LeagueAverages {
  const matches = readMatchesCSV();

  let xgTotal = 0;
  let shotsTotal = 0;
  let sotTotal = 0;
  let cardsTotal = 0;
  let teamAppearances = 0;

  for (const m of matches) {
    // each match contributes two teams
    xgTotal += m.home_xg + m.away_xg;
    shotsTotal += m.home_shots + m.away_shots;
    sotTotal += m.home_sot + m.away_sot;
    cardsTotal += m.home_cards + m.away_cards;
    teamAppearances += 2;
  }

  if (teamAppearances === 0) {
    return {
      matches: 0,
      xg: 0,
      shots: 0,
      sot: 0,
      cards: 0,
    };
  }

  return {
    matches: teamAppearances,
    xg: xgTotal / teamAppearances,
    shots: shotsTotal / teamAppearances,
    sot: sotTotal / teamAppearances,
    cards: cardsTotal / teamAppearances,
  };
}
