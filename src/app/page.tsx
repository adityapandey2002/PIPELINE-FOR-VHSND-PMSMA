"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import type { DatasetSummary } from "@/contracts/dataset";
import { listDatasets } from "@/lib/storage/idb";
import { useWorkflowStore } from "@/stores/workflowStore";

const STAGES = [
  {
    href: "/ingest",
    n: 1,
    title: "Ingest",
    tag: "xlsx · ods · csv",
    desc: "Drop the VHSND survey export. Source data is parsed locally and stored encrypted on this device.",
  },
  {
    href: "/review",
    n: 2,
    title: "Review & clean",
    tag: "contradictions",
    desc: "See every rejected row: contradictory entries, illegal codes, missing required answers. Drop, keep, or override with a reason.",
  },
  {
    href: "/viz",
    n: 3,
    title: "Visualise",
    tag: "indicators",
    desc: "Choose from pre-built indicators and recommended charts. Capture images for your report.",
  },
  {
    href: "/report",
    n: 4,
    title: "Report",
    tag: "PPTX + DOCX",
    desc: "Generate a slide deck and a Word summary from the cleaned dataset and audit log. Download and send as usual.",
  },
];

export default function HomePage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const setActive = useWorkflowStore((s) => s.setActiveDatasetId);
  const router = useRouter();

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
    <AppShell>
      <section className="section">
        <h1>District health survey pipeline</h1>
        <p className="muted">
          Import <b>VHSND</b> sessions, resolve contradictions, build indicators, and export a
          ready-made report — entirely on this computer. Nothing is uploaded; the browser
          application stays fully usable offline.
        </p>
      </section>

      <section className="section">
        <div
          className="row-wrap"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 14 }}
        >
          {STAGES.map((s) => (
            <Link key={s.href} href={s.href} className="card step-card">
              <div className="row" style={{ gap: 8 }}>
                <span className="badge badge-neutral mono">{s.n}</span>
                <h3 style={{ margin: 0 }}>{s.title}</h3>
              </div>
              <p className="muted small" style={{ marginTop: 8, minHeight: 48 }}>
                {s.desc}
              </p>
              <code className="mono" style={{ color: "var(--primary)" }}>
                {s.tag}
              </code>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Local datasets</h3>
          <Link href="/ingest" className="btn btn-primary btn-sm">
            New dataset
          </Link>
        </div>
        {datasets.length === 0 ? (
          <div className="empty">
            <p className="muted">No datasets on this machine yet.</p>
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
                <tr key={d.id}>
                  <td>
                    <b>{d.fileName}</b>
                    <div className="muted small">{d.name}</div>
                  </td>
                  <td>{d.totalRows.toLocaleString("en-IN")}</td>
                  <td>{new Date(d.importedAt).toLocaleString("en-IN")}</td>
                  <td className="text-right">
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setActive(d.id);
                        router.push("/review");
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ background: "var(--primary-soft)", borderColor: "var(--primary)" }}>
        <h4 style={{ color: "var(--primary)" }}>Privacy by design</h4>
        <p className="muted small" style={{ margin: 0 }}>
          Survey exports never leave this device. All datasets, corrections, charts, and drafts are
          encrypted (AES-256-GCM) and stored only in this browser&apos;s local storage. You can erase
          everything with one action from the Report step.
        </p>
      </section>
    </AppShell>
  );
}