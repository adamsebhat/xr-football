/**
 * app/components/MatchCard.tsx
 * Displays a single match with form and prediction
 */

import type { Match } from "../lib/normalize";

export interface MatchCardProps {
  match: Match;
  homeForm?: {
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
  awayForm?: {
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
  showXR?: boolean; // Only show xR if within 72h and in current matchweek
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "TBD";
  }
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function FormLine({
  label,
  homeVal,
  awayVal,
}: {
  label: string;
  homeVal: number;
  awayVal: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-500">{label}</span>
      <div className="flex gap-4">
        <span className="w-12 text-right text-neutral-300 font-mono">
          {homeVal.toFixed(1)}
        </span>
        <span className="w-12 text-right text-neutral-300 font-mono">
          {awayVal.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function MatchCard({
  match,
  homeForm,
  awayForm,
  showXR = false,
}: MatchCardProps) {
  const kickTime = formatTime(match.kickoffISO);
  const kickDate = formatDate(match.kickoffISO);

  // Calculate simple prediction based on xG
  const homeXG = match.homeXG ?? 0;
  const awayXG = match.awayXG ?? 0;

  return (
    <div className="card-base p-4 space-y-3">
      {/* Date & Time */}
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{kickDate}</span>
        <span className="font-mono">{kickTime}</span>
      </div>

      {/* Fixture */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 text-right">
          <div className="font-semibold text-neutral-100">{match.homeTeam}</div>
          {homeForm && (
            <div className="text-xs text-neutral-500">
              xG: {homeForm.xg_for.toFixed(1)}
            </div>
          )}
        </div>
        <div className="text-center">
          <div className="text-sm font-mono text-neutral-400">
            {match.homeGoals !== null && match.awayGoals !== null
              ? `${match.homeGoals}-${match.awayGoals}`
              : "vs"}
          </div>
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-neutral-100">{match.awayTeam}</div>
          {awayForm && (
            <div className="text-xs text-neutral-500">
              xG: {awayForm.xg_for.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* Form Stats */}
      {homeForm && awayForm && (
        <div className="border-t border-neutral-800 pt-2 space-y-1">
          <div className="text-xs text-neutral-600 font-medium">Last 10</div>
          <FormLine
            label="xG"
            homeVal={homeForm.xg_for}
            awayVal={awayForm.xg_for}
          />
          <FormLine
            label="Shots"
            homeVal={homeForm.shots_for}
            awayVal={awayForm.shots_for}
          />
          <FormLine
            label="SOT"
            homeVal={homeForm.sot_for}
            awayVal={awayForm.sot_for}
          />
        </div>
      )}

      {/* Prediction - only show if within 72h */}
      {match.homeXG !== null && match.awayXG !== null && (
        <div className="border-t border-neutral-800 pt-2">
          {showXR ? (
            <>
              <div className="text-xs text-neutral-600 font-medium mb-2">xR</div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-center rounded bg-neutral-800 bg-opacity-50 py-1">
                  <div className="text-neutral-300 font-mono">--</div>
                  <div className="text-neutral-500 text-xs">W</div>
                </div>
                <div className="text-center rounded bg-neutral-800 bg-opacity-50 py-1">
                  <div className="text-neutral-300 font-mono">--</div>
                  <div className="text-neutral-500 text-xs">D</div>
                </div>
                <div className="text-center rounded bg-neutral-800 bg-opacity-50 py-1">
                  <div className="text-neutral-300 font-mono">--</div>
                  <div className="text-neutral-500 text-xs">L</div>
                </div>
              </div>
              <div className="text-xs text-neutral-500 mt-1 text-center">
                Most likely: {Math.round(homeXG)}-{Math.round(awayXG)}
              </div>
            </>
          ) : (
            <div className="text-xs text-neutral-600 text-center py-2">
              xR available closer to kickoff
            </div>
          )}
        </div>
      )}
    </div>
  );
}
