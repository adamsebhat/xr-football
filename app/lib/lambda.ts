// app/lib/lambda.ts
import { TeamForm } from "./data";
import { LeagueAverages } from "./league";

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function safeRatio(num: number, den: number, fallback = 1) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return fallback;
  const r = num / den;
  return Number.isFinite(r) ? r : fallback;
}

export function computeAttackScore(form: TeamForm, league: LeagueAverages) {
  // Always use xG (core signal)
  let score = 0;
  let wSum = 0;

  // xG for
  score += 0.60 * safeRatio(form.xg_for, league.xg, 1);
  wSum += 0.60;

  // shots & SOT only if league baselines exist
  if (league.shots > 0) {
    score += 0.20 * safeRatio(form.shots_for, league.shots, 1);
    wSum += 0.20;
  }
  if (league.sot > 0) {
    score += 0.15 * safeRatio(form.sot_for, league.sot, 1);
    wSum += 0.15;
  }

  // shot quality (xG per shot) only if shots exist
  if (form.shots_for > 0 && league.shots > 0) {
    const shotQuality = form.xg_for / Math.max(1e-6, form.shots_for);
    const leagueShotQuality = league.xg / Math.max(1e-6, league.shots);
    score += 0.05 * safeRatio(shotQuality, leagueShotQuality, 1);
    wSum += 0.05;
  }

  const normalized = wSum > 0 ? score / wSum : 1;
  return clamp(normalized, 0.6, 1.6);
}

export function computeDefenseScore(form: TeamForm, league: LeagueAverages) {
  // Defense score >1 means strong defense (concedes less than avg)
  let score = 0;
  let wSum = 0;

  // xG against (core)
  if (league.xg > 0) {
    score += 0.60 * safeRatio(league.xg, form.xg_against, 1);
    wSum += 0.60;
  } else {
    score += 0.60 * 1;
    wSum += 0.60;
  }

  if (league.shots > 0) {
    score += 0.25 * safeRatio(league.shots, form.shots_against, 1);
    wSum += 0.25;
  }
  if (league.sot > 0) {
    score += 0.15 * safeRatio(league.sot, form.sot_against, 1);
    wSum += 0.15;
  }

  const normalized = wSum > 0 ? score / wSum : 1;
  return clamp(normalized, 0.6, 1.6);
}

export function computeDisciplineAdj(form: TeamForm, league: LeagueAverages) {
  // If cards baseline missing, neutral
  if (league.cards <= 0) return 1;

  // More cards = slight penalty (small effect)
  const ratio = safeRatio(form.cards_for, league.cards, 1);
  return clamp(1 - (ratio - 1) * 0.05, 0.9, 1.05);
}

export function computeLambda(
  attack: number,
  defenseOpp: number,
  disciplineAdj: number,
  base: number
) {
  return base * attack * defenseOpp * disciplineAdj;
}

