export function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "error" | "warning" | "ok";
}) {
  const color =
    tone === "error"
      ? "var(--error)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "ok"
          ? "var(--ok)"
          : "var(--text)";
  return (
    <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
      <div className="muted small" style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 2 }}>
        {typeof value === "number" ? value.toLocaleString("en-IN") : value}
      </div>
    </div>
  );
}
