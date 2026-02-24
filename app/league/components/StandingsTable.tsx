import Link from "next/link";

interface Team {
  team: string;
  played: number;
  points: number;
  gf: number;
  ga: number;
  gd: number;
}

interface Props {
  teams: Team[];
  type: "actual" | "expected";
}

export default function StandingsTable({ teams, type }: Props) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Table header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr 44px 44px 44px 44px 52px",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        fontSize: 11, fontWeight: 700, color: "var(--dim)",
        textTransform: "uppercase", letterSpacing: 0.5, gap: 4,
        background: "var(--surface-2)",
      }}>
        <span>#</span>
        <span>Club</span>
        <span style={{ textAlign: "center" }}>P</span>
        <span style={{ textAlign: "center" }}>GF</span>
        <span style={{ textAlign: "center" }}>GA</span>
        <span style={{ textAlign: "center" }}>GD</span>
        <span style={{ textAlign: "right" }}>{type === "expected" ? "xPts" : "Pts"}</span>
      </div>

      {teams.map((t, i) => {
        const gd = t.gd ?? (t.gf - t.ga);
        // Zone: UCL top 4 = bright white, UEL 5-6 = muted white, relegation = dim
        const rankColor = i < 4 ? "var(--red)" : i < 6 ? "var(--muted)" : i >= 17 ? "var(--dim)" : "var(--dim)";
        const hasLeftBorder = i < 4 || i < 6 || i >= 17;
        const leftBorderColor = i < 4 ? "var(--red)" : i < 6 ? "var(--border-2)" : i >= 17 ? "#444" : "transparent";

        return (
          <div
            key={t.team}
            style={{
              display: "grid",
              gridTemplateColumns: "32px 1fr 44px 44px 44px 44px 52px",
              padding: "10px 16px",
              gap: 4,
              alignItems: "center",
              borderTop: "1px solid var(--border)",
              borderLeft: hasLeftBorder ? `2px solid ${leftBorderColor}` : "2px solid transparent",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: rankColor }}>{i + 1}</span>
            <Link
              href={`/clubs/${encodeURIComponent(t.team)}`}
              style={{ fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none" }}
            >
              {t.team}
            </Link>
            <span style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{t.played}</span>
            <span style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{t.gf}</span>
            <span style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>{t.ga}</span>
            <span style={{
              textAlign: "center", fontSize: 12, fontWeight: 600,
              color: gd > 0 ? "#fff" : gd < 0 ? "var(--dim)" : "var(--muted)",
            }}>
              {gd > 0 ? "+" : ""}{gd}
            </span>
            <span style={{
              textAlign: "right", fontSize: 15, fontWeight: 900,
              color: i < 4 ? "#fff" : "var(--muted)",
            }}>
              {t.points}
            </span>
          </div>
        );
      })}

      {/* Zone legend */}
      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex", gap: 16, fontSize: 10, color: "var(--dim)",
        background: "var(--surface-2)",
      }}>
        <span style={{ color: "var(--red)" }}>— UCL</span>
        <span style={{ color: "var(--border-2)" }}>— UEL</span>
        <span style={{ color: "#444" }}>— Relegation</span>
      </div>
    </div>
  );
}
