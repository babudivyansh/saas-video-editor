"use client";

// The Download PNG / Download CSV / Copy data menu every chart gets.
//
// Lives in its own file rather than inside ChartFrame so that ChartFrame stays
// renderable on the server and in the report builder, where there is no
// clipboard and no canvas.

import { useState } from "react";
import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import {
  downloadBlob, downloadCsv, exportFilename, seriesToText, svgToPngBlob, type ExportSeries,
} from "./export";

export interface ChartExportMenuProps {
  title: string;
  series: ExportSeries[];
  /** Returns the live SVG to rasterize. Null disables the PNG item. */
  getSvg?: () => SVGSVGElement | null;
  xLabel?: string;
}

type Status = { kind: "idle" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export function ChartExportMenu({ title, series, getSvg, xLabel = "Date" }: ChartExportMenuProps) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const announce = (kind: "done" | "error", message: string) => {
    setStatus({ kind, message });
    setTimeout(() => setStatus({ kind: "idle" }), 4000);
  };

  const png = async (close: () => void) => {
    close();
    const svg = getSvg?.();
    if (!svg) return announce("error", "This chart cannot be exported as an image.");
    try {
      downloadBlob(await svgToPngBlob(svg), exportFilename(title, "png"));
      announce("done", "Image downloaded.");
    } catch {
      announce("error", "Could not create the image.");
    }
  };

  const csv = (close: () => void) => {
    close();
    downloadCsv(series, exportFilename(title, "csv"), xLabel);
    announce("done", "CSV downloaded.");
  };

  const copy = async (close: () => void) => {
    close();
    try {
      await navigator.clipboard.writeText(seriesToText(series, xLabel));
      announce("done", "Data copied.");
    } catch {
      // Denied permission or an insecure context — both are the user's
      // environment, not a bug, so say what happened rather than failing mute.
      announce("error", "Clipboard access was blocked by your browser.");
    }
  };

  return (
    <>
      <Dropdown
        align="right"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="menu"
            className="rounded-lg px-2 py-1 text-xs text-ink-soft hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Export<span className="sr-only"> {title}</span>
          </button>
        )}
      >
        {({ close }) => (
          <>
            {getSvg && <DropdownItem onClick={() => void png(close)}>Download PNG</DropdownItem>}
            <DropdownItem onClick={() => csv(close)}>Download CSV</DropdownItem>
            <DropdownItem onClick={() => void copy(close)}>Copy data</DropdownItem>
          </>
        )}
      </Dropdown>

      {/* Downloads are otherwise invisible to a screen reader — the file lands
          in a folder with no announcement of any kind. */}
      <span role="status" aria-live="polite" className="sr-only">
        {status.kind === "idle" ? "" : status.message}
      </span>
    </>
  );
}
