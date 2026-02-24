"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/matchweeks", label: "Matchweeks" },
  { href: "/league",     label: "League" },
  { href: "/clubs",      label: "Clubs" },
  { href: "/about",      label: "About" },
];

export default function ClientNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/" && pathname === "/") return true;
    if (href !== "/" && pathname.startsWith(href)) return true;
    return false;
  };

  return (
    <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {links.map(({ href, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              textDecoration: "none",
              background: active ? "var(--red-dim)" : "transparent",
              color: active ? "var(--red)" : "var(--muted)",
              border: active ? "1px solid var(--red-border)" : "1px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
