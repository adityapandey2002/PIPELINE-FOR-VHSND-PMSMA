"use client";

import { useEffect, useState } from "react";
import type { DatasetSummary } from "@/contracts/dataset";
import { listDatasets } from "@/lib/storage/idb";
import { useWorkflowStore } from "@/stores/workflowStore";

export function AppDatasetPicker({ onPicked }: { onPicked?: (id: string) => void }) {
  const [datasets, setDatasets] = useState<DatasetSummary[] | null>(null);
  const setActive = useWorkflowStore((s) => s.setActiveDatasetId);

  useEffect(() => {
    let alive = true;
    listDatasets().then((d) => {
      if (alive) setDatasets(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="card">
      <h2 style={{ margin: 0 }}>Choose a dataset</h2>
      <p className="muted">Pick one of the surveys already on this machine to continue.</p>
      {datasets === null ? (
        <div className="row" style={{ marginTop: 16 }}>
          <div className="spinner" aria-hidden />
        </div>
      ) : datasets.length === 0 ? (
        <div className="empty">
          <p className="muted">Nothing here yet.</p>
          <a href="/ingest" className="btn btn-primary btn-sm">
            Import your first dataset
          </a>
        </div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rows</th>
              <th>Imported</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {datasets.map((d) => (
              <tr
                key={d.id}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setActive(d.id);
                  onPicked?.(d.id);
                }}
              >
                <td>
                  <b>{d.fileName}</b>
                  <div className="muted small">{d.name}</div>
                </td>
                <td>{d.totalRows.toLocaleString("en-IN")}</td>
                <td>{new Date(d.importedAt).toLocaleString("en-IN")}</td>
                <td className="text-right">
                  <button className="btn btn-sm btn-primary">Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}