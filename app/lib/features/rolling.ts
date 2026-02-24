// app/lib/features/rolling.ts

export type MatchRow = {
  date: string; // ISO-ish string is fine

  home_team: string;
  away_team: string;

  home_goals?: number;
  away_goals?: number;

  home_xg?: number;
  away_xg?: number;

  home_shots?: number;
  away_shots?: number;

  home_sot?: number;
  away_sot?: number;

  home_cards?: number;
  away_cards?: number;
};

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

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function toTeamPerspective(m: MatchRow, team: string) {
  const isHome = m.home_team === team;
  const isAway = m.away_team === team;
  if (!isHome && !isAway) return null;

  if (isHome) {
    return {
      date: m.date,
      xg_for: num(m.home_xg),
      xg_against: num(m.away_xg),
      shots_for: num(m.home_shots),
      shots_against: num(m.away_shots),
      sot_for: num(m.home_sot),
      sot_against: num(m.away_sot),
      cards_for: num(m.home_cards),
      cards_against: num(m.away_cards),
    };
  }

  // Away team perspective
  return {
    date: m.date,
    xg_for: num(m.away_xg),
    xg_against: num(m.home_xg),
    shots_for: num(m.away_shots),
    shots_against: num(m.home_shots),
    sot_for: num(m.away_sot),
    sot_against: num(m.home_sot),
    cards_for: num(m.away_cards),
    cards_against: num(m.home_cards),
  };
}

export function computeLastNForm(matches: MatchRow[], team: string, n: number): TeamForm {
  const sorted = [...matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const teamGames = sorted
    .map((m) => toTeamPerspective(m, team))
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const last = teamGames.slice(-n);

  const sums = last.reduce(
    (acc, r) => {
      acc.xg_for += r.xg_for;
      acc.xg_against += r.xg_against;

      acc.shots_for += r.shots_for;
      acc.shots_against += r.shots_against;

      acc.sot_for += r.sot_for;
      acc.sot_against += r.sot_against;

      acc.cards_for += r.cards_for;
      acc.cards_against += r.cards_against;

      return acc;
    },
    {
      xg_for: 0,
      xg_against: 0,
      shots_for: 0,
      shots_against: 0,
      sot_for: 0,
      sot_against: 0,
      cards_for: 0,
      cards_against: 0,
    }
  );

  const denom = last.length || 1;

  return {
    team,
    n: last.length,

    xg_for: sums.xg_for / denom,
    xg_against: sums.xg_against / denom,

    shots_for: sums.shots_for / denom,
    shots_against: sums.shots_against / denom,

    sot_for: sums.sot_for / denom,
    sot_against: sums.sot_against / denom,

    cards_for: sums.cards_for / denom,
    cards_against: sums.cards_against / denom,
  };
}

