import Link from "next/link";
import { loadMatches, loadPredictions } from "../../lib/xr_data";
import type { XRMatch } from "../../lib/xr_data";

interface PageProps {
  params: Promise<{ team: string }>;
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { team: encodedTeam } = await params;
  const teamName = decodeURIComponent(encodedTeam);

  const matches = loadMatches();
  const predictions = loadPredictions();

  if (!matches || matches.length === 0) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <BackLink />
        <EmptyCard text="No data available. Run: python3 scripts/fetch_espn_2526.py" />
      </div>
    );
  }

  const teamMatches = matches
    .filter((m: XRMatch) => m.home === teamName || m.away === teamName)
    .sort((a: XRMatch, b: XRMatch) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (teamMatches.length === 0) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        <BackLink />
        <EmptyCard text={`Club not found: ${teamName}`} />
      </div>
    );
  }

  // ── Season stats (all played matches) ─────────────────────────────────────
  const playedMatches = teamMatches.filter((m: XRMatch) =>
    m.home_goals != null && m.away_goals != null
  );

  let totalW = 0, totalD = 0, totalL = 0;
  let totalGF = 0, totalGA = 0, totalPts = 0;
  const fullForm: Array<"W" | "D" | "L"> = [];

  for (const m of playedMatches) {
    const isHome = m.home === teamName;
    const tg = (isHome ? m.home_goals : m.away_goals) ?? 0;
    const og = (isHome ? m.away_goals : m.home_goals) ?? 0;
    totalGF += tg; totalGA += og;
    if (tg > og) { totalW++; totalPts += 3; fullForm.push("W"); }
    else if (tg === og) { totalD++; totalPts++; fullForm.push("D"); }
    else { totalL++; fullForm.push("L"); }
  }

  const totalGD = totalGF - totalGA;
  const lastFive = fullForm.slice(0, 5);

  // ── Last 10 form (for avg stats) ──────────────────────────────────────────
  const lastTen = playedMatches.slice(0, 10);
  let shotsFor = 0, shotsA = 0, sotFor = 0, sotA = 0;
  for (const m of lastTen) {
    const isHome = m.home === teamName;
    shotsFor += (isHome ? m.home_shots : m.away_shots) ?? 0;
    shotsA   += (isHome ? m.away_shots : m.home_shots) ?? 0;
    sotFor   += (isHome ? m.home_sot : m.away_sot) ?? 0;
    sotA     += (isHome ? m.away_sot : m.home_sot) ?? 0;
  }
  const n = lastTen.length || 1;

  // ── Upcoming ──────────────────────────────────────────────────────────────
  const upcoming = matches
    .filter((m: XRMatch) =>
      (m.home === teamName || m.away === teamName) &&
      (m.home_goals == null || m.away_goals == null)
    )
    .sort((a: XRMatch, b: XRMatch) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  const upcomingPreds = upcoming.map((m: XRMatch) =>
    predictions.find(p => p.home === m.home && p.away === m.away)
  );

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = (d: string): string => {
    const dt = new Date(d.length === 10 ? d + "T12:00:00Z" : d);
    return `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
      <BackLink />

      {/* ── Club Header ── */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        paddingBottom: 28, marginBottom: 28,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 8 }}>
          <div style={{ width: 4, height: 42, background: "var(--red)", borderRadius: 2, flexShrink: 0, marginTop: 3 }} />
          <div>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: "#fff", margin: 0, lineHeight: 1.1 }}>
              {teamName}
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
              {playedMatches.length} matches played · 2025-26 Premier League
            </p>
          </div>
        </div>

        {/* Last 5 form */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            Form
          </span>
          <div style={{ display: "flex", gap: 5 }}>
            {lastFive.map((r, i) => {
              const bg = r === "W" ? "var(--red)" : r === "D" ? "var(--surface-3)" : "var(--dim)";
              return (
                <span key={i} style={{
                  width: 28, height: 28, borderRadius: "50%", background: bg,
                  color: "#fff", fontWeight: 800, fontSize: 12,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  border: r === "W" ? "1px solid var(--red-border)" : "1px solid var(--border-2)",
                }}>{r}</span>
              );
            })}
          </div>
          {lastFive.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--dim)" }}>No results yet</span>
          )}
        </div>
      </div>

      {/* ── Season Stats Strip ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard label="Record" value={`${totalW}W ${totalD}D ${totalL}L`} sub={`${totalPts} pts`} />
        <StatCard label="Goals" value={`${totalGF}–${totalGA}`} sub={`GD: ${totalGD >= 0 ? "+" : ""}${totalGD}`} />
        <StatCard label="Played" value={`${playedMatches.length}`} sub={`of ${teamMatches.length} scheduled`} />
        {shotsFor > 0 && (
          <StatCard
            label="Shots / match"
            value={(shotsFor / n).toFixed(1)}
            sub={`${(sotFor / n).toFixed(1)} on target`}
          />
        )}
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 36 }}>

        {/* Recent results */}
        <div>
          <SectionLabel label="Recent Results" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {playedMatches.slice(0, 6).map((m: XRMatch) => {
              const isHome = m.home === teamName;
              const tg = (isHome ? m.home_goals : m.away_goals) ?? 0;
              const og = (isHome ? m.away_goals : m.home_goals) ?? 0;
              const result = tg > og ? "W" : tg === og ? "D" : "L";
              const opp = isHome ? m.away : m.home;
              const dotBg = result === "W" ? "var(--red)" : result === "D" ? "var(--surface-3)" : "var(--dim)";
              return (
                <div key={`${m.date}_${m.home}_${m.away}`} style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderLeft: result === "W" ? "3px solid var(--red)" : "3px solid var(--border)",
                  borderRadius: 8, padding: "12px 16px",
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%", background: dotBg,
                    color: "#fff", fontWeight: 800, fontSize: 11, flexShrink: 0,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>{result}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                      {isHome ? "vs" : "@"}{" "}
                      <Link href={`/clubs/${encodeURIComponent(opp)}`}
                        style={{ color: "#fff", textDecoration: "none" }}>
                        {opp}
                      </Link>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{fmt(m.date)} · MW {m.round}</div>
                  </div>
                  <div style={{
                    fontSize: 17, fontWeight: 900, color: "#fff",
                    background: "var(--surface-2)", padding: "4px 10px", borderRadius: 6,
                    minWidth: 52, textAlign: "center",
                  }}>
                    {isHome ? `${tg}–${og}` : `${og}–${tg}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming fixtures */}
        <div>
          <SectionLabel label="Upcoming Fixtures" />
          {upcoming.length === 0 ? (
            <EmptyCard text="No upcoming fixtures" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {upcoming.map((m: XRMatch, idx: number) => {
                const isHome = m.home === teamName;
                const opp = isHome ? m.away : m.home;
                const pred = upcomingPreds[idx];
                const teamPct = pred ? (isHome ? pred.win_home_pct : pred.win_away_pct) : null;
                const drawPct = pred?.draw_pct ?? null;
                const oppPct = pred ? (isHome ? pred.win_away_pct : pred.win_home_pct) : null;
                return (
                  <div key={`${m.date}_${m.home}_${m.away}`} style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "12px 16px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                          {isHome ? "vs" : "@"}{" "}
                          <Link href={`/clubs/${encodeURIComponent(opp)}`}
                            style={{ color: "#fff", textDecoration: "none" }}>
                            {opp}
                          </Link>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                          {fmt(m.date)} · MW {m.round}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                        background: "var(--red-dim)", color: "var(--red)",
                        border: "1px solid var(--red-border)",
                      }}>Preview</span>
                    </div>
                    {teamPct != null && drawPct != null && oppPct != null ? (
                      <>
                        <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1 }}>
                          <div style={{ flex: teamPct, background: "var(--red)", opacity: 0.85, minWidth: 2 }} />
                          <div style={{ flex: drawPct, background: "var(--surface-3)", minWidth: 2 }} />
                          <div style={{ flex: oppPct, background: "var(--border-2)", minWidth: 2 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10 }}>
                          <span style={{ color: "var(--red)", fontWeight: 700 }}>{teamPct.toFixed(0)}% {teamName.split(" ")[0]}</span>
                          <span style={{ color: "var(--muted)" }}>{drawPct.toFixed(0)}% D</span>
                          <span style={{ color: "var(--muted)" }}>{oppPct.toFixed(0)}% {opp.split(" ")[0]}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Prediction unavailable</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Season Log ── */}
      <div>
        <SectionLabel label="Season Log" />
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr 56px 70px 40px",
            padding: "9px 16px", gap: 8,
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border)",
            fontSize: 10, fontWeight: 700, color: "var(--dim)",
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            <span>Date</span>
            <span>Opponent</span>
            <span>Venue</span>
            <span style={{ textAlign: "center" }}>Score</span>
            <span style={{ textAlign: "center" }}>Res</span>
          </div>
          {teamMatches.slice(0, 30).map((m: XRMatch, i: number) => {
            const isHome = m.home === teamName;
            const opp = isHome ? m.away : m.home;
            const tg = (isHome ? m.home_goals : m.away_goals) ?? null;
            const og = (isHome ? m.away_goals : m.home_goals) ?? null;
            const played = tg !== null && og !== null;
            const res = played ? (tg! > og! ? "W" : tg! === og! ? "D" : "L") : null;
            const resColor =
              res === "W" ? "var(--red)" :
              res === "D" ? "var(--muted)" :
              res === "L" ? "var(--dim)" :
              "var(--dim)";
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 56px 70px 40px",
                padding: "9px 16px", gap: 8, alignItems: "center",
                borderTop: "1px solid var(--border)",
                fontSize: 12,
              }}>
                <span style={{ color: "var(--dim)", fontSize: 11 }}>{fmt(m.date)}</span>
                <Link href={`/clubs/${encodeURIComponent(opp)}`}
                  style={{ fontWeight: 600, color: "#fff", textDecoration: "none" }}>
                  {opp}
                </Link>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: isHome ? "var(--red)" : "var(--muted)",
                }}>
                  {isHome ? "HOME" : "AWAY"}
                </span>
                <span style={{ textAlign: "center", fontWeight: 700, color: "#fff" }}>
                  {played ? (isHome ? `${tg}–${og}` : `${og}–${tg}`) : "–"}
                </span>
                <span style={{
                  textAlign: "center", fontWeight: 800,
                  color: resColor, fontSize: 13,
                }}>{res ?? "–"}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link href="/clubs" style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 13, color: "var(--muted)", textDecoration: "none",
      marginBottom: 20, fontWeight: 600,
    }}>
      ← All Clubs
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ width: 3, height: 14, background: "var(--red)", borderRadius: 2 }} />
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: 2,
        textTransform: "uppercase", color: "var(--red)",
      }}>{label}</span>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: 32, textAlign: "center", color: "var(--muted)",
    }}>{text}</div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 20px", flex: 1, minWidth: 130,
    }}>
      <div style={{
        fontSize: 10, color: "var(--dim)", textTransform: "uppercase",
        letterSpacing: 1, marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
