import Link from "next/link";
import type { XRMatch } from "../../lib/xr_data";

interface ClubMatchCardProps {
  match: XRMatch;
  isHome: boolean;
  teamName: string;
}

export default function ClubMatchCard({
  match,
  isHome,
  teamName,
}: ClubMatchCardProps) {
  const teamGoals = isHome ? match.home_goals : match.away_goals;
  const oppGoals = isHome ? match.away_goals : match.home_goals;
  const teamXG = isHome ? match.home_xg : match.away_xg;
  const oppXG = isHome ? match.away_xg : match.home_xg;
  const opponent = isHome ? match.away : match.home;

  const isPlayed = teamGoals !== null && oppGoals !== null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const getResult = () => {
    if (!isPlayed) return "Upcoming";
    if (teamGoals! > oppGoals!) return "Win";
    if (teamGoals! < oppGoals!) return "Loss";
    return "Draw";
  };

  const resultColor = isPlayed
    ? teamGoals! > oppGoals!
      ? "bg-emerald-900 text-emerald-300"
      : teamGoals! < oppGoals!
        ? "bg-red-900 text-red-300"
        : "bg-neutral-700 text-neutral-300"
    : "bg-neutral-700 text-neutral-300";

  return (
    <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 hover:border-neutral-700 transition-colors">
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-neutral-500">{formatDate(match.date)}</div>
        <div className={`text-xs px-2 py-1 rounded font-medium ${resultColor}`}>
          {getResult()}
        </div>
      </div>

      {/* Match Info */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <Link
            href={`/clubs/${encodeURIComponent(teamName)}`}
            className="font-semibold text-emerald-400"
          >
            {teamName}
          </Link>
          {isPlayed ? (
            <div className="text-2xl font-bold text-neutral-200">{teamGoals}</div>
          ) : (
            <div className="text-xs text-neutral-500">vs</div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <Link
            href={`/clubs/${encodeURIComponent(opponent)}`}
            className="font-semibold text-blue-400"
          >
            {opponent}
          </Link>
          {isPlayed ? (
            <div className="text-2xl font-bold text-neutral-200">{oppGoals}</div>
          ) : (
            <div className="text-xs text-neutral-500">-</div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-neutral-700 pt-3 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-neutral-500">xG</span>
          <span className="font-semibold text-neutral-200">
            {teamXG.toFixed(2)} - {oppXG.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Shots</span>
          <span className="font-semibold text-neutral-200">
            {match.home_shots} - {match.away_shots}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">SOT</span>
          <span className="font-semibold text-neutral-200">
            {match.home_sot} - {match.away_sot}
          </span>
        </div>
      </div>
    </div>
  );
}
