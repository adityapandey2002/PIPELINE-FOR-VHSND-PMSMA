"use client";

import { useState, type ReactNode } from "react";
import { SummaryCard } from "./SummaryCard";

export interface Insight {
  label: string;
  value: number | string;
  tone?: "neutral" | "error" | "warning" | "ok";
}

export function InsightPanel({
  title,
  insights,
  children,
  defaultOpen = true,
}: {
  title: string;
  insights: Insight[];
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
        aria-expanded={open}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="muted" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
              gap: 10,
            }}
          >
            {insights.map((i) => (
              <SummaryCard key={i.label} label={i.label} value={i.value} tone={i.tone} />
            ))}
          </div>
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
        </div>
      )}
    </section>
  );
}
