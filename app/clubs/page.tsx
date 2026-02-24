import Link from "next/link";
import { loadMatches, loadSeasonMetadata } from "../lib/xr_data";

export default function ClubsPage() {
  const matches = loadMatches();
  const metadata = loadSeasonMetadata();

  if (!matches || matches.length === 0) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", marginBottom: 8 }}>No data found.</p>
          <code style={{ background: "var(--surface-2)", padding: "10px 16px", borderRadius: 6, color: "#fff", fontSize: 13 }}>
            python3 scripts/fetch_espn_2526.py
          </code>
        </div>
      </div>
    );
  }

  const clubs = Array.from(new Set(matches.flatMap((m: any) => [m.home, m.away]))).sort() as string[];

  // Quick stats per club
  const stats: Record<string, { played: number; pts: number; gf: number; ga: number }> = {};
  for (const club of clubs) stats[club] = { played: 0, pts: 0, gf: 0, ga: 0 };

  for (const m of matches) {
    const hg = m.home_goals ?? null;
    const ag = m.away_goals ?? null;
    if (hg === null || ag === null) continue;
    const h = stats[m.home];
    const a = stats[m.away];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += hg; h.ga += ag;
    a.gf += ag; a.ga += hg;
    if (hg > ag) h.pts += 3;
    else if (hg < ag) a.pts += 3;
    else { h.pts++; a.pts++; }
  }

  const ranked = clubs.slice().sort((a, b) => stats[b].pts - stats[a].pts);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "#fff" }}>
          Premier League Clubs
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
          {metadata.season} · {clubs.length} clubs
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14,
      }}>
        {ranked.map((club, i) => {
          const s = stats[club];
          const gd = s.gf - s.ga;
          return (
            <Link key={club} href={`/clubs/${encodeURIComponent(club)}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "16px 18px", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, color: "var(--red)" }}>
                      #{i + 1}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{club}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#fff" }}>{s.pts}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>pts</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--muted)" }}>
                  <span>P: <strong style={{ color: "#fff" }}>{s.played}</strong></span>
                  <span>GF: <strong style={{ color: "#fff" }}>{s.gf}</strong></span>
                  <span>GA: <strong style={{ color: "var(--muted)" }}>{s.ga}</strong></span>
                  <span>GD: <strong style={{ color: gd >= 0 ? "#fff" : "var(--dim)" }}>
                    {gd >= 0 ? "+" : ""}{gd}
                  </strong></span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
