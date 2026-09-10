"use client";

// The card everything on a dashboard sits in: title, optional subtitle, CSV
// export, fullscreen, and a "we can't measure this yet" variant.
//
// Named Panel rather than ChartContainer because it wraps tables, gauges and
// lists at least as often as it wraps charts. admin/dashboard/ui.tsx still
// exports it under the old name so no admin call site had to change.

import { useState } from "react";
import { Download, Maximize2, X } from "lucide-react";
import { downloadBlob } from "@/app/components/charts/export";

export type CsvRows = Array<Record<string, string | number | null>>;

/**
 * Rows → CSV file.
 *
 * Built on the chart kit's downloadBlob rather than a second hand-rolled
 * anchor: that one appends to the document before clicking (some browsers
 * ignore a detached anchor) and revokes on the next tick, because revoking
 * synchronously races the download start in Safari and silently produces an
 * empty file. The BOM is what makes Excel read the file as UTF-8 instead of the
 * system codepage, which mangles every non-ASCII label.
 */
export function downloadRowsCsv(filename: string, rows: CsvRows) {
  if (rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => cell(r[h])).join(","))].join("\r\n");
  downloadBlob(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), filename);
}

export function Panel({
  title,
  subtitle,
  csv,
  actions,
  children,
  className = "",
  dashed = false,
  dashedNote = "needs instrumentation",
}: {
  title: string;
  subtitle?: string;
  csv?: { filename: string; rows: CsvRows };
  /** Extra controls in the header, left of the CSV and fullscreen buttons. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** The "no data behind this yet" treatment: dashed edge, muted title, and an
   *  explicit chip, so an empty card can't be mistaken for a broken one. */
  dashed?: boolean;
  /**
   * What the dashed chip says. Defaults to admin's "needs instrumentation",
   * which is right when WE haven't built the measurement — but wrong when the
   * data simply hasn't arrived yet, which is the common case on a customer
   * dashboard. "not published yet" is a different claim from "we can't measure
   * this", and a card should make the right one.
   */
  dashedNote?: string;
}) {
  const [full, setFull] = useState(false);
  const shell = dashed
    ? "border-dashed border-line-strong"
    : "bg-panel border-line shadow-sm transition-shadow hover:shadow-md";
  const body = (
    <div
      className={`rounded-[var(--radius-card)] border p-5 ${shell} ${
        full ? "fixed inset-4 z-50 overflow-auto bg-panel" : className
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className={`text-sm font-bold ${dashed ? "text-fg-muted" : "text-fg"}`}>{title}</h2>
          {subtitle && <p className="text-[11px] text-fg-subtle">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {dashed && (
            <span className="text-[9px] font-bold uppercase tracking-wider text-fg-subtle border border-dashed border-line-strong rounded-full px-2 py-0.5">
              {dashedNote}
            </span>
          )}
          {csv && (
            <button
              onClick={() => downloadRowsCsv(csv.filename, csv.rows)}
              className="p-1.5 text-fg-subtle hover:text-brand cursor-pointer"
              title="Export CSV"
              aria-label={`Export ${title} as CSV`}
            >
              <Download size={14} />
            </button>
          )}
          {!dashed && (
            <button
              onClick={() => setFull((f) => !f)}
              className="p-1.5 text-fg-subtle hover:text-brand cursor-pointer"
              title={full ? "Close fullscreen" : "Fullscreen"}
              aria-label={full ? `Close ${title} fullscreen` : `Open ${title} fullscreen`}
            >
              {full ? <X size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
  return full ? (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={() => setFull(false)} aria-hidden />
      {body}
    </>
  ) : (
    body
  );
}
