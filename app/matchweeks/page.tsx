import { loadMatches, loadPredictions, loadSeasonMetadata } from "../lib/xr_data";
import type { XRMatch, XRPrediction } from "../lib/xr_data";
import MatchweekCard from "./components/MatchweekCard";

interface PageProps {
  searchParams: Promise<{ mw?: string }>;
}

export default async function MatchweeksPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mwParam = params.mw ? parseInt(params.mw, 10) : 1;

  // Load data
  const matches = loadMatches();
  const predictions = loadPredictions();
  const metadata = loadSeasonMetadata();

  // Check if data is empty
  if (!matches || matches.length === 0) {
    return (
      <div style={{ minHeight: "100vh", padding: "32px 24px", maxWidth: 1280, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: "#fff" }}>Matchweeks</h1>
        <div style={{ marginTop: 32, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", marginBottom: 12 }}>Data not yet built. Run:</p>
          <code style={{ display: "block", background: "var(--surface-2)", padding: "10px 16px", borderRadius: 6, color: "#fff", fontSize: 13 }}>
            python3 scripts/fetch_espn_2526.py
          </code>
        </div>
      </div>
    );
  }

  // Validate matchweek (1-38)
  const selectedMW = Math.max(1, Math.min(38, mwParam || 1));

  // Group matches by round/matchweek
  const groupedMatches = groupByRound(matches);
  const groupedPredictions = groupByRound(predictions);

  // Get current matchweek (first incomplete matchweek)
  const currentMW = getCurrentMatchweek(groupedMatches);

  // Get matches for selected matchweek
  const selectedMatches = groupedMatches[selectedMW] || [];
  const selectedPredictions = groupByTeamPair(groupedPredictions[selectedMW] || [], selectedMatches);

  // Count completed matchweeks
  const completedCount = Array.from({ length: 38 })
    .map((_, i) => i + 1)
    .filter((mw) => {
      const mwMatches = groupedMatches[mw] || [];
      return mwMatches.every((m) => m.home_goals !== null && m.away_goals !== null);
    }).length;

  return (
    <div style={{ minHeight: "100vh", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "#fff" }}>
            Matchweeks
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            {metadata.season} · {completedCount}/38 matchweeks completed
          </p>
        </div>

        {/* Matchweek Selector */}
        <div style={{ marginBottom: 28, overflowX: "auto", paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 4, minWidth: "fit-content" }}>
            {Array.from({ length: 38 }).map((_, idx) => {
              const mw = idx + 1;
              const isSelected = mw === selectedMW;
              const isCurrent = mw === currentMW;
              const hasMatches = (groupedMatches[mw] || []).length > 0;

              return (
                <a
                  key={mw}
                  href={`/matchweeks?mw=${mw}`}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 400,
                    textDecoration: "none",
                    flexShrink: 0,
                    background: isSelected
                      ? "var(--red)"
                      : isCurrent
                        ? "var(--red-dim)"
                        : hasMatches
                          ? "var(--surface)"
                          : "transparent",
                    color: isSelected
                      ? "#fff"
                      : isCurrent
                        ? "var(--red)"
                        : hasMatches
                          ? "var(--muted)"
                          : "var(--dim)",
                    border: isSelected
                      ? "1px solid var(--red)"
                      : isCurrent
                        ? "1px solid var(--red-border)"
                        : "1px solid var(--border)",
                  }}
                >
                  MW {mw}
                </a>
              );
            })}
          </div>
        </div>

        {/* Matches */}
        {selectedMatches.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {selectedMatches.map((match) => {
              const pred = selectedPredictions[`${match.home}_${match.away}`];
              return (
                <MatchweekCard
                  key={`${match.home}_${match.away}`}
                  match={match}
                  prediction={pred}
                  currentMW={currentMW}
                  selectedMW={selectedMW}
                />
              );
            })}
          </div>
        ) : (
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 32, textAlign: "center", border: "1px solid var(--border)" }}>
            <p style={{ color: "var(--muted)" }}>No matches in this matchweek</p>
          </div>
        )}
      </div>
    </div>
  );
}

function groupByRound(data: any[]): Record<number, any[]> {
  const grouped: Record<number, any[]> = {};
  data.forEach((item) => {
    const round = parseInt(item.round || item.Round || "1", 10);
    if (!grouped[round]) grouped[round] = [];
    grouped[round].push(item);
  });
  return grouped;
}

function groupByTeamPair(predictions: XRPrediction[], matches: XRMatch[]): Record<string, XRPrediction> {
  const map: Record<string, XRPrediction> = {};
  predictions.forEach((pred) => {
    map[`${pred.home}_${pred.away}`] = pred;
  });
  return map;
}

function getCurrentMatchweek(grouped: Record<number, XRMatch[]>): number {
  // Find first matchweek with at least one unplayed match
  for (let mw = 1; mw <= 38; mw++) {
    const mwMatches = grouped[mw] || [];
    const hasUnplayed = mwMatches.some((m) => m.home_goals === null || m.away_goals === null);
    if (hasUnplayed) return mw;
  }
  return 1; // Default if all played
}
