"use client";

export interface PastelColor {
  name: string;
  hex: string;
}

export const PASTEL_COLORS: PastelColor[] = [
  { name: "Rose", hex: "#F48FB1" },
  { name: "Sky", hex: "#81D4FA" },
  { name: "Mint", hex: "#A5D6A7" },
  { name: "Lemon", hex: "#FFE082" },
  { name: "Lavender", hex: "#CE93D8" },
];

export function ColorPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (colors: string[]) => void;
}) {
  function toggle(hex: string) {
    if (selected.includes(hex)) {
      onChange(selected.filter((c) => c !== hex));
    } else {
      onChange([...selected, hex]);
    }
  }

  return (
    <div className="row-wrap" style={{ alignItems: "center", gap: 8 }}>
      <span className="muted small">Colours:</span>
      {PASTEL_COLORS.map((c) => {
        const active = selected.includes(c.hex);
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={active}
            onClick={() => toggle(c.hex)}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: c.hex,
              border: active ? "3px solid var(--text)" : "2px solid var(--border)",
              cursor: "pointer",
              padding: 0,
              boxShadow: active ? "0 0 0 2px var(--bg)" : "none",
              transition: "border-color 0.15s",
            }}
          />
        );
      })}
      {selected.length > 0 && (
        <button type="button" className="btn btn-sm" onClick={() => onChange([])} title="Reset to default colours">
          Reset
        </button>
      )}
      {selected.length === 0 && <span className="muted small">default palette</span>}
      {selected.length === 1 && <span className="muted small">single colour</span>}
      {selected.length > 1 && <span className="muted small">{selected.length} colours · cycling</span>}
    </div>
  );
}
