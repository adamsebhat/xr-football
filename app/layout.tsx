import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import ClientNav from "./components/ClientNav";
import { loadSeasonMetadata } from "./lib/xr_data";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The xRphilosophy | Premier League Analytics",
  description: "Expected Result analytics for the 2025-26 Premier League — form, xG predictions, and scoreline probabilities.",
};

async function getSeasonLabel(): Promise<string> {
  try {
    const meta = loadSeasonMetadata();
    return meta.season;
  } catch {
    return "2025-26";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const season = await getSeasonLabel();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ background: "var(--bg)", color: "var(--text)" }}
      >
        {/* Header */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          borderBottom: "1px solid var(--border)",
          background: "rgba(10,10,10,0.97)",
          backdropFilter: "blur(16px)",
        }}>
          <div style={{
            maxWidth: 1280, margin: "0 auto", padding: "0 24px",
            height: 58, display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            {/* Logo */}
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "var(--red)", display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>xR</span>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", lineHeight: 1.2, letterSpacing: -0.3 }}>
                  The xRphilosophy
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1 }}>
                  Premier League {season}
                </div>
              </div>
            </Link>

            <ClientNav />
          </div>
        </header>

        <main>{children}</main>

        <footer style={{
          borderTop: "1px solid var(--border)", padding: "24px",
          textAlign: "center", color: "var(--dim)", fontSize: 11,
          marginTop: 64,
        }}>
          <p>
            The xRphilosophy · 2025-26 Premier League · Data via ESPN ·{" "}
            <Link href="/about" style={{ color: "var(--muted)" }}>About xR</Link>
            {" · "}
            <a href="https://github.com/adamsebhat/xr-football" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--muted)" }}>
              GitHub
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
