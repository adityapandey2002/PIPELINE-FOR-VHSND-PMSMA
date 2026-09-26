"use client";

import { useMemo, useState } from "react";
import type { DatasetSnapshot, CellValue } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import { keyedViolations } from "@/contracts/violation";
import { columnLabel } from "@/schema/columns-vhsnd";
import { getDatasetSchema } from "@/schema";
import { buildFieldCoercer } from "@/schema/engine/normalize";
import { useResolutionStore } from "@/stores/resolutionStore";

type Decision = "keep" | "drop" | "override";

export function RowDrawer({
  rowId,
  dataset,
  violations,
  onClose,
}: {
  rowId: string;
  dataset: DatasetSnapshot;
  violations: Violation[];
  onClose: () => void;
}) {
  const resolutions = useResolutionStore((s) => s.byRow);
  const setResolution = useResolutionStore((s) => s.setResolution);
  const row = dataset.rows.find((r) => r.id === rowId);
  const existing = resolutions[rowId];

  const errorCodes = useMemo(
    () => [...new Set(violations.filter((v) => v.severity === "error").map((v) => v.code))],
    [violations],
  );
  const listed = useMemo(() => keyedViolations(violations), [violations]);
  const acknowledged = useMemo(() => new Set(existing?.keptViolations ?? []), [existing]);
  const coercer = useMemo(
    () => buildFieldCoercer(getDatasetSchema(dataset.schemaVersion, dataset.kind).fields),
    [dataset.schemaVersion, dataset.kind],
  );

  const [decision, setDecision] = useState<Decision>(
    existing?.status === "drop" ? "drop" : existing?.status === "override" ? "override" : "keep",
  );
  const [ackCodes, setAckCodes] = useState<string[]>(errorCodes.filter((c) => !acknowledged.has(c)));
  const [ackAll, setAckAll] = useState(errorCodes.length > 0 && acknowledged.has("__all"));
  const [overrideField, setOverrideField] = useState<string>(
    Object.keys(row?.values ?? {})[0] ?? "",
  );
  const [overrideValue, setOverrideValue] = useState("");
  const [justification, setJustification] = useState(existing?.justification ?? "");
  const [error, setError] = useState<string | null>(null);

  if (!row) {
    return (
      <div className="card" style={{ borderColor: "var(--error)" }}>
        <p className="small">Row {rowId} no longer exists.</p>
        <button className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
    );
  }

  const decisionError = decision === "drop" || decision === "override" ? justification.trim().length > 0 ? null : "A written reason is required for the audit trail." : null;
  const overrideError =
    decision === "override"
      ? overrideValue.trim() === ""
        ? "Enter a replacement value."
        : coercer.reject(overrideField, overrideValue.trim() as CellValue)
      : null;
  const fieldError = overrideError;

  function toggleCode(code: string) {
    setAckCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  async function save() {
    setError(null);
    if (decision === "keep") {
      const codes = ackAll ? ["__all"] : ackCodes;
      if (codes.length === 0 && errorCodes.length > 0) {
        setError("Acknowledge at least one error, or choose to keep without acknowledging (stays unresolved).");
        return;
      }
      await setResolution(dataset.id, rowId, {
        rowId,
        status: "keep",
        keptViolations: [...acknowledged, ...codes],
        justification: justification.trim() || undefined,
        decidedAt: new Date().toISOString(),
        decidedBy: "user",
      });
      onClose();
      return;
    }
    if (decisionError) {
      setError(decisionError);
      return;
    }
    if (decision === "drop") {
      await setResolution(dataset.id, rowId, {
        rowId,
        status: "drop",
        justification: justification.trim(),
        decidedAt: new Date().toISOString(),
        decidedBy: "user",
      });
      onClose();
      return;
    }
    if (fieldError) {
      setError(fieldError);
      return;
    }
    const overrides = {
      ...(existing?.overrides ?? {}),
      [overrideField]: coercer.coerce(overrideField, overrideValue.trim() as CellValue),
    };
    await setResolution(dataset.id, rowId, {
      rowId,
      status: "override",
      overrides,
      justification: justification.trim(),
      decidedAt: new Date().toISOString(),
      decidedBy: "user",
    });
    onClose();
  }

  return (
    <div
      className="card"
      style={{
        position: "sticky",
        bottom: 12,
        borderColor: "var(--primary)",
        maxHeight: "70vh",
        overflow: "auto",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Row {rowId}</h3>
        <div className="row">
          {existing && existing.status !== "pending" && (
            <span className={`badge badge-${existing.status === "keep" ? "ok" : existing.status === "drop" ? "neutral" : "info"}`}>
              {existing.status}
            </span>
          )}
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>

      {violations.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {listed.map(({ violation: v, key }) => (
            <div
              key={key}
              className="row row-wrap"
              style={{ alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid var(--border)" }}
            >
              <span className={`badge badge-${v.severity}`}>{v.severity}</span>
              <span className="mono small">{v.code}</span>
              <span className="small flex-1">{v.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row mt-16">
        <span className="muted small" style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 }}>
          Decision:
        </span>
        <button className={`btn btn-sm${decision === "keep" ? " btn-primary" : ""}`} onClick={() => setDecision("keep")}>
          Keep
        </button>
        <button className={`btn btn-sm${decision === "drop" ? " btn-danger" : ""}`} onClick={() => setDecision("drop")}>
          Drop
        </button>
        <button className={`btn btn-sm${decision === "override" ? " btn-accent" : ""}`} onClick={() => setDecision("override")}>
          Override
        </button>
      </div>

      <div className="col mt-16" style={{ maxWidth: 640 }}>
        {decision === "keep" && errorCodes.length > 0 && (
          <div className="col">
            <label className="field-label">Acknowledge errors before keeping (optional but recommended)</label>
            <div className="row row-wrap">
              <label className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={ackAll}
                  onChange={(e) => setAckAll(e.target.checked)}
                />
                All ({errorCodes.length})
              </label>
              {errorCodes.map((c) => (
                <label key={c} className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!ackAll && ackCodes.includes(c)}
                    disabled={ackAll}
                    onChange={() => toggleCode(c)}
                  />
                  <span className="mono">{c}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {decision === "override" && (
          <div className="row row-wrap">
            <div style={{ flex: "1 1 220px" }}>
              <label className="field-label">Field</label>
              <select
                value={overrideField}
                onChange={(e) => setOverrideField(e.target.value)}
                style={{ width: "100%" }}
              >
                {Object.keys(row.values).map((code) => (
                  <option key={code} value={code}>
                    {code} — {columnLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <label className="field-label">New value</label>
              <input
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                placeholder="Corrected value"
              />
            </div>
          </div>
        )}

        <div>
          <label className="field-label">Reason (required for drop / override, optional for keep)</label>
          <textarea
            rows={2}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="e.g. Enumerator mis-keyed the blood pressure value; corrected from register."
          />
        </div>

        {error && (
          <p className="small" style={{ color: "var(--error)", margin: 0 }}>{error}</p>
        )}

        <div className="row">
          <button className="btn btn-primary" onClick={save}>Save decision</button>
          {existing && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                await setResolution(dataset.id, rowId, {
                  rowId,
                  status: "pending",
                  decidedAt: new Date().toISOString(),
                  decidedBy: "user",
                });
                onClose();
              }}
            >
              Reset to pending
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Row values</h4>
        <table className="data" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(row.values)
              .filter(([, v]) => v !== null && v !== "")
              .map(([code, v]) => {
                const touched = overrideField === code;
                return (
                  <tr key={code} style={touched ? { background: "var(--info-soft)" } : undefined}>
                    <td className="mono">{code}</td>
                    <td>{columnLabel(code)}</td>
                    <td>{formatValue(v)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatValue(v: CellValue): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "1" : "0";
  return String(v);
}
