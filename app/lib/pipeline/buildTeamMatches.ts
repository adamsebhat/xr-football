import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const MATCHES_PATH = path.join(ROOT, "data_processed", "matches_epl.json");
const OUT_PATH = path.join(ROOT, "data_processed", "team_matches_epl.json");

type TeamMatch = {
  match_id: number | null;
  season: string | null;
  kickoff_utc: string | null;
  matchweek: number | null;
  team: string;
  opponent: string;
  is_home: boolean;

  goals_for: number | null;
  goals_against: number | null;

  xg_for: number | null;
  xg_against: number | null;

  shots_for: number | null;
  shots_against: number | null;

  sot_for: number | null;
  sot_against: number | null;

  yellow_cards: number | null;
  red_cards: number | null;
};

function buildTeamMatches() {
  if (!fs.existsSync(MATCHES_PATH)) {
    throw new Error(`Missing file: ${MATCHES_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(MATCHES_PATH, "utf-8"));
  const matches = raw.matches;

  const rows: TeamMatch[] = [];

  for (const m of matches) {
    // HOME ROW
    rows.push({
      match_id: m.id,
      season: m.season,
      kickoff_utc: m.kickoff_utc,
      matchweek: m.matchweek,

      team: m.home.team,
      opponent: m.away.team,
      is_home: true,

      goals_for: m.home.goals,
      goals_against: m.away.goals,

      xg_for: m.home.xg,
      xg_against: m.away.xg,

      shots_for: m.home.shots,
      shots_against: m.away.shots,

      sot_for: m.home.shots_on_target,
      sot_against: m.away.shots_on_target,

      yellow_cards: m.home.yellow_cards,
      red_cards: m.home.red_cards,
    });

    // AWAY ROW
    rows.push({
      match_id: m.id,
      season: m.season,
      kickoff_utc: m.kickoff_utc,
      matchweek: m.matchweek,

      team: m.away.team,
      opponent: m.home.team,
      is_home: false,

      goals_for: m.away.goals,
      goals_against: m.home.goals,

      xg_for: m.away.xg,
      xg_against: m.home.xg,

      shots_for: m.away.shots,
      shots_against: m.home.shots,

      sot_for: m.away.shots_on_target,
      sot_against: m.home.shots_on_target,

      yellow_cards: m.away.yellow_cards,
      red_cards: m.away.red_cards,
    });
  }

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        meta: {
          generated_at_utc: new Date().toISOString(),
          rows: rows.length,
        },
        team_matches: rows,
      },
      null,
      2
    )
  );

  console.log(`✅ team_matches_epl.json written`);
  console.log(`Rows: ${rows.length}`);
}

buildTeamMatches();
