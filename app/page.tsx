import Link from "next/link";
import {
  loadMatches,
  loadPredictions,
  loadSeasonMetadata,
  type XRMatch,
  type XRPrediction,
} from "./lib/xr_data";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeTableRows(matches: XRMatch[]) {
  type Row = {
    team: string; p: number; w: number; d: number; l: number;
    gf: number; ga: number; pts: number;
  };
  const rows = new Map<string, Row>();
  const init = (t: string) =>
    rows.set(t, { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

  for (const m of matches) {
    if (!rows.has(m.home)) init(m.home);
    if (!rows.has(m.away)) init(m.away);
    const h = rows.get(m.home)!;
    const a = rows.get(m.away)!;
    const hg = m.home_goals ?? null;
    const ag = m.away_goals ?? null;
    if (hg != null && ag != null) {
      h.p++; a.p++;
      h.gf += hg; h.ga += ag;
      a.gf += ag; a.ga += hg;
      if (hg > ag) { h.pts += 3; h.w++; a.l++; }
      else if (hg < ag) { a.pts += 3; a.w++; h.l++; }
      else { h.pts++; a.pts++; h.d++; a.d++; }
    }
  }
  return Array.from(rows.values())
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
}

function getUpcoming(matches: XRMatch[], predictions: XRPrediction[], n = 8) {
  return matches
    .filter(m => m.home_goals === null || m.away_goals === null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, n)
    .map(m => ({
      match: m,
      pred: predictions.find(p => p.home === m.home && p.away === m.away),
    }));
}

function getRecentResults(matches: XRMatch[], n = 5) {
  return matches
    .filter(m => m.home_goals !== null && m.away_goals !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, n);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(d: string): string {
  const dt = new Date(d.length === 10 ? d + "T12:00:00Z" : d);
  return `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const matches = loadMatches();
  const predictions = loadPredictions();
  const meta = loadSeasonMetadata();

  const table = computeTableRows(matches);
  const upcoming = getUpcoming(matches, predictions, 8);
  const recent = getRecentResults(matches, 5);

  const playedMatches = matches.filter(m => m.home_goals !== null);
  const totalGoals = matches.reduce((s, m) => s + (m.home_goals ?? 0) + (m.away_goals ?? 0), 0);
  const goalsPerGame = playedMatches.length > 0
    ? (totalGoals / playedMatches.length).toFixed(2) : "—";

  const currentMW = (() => {
    const byRound: Record<number, XRMatch[]> = {};
    for (const m of matches) {
      const r = parseInt(m.round ?? "1", 10);
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(m);
    }
    for (let mw = 1; mw <= 38; mw++) {
      const mwMatches = byRound[mw] ?? [];
      if (mwMatches.some(m => m.home_goals === null || m.away_goals === null)) return mw;
    }
    return 38;
  })();

  // Score upcoming fixtures by table position of teams involved (lower sum = bigger game)
  const teamRank = new Map(table.map((r, i) => [r.team, i + 1]));
  const bigGames = upcoming
    .map(u => ({
      ...u,
      interest: (teamRank.get(u.match.home) ?? 20) + (teamRank.get(u.match.away) ?? 20),
    }))
    .sort((a, b) => a.interest - b.interest)
    .slice(0, 6);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 24px" }}>

      {/* ── Hero ── */}
      <section style={{ padding: "52px 0 44px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
          <div style={{
            width: 4, height: 56, background: "var(--red)",
            borderRadius: 2, flexShrink: 0, marginTop: 2,
          }} />
          <div>
            <h1 style={{
              fontSize: 52, fontWeight: 900, lineHeight: 1.0,
              letterSpacing: -2, color: "#fff", margin: 0,
            }}>
              The xRphilosophy
            </h1>
            <div style={{
              fontSize: 11, fontWeight: 800, color: "var(--red)",
              letterSpacing: 2.5, textTransform: "uppercase", marginTop: 8,
            }}>
              Premier League {meta.season}
            </div>
          </div>
        </div>
        <p style={{
          fontSize: 15, color: "var(--muted)", maxWidth: 540,
          lineHeight: 1.8, marginBottom: 28,
        }}>
          Football analytics built on{" "}
          <strong style={{ color: "#fff" }}>Expected Results</strong> — not the scoreline.
          Rolling form, matchup-aware xG modelling, and Poisson probabilities tell you
          who <em>deserved</em> to win.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/matchweeks?mw=${currentMW}`} style={{
            padding: "10px 22px", borderRadius: 8,
            background: "var(--red)", color: "#fff",
            fontWeight: 700, fontSize: 13, textDecoration: "none",
            border: "1px solid var(--red)",
          }}>
            Matchweek {currentMW} →
          </Link>
          <Link href="/league" style={{
            padding: "10px 22px", borderRadius: 8,
            background: "transparent", color: "var(--muted)",
            fontWeight: 600, fontSize: 13, textDecoration: "none",
            border: "1px solid var(--border-2)",
          }}>
            League Table
          </Link>
          <Link href="/about" style={{
            padding: "10px 22px", borderRadius: 8,
            background: "transparent", color: "var(--muted)",
            fontWeight: 600, fontSize: 13, textDecoration: "none",
            border: "1px solid var(--border-2)",
          }}>
            What is xR?
          </Link>
        </div>
      </section>

      {/* ── Season Stats Bar ── */}
      <section style={{
        padding: "20px 0",
        borderBottom: "1px solid var(--border)",
        display: "flex", gap: 32, flexWrap: "wrap",
      }}>
        {[
          { label: "Matches Played", value: `${playedMatches.length}`, sub: `of ${matches.length}` },
          { label: "Total Goals", value: `${totalGoals}`, sub: `${goalsPerGame}/game` },
          { label: "Teams", value: `${meta.team_count ?? 20}`, sub: "Premier League" },
          { label: "Current Matchweek", value: `MW ${currentMW}`, sub: "2025-26" },
        ].map(({ label, value, sub }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </section>

      {/* ── Big Games ── */}
      <section style={{ padding: "36px 0 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 16, background: "var(--red)", borderRadius: 2 }} />
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 2.5,
              textTransform: "uppercase", color: "var(--red)",
            }}>Upcoming Fixtures</span>
          </div>
          <Link href={`/matchweeks?mw=${currentMW}`} style={{
            fontSize: 12, color: "var(--dim)", textDecoration: "none",
          }}>
            All matches →
          </Link>
        </div>

        {bigGames.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
            {bigGames.map(({ match, pred }, idx) => {
              const isFeature = idx < 2;
              const homeRank = teamRank.get(match.home) ?? 20;
              const awayRank = teamRank.get(match.away) ?? 20;
              const homeFavoured = pred
                ? pred.win_home_pct >= pred.win_away_pct
                : homeRank <= awayRank;
              const favPct = pred
                ? Math.max(pred.win_home_pct, pred.win_away_pct)
                : null;
              const favName = homeFavoured ? match.home : match.away;

              return (
                <div key={`${match.home}_${match.away}`} style={{
                  background: "var(--surface)",
                  border: `1px solid ${isFeature ? "var(--red-border)" : "var(--border)"}`,
                  borderLeft: `3px solid ${isFeature ? "var(--red)" : "var(--border-2)"}`,
                  borderRadius: 10,
                  padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 14 }}>
                    {formatDate(match.date)} · MW {match.round}
                    {isFeature && (
                      <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700,
                        padding: "2px 7px", borderRadius: 10,
                        background: "var(--red-dim)", color: "var(--red)",
                        border: "1px solid var(--red-border)",
                      }}>Featured</span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: isFeature ? 17 : 14, fontWeight: 900,
                        color: homeFavoured ? "#fff" : "var(--muted)",
                        marginBottom: 6, lineHeight: 1.2,
                      }}>
                        <Link href={`/clubs/${encodeURIComponent(match.home)}`}
                          style={{ textDecoration: "none", color: "inherit" }}>
                          {match.home}
                        </Link>
                      </div>
                      <div style={{
                        fontSize: isFeature ? 15 : 13, fontWeight: 700,
                        color: !homeFavoured ? "#fff" : "var(--muted)",
                        lineHeight: 1.2,
                      }}>
                        <Link href={`/clubs/${encodeURIComponent(match.away)}`}
                          style={{ textDecoration: "none", color: "inherit" }}>
                          {match.away}
                        </Link>
                      </div>
                    </div>
                    {favPct != null && (
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                          {favPct.toFixed(0)}%
                        </div>
                        <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>
                          {favName.split(" ")[0]} win
                        </div>
                      </div>
                    )}
                  </div>

                  {pred && (
                    <>
                      <div style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", gap: 1 }}>
                        <div style={{ flex: pred.win_home_pct, background: "var(--red)", opacity: 0.85, minWidth: 2 }} />
                        <div style={{ flex: pred.draw_pct, background: "var(--surface-3)", minWidth: 2 }} />
                        <div style={{ flex: pred.win_away_pct, background: "var(--border-2)", minWidth: 2 }} />
                      </div>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        marginTop: 6, fontSize: 10, color: "var(--dim)",
                      }}>
                        <span style={{ color: "var(--red)", fontWeight: 700 }}>{pred.win_home_pct.toFixed(0)}% H</span>
                        <span>{pred.draw_pct.toFixed(0)}% D</span>
                        <span>{pred.win_away_pct.toFixed(0)}% A</span>
                      </div>
                      {pred.top_5_scorelines && pred.top_5_scorelines.length > 0 && (
                        <div style={{ display: "flex", gap: 5, marginTop: 12, flexWrap: "wrap" }}>
                          {pred.top_5_scorelines.slice(0, 3).map((sl, i) => (
                            <span key={i} style={{
                              fontSize: 11, fontWeight: 700,
                              padding: "3px 9px", borderRadius: 5,
                              background: i === 0 ? "var(--red-dim)" : "var(--surface-2)",
                              color: i === 0 ? "var(--red)" : "var(--muted)",
                              border: `1px solid ${i === 0 ? "var(--red-border)" : "var(--border)"}`,
                            }}>
                              {sl[0]}-{sl[1]}
                              <span style={{ opacity: 0.6, fontWeight: 500, marginLeft: 3 }}>
                                {sl[2].toFixed(0)}%
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: 32, textAlign: "center",
          }}>
            <p style={{ color: "var(--muted)" }}>No upcoming fixtures scheduled.</p>
          </div>
        )}
      </section>

      {/* ── Standings + Recent Results ── */}
      <section style={{
        padding: "40px 0 48px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24,
      }}>

        {/* League Table snippet */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 16, background: "var(--red)", borderRadius: 2 }} />
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: 2.5,
                textTransform: "uppercase", color: "var(--red)",
              }}>Standings</span>
            </div>
            <Link href="/league" style={{ fontSize: 12, color: "var(--dim)", textDecoration: "none" }}>
              Full table →
            </Link>
          </div>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "28px 1fr 38px 38px 48px",
              padding: "8px 16px", background: "var(--surface-2)",
              fontSize: 10, fontWeight: 700, color: "var(--dim)",
              textTransform: "uppercase", letterSpacing: 0.5, gap: 6,
            }}>
              <span>#</span><span>Club</span>
              <span style={{ textAlign: "center" }}>P</span>
              <span style={{ textAlign: "center" }}>GD</span>
              <span style={{ textAlign: "right" }}>Pts</span>
            </div>
            {table.slice(0, 8).map((r, i) => (
              <Link key={r.team} href={`/clubs/${encodeURIComponent(r.team)}`}
                style={{ textDecoration: "none", display: "block" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "28px 1fr 38px 38px 48px",
                  padding: "9px 16px", gap: 6, alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  borderLeft: i < 4
                    ? "2px solid var(--red)"
                    : i < 6
                      ? "2px solid var(--border-2)"
                      : i >= 17
                        ? "2px solid var(--dim)"
                        : "2px solid transparent",
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: i < 4 ? "var(--red)" : "var(--dim)",
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{r.team}</span>
                  <span style={{ fontSize: 11, textAlign: "center", color: "var(--muted)" }}>{r.p}</span>
                  <span style={{
                    fontSize: 11, textAlign: "center",
                    color: r.gf - r.ga >= 0 ? "#fff" : "var(--dim)",
                  }}>
                    {r.gf - r.ga >= 0 ? "+" : ""}{r.gf - r.ga}
                  </span>
                  <span style={{
                    fontSize: 14, fontWeight: 900, textAlign: "right",
                    color: i < 4 ? "#fff" : "var(--muted)",
                  }}>{r.pts}</span>
                </div>
              </Link>
            ))}
            <div style={{
              padding: "8px 16px", fontSize: 11,
              borderTop: "1px solid var(--border)",
              textAlign: "center", background: "var(--surface-2)",
            }}>
              <Link href="/league" style={{ color: "var(--dim)", textDecoration: "none" }}>
                View all 20 clubs →
              </Link>
            </div>
          </div>
        </div>

        {/* Recent Results */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 3, height: 16, background: "var(--red)", borderRadius: 2 }} />
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: 2.5,
                textTransform: "uppercase", color: "var(--red)",
              }}>Latest Results</span>
            </div>
            <Link href="/matchweeks" style={{ fontSize: 12, color: "var(--dim)", textDecoration: "none" }}>
              All matchweeks →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map(m => {
              const homeWon = (m.home_goals ?? 0) > (m.away_goals ?? 0);
              const awayWon = (m.away_goals ?? 0) > (m.home_goals ?? 0);
              return (
                <div key={`${m.date}_${m.home}_${m.away}`} style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8, padding: "12px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 8 }}>
                    {formatDate(m.date)} · MW {m.round}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href={`/clubs/${encodeURIComponent(m.home)}`} style={{
                      flex: 1, fontSize: 13,
                      fontWeight: homeWon ? 800 : 600,
                      color: homeWon ? "#fff" : "var(--muted)",
                      textDecoration: "none",
                    }}>{m.home}</Link>
                    <div style={{
                      fontSize: 16, fontWeight: 900,
                      padding: "4px 12px",
                      background: "var(--surface-2)",
                      borderRadius: 6, color: "#fff",
                      minWidth: 52, textAlign: "center", flexShrink: 0,
                    }}>
                      {m.home_goals}–{m.away_goals}
                    </div>
                    <Link href={`/clubs/${encodeURIComponent(m.away)}`} style={{
                      flex: 1, fontSize: 13,
                      fontWeight: awayWon ? 800 : 600,
                      color: awayWon ? "#fff" : "var(--muted)",
                      textDecoration: "none", textAlign: "right",
                    }}>{m.away}</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

    </div>
  );
}
