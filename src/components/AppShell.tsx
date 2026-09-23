"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAppHydrated } from "@/stores/workflowStore";

const STEPS = [
  { href: "/ingest", label: "Ingest" },
  { href: "/review", label: "Review" },
  { href: "/viz", label: "Visualise" },
  { href: "/report", label: "Report" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useAppHydrated();

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="empty">
          <div className="row" style={{ justifyContent: "center" }}>
            <div className="spinner" aria-hidden />
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Opening local workspace…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="dot" aria-hidden />
          VHSND &amp; PMSMA Pipeline
        </Link>
        <nav>
          {STEPS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`nav-link${pathname === s.href ? " active" : ""}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <Link href="/" className="nav-link" title="All data lives on this machine. Nothing is uploaded.">
          Offline workspace
        </Link>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}