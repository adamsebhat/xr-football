// app/lib/matchweek.ts
import type { Match } from "./normalize";

/**
 * Compute matchweek (1-38) from a sorted list of matches.
 * Groups matches by date window (typical EPL: ~10 matches per matchweek).
 * Returns the matchweek number (1-38) for a given match.
 */
export function computeMatchweekFromMatch(
  match: Match,
  allMatches: Match[]
): number {
  // Sort matches by kickoff date
  const sorted = [...allMatches].sort(
    (a, b) =>
      new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime()
  );

  // Group into matchweeks (roughly 10 matches per week)
  const matchesPerWeek = Math.ceil(sorted.length / 38);
  const matchIndex = sorted.findIndex((m) => m.id === match.id);

  if (matchIndex === -1) return 1; // fallback
  const mw = Math.floor(matchIndex / matchesPerWeek) + 1;

  // Clamp to 38
  return Math.min(mw, 38);
}

/**
 * Group matches by matchweek (1-38).
 * Returns object { "1": [matches...], "2": [...], ... }
 */
export function groupByMatchweekClamped(matches: Match[]): Record<number, Match[]> {
  const sorted = [...matches].sort(
    (a, b) =>
      new Date(a.kickoffISO).getTime() - new Date(b.kickoffISO).getTime()
  );

  const matchesPerWeek = Math.ceil(sorted.length / 38);
  const groups: Record<number, Match[]> = {};

  for (let i = 1; i <= 38; i++) {
    groups[i] = [];
  }

  sorted.forEach((match, index) => {
    const mw = Math.min(Math.floor(index / matchesPerWeek) + 1, 38);
    groups[mw].push(match);
  });

  return groups;
}

/**
 * Get the "current" matchweek (nearest upcoming or current).
 * Returns the first matchweek where at least one match hasn't been played yet,
 * or the latest matchweek if all are past.
 */
export function getCurrentMatchweek(matches: Match[]): number {
  const now = new Date();
  const groups = groupByMatchweekClamped(matches);

  // Find first matchweek with a match in the future
  for (let mw = 1; mw <= 38; mw++) {
    const mwMatches = groups[mw];
    if (mwMatches.some((m) => new Date(m.kickoffISO) > now)) {
      return mw;
    }
  }

  // All matches past, return 38
  return 38;
}

/**
 * Check if a match is within 72 hours of kickoff.
 * Used to determine if xR prediction should be shown.
 */
export function isWithin72Hours(kickoffISO: string): boolean {
  const now = new Date();
  const kickoff = new Date(kickoffISO);
  const hoursUntilKickoff =
    (kickoff.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Show xR if kickoff is in the future and within 72 hours
  return hoursUntilKickoff > 0 && hoursUntilKickoff <= 72;
}

/**
 * Parse matchweek from URL query or route params.
 * Returns 1-38, defaulting to current if invalid.
 */
export function parseMatchweekParam(
  param: string | undefined,
  currentMW: number
): number {
  if (!param) return currentMW;
  const mw = parseInt(param, 10);
  if (!Number.isFinite(mw) || mw < 1 || mw > 38) return currentMW;
  return mw;
}
