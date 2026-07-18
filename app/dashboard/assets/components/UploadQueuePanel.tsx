"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { UploadItem } from "../hooks/useUploadQueue";

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  uploading: "Uploading",
  paused: "Paused",
  processing: "Processing",
  done: "Done",
  duplicate: "Already in your library",
  error: "Failed",
  canceled: "Canceled",
};

interface UploadQueuePanelProps {
  items: UploadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearFinished: () => void;
}

export function UploadQueuePanel({ items, onPause, onResume, onRetry, onCancel, onDismiss, onClearFinished }: UploadQueuePanelProps) {
  if (items.length === 0) return null;
  const activeCount = items.filter((it) => it.status === "uploading" || it.status === "processing").length;

  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 bg-white rounded-[var(--radius-card)] border border-card-border shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-card-border bg-tint-violet/40">
        <span className="text-xs font-bold text-ink">
          {activeCount > 0 ? `Uploading ${activeCount} file${activeCount === 1 ? "" : "s"}…` : "Uploads"}
        </span>
        <button onClick={onClearFinished} className="text-[11px] font-semibold text-ink-soft hover:text-brand cursor-pointer">Clear finished</button>
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-card-border">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.div
              key={it.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink truncate flex-1">{it.file.name}</p>
                <span className="text-[10px] text-ink-soft/70 flex-shrink-0">{fmtSize(it.file.size)}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${it.status === "error" ? "bg-red-400" : "grad-brand"}`}
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-ink-soft/70 w-8 text-right flex-shrink-0">{it.progress}%</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-[10px] font-semibold ${it.status === "error" ? "text-red-500" : it.status === "done" ? "text-emerald-600" : "text-ink-soft"}`}>
                  {it.error ?? STATUS_LABEL[it.status]}
                </span>
                <div className="flex items-center gap-2">
                  {it.status === "uploading" && it.supportsPauseResume && (
                    <button onClick={() => onPause(it.id)} className="text-[10px] font-semibold text-ink-soft hover:text-brand cursor-pointer">Pause</button>
                  )}
                  {it.status === "paused" && (
                    <button onClick={() => onResume(it.id)} className="text-[10px] font-semibold text-brand hover:underline cursor-pointer">Resume</button>
                  )}
                  {it.status === "error" && (
                    <button onClick={() => onRetry(it.id)} className="text-[10px] font-semibold text-brand hover:underline cursor-pointer">Retry</button>
                  )}
                  {(it.status === "uploading" || it.status === "paused") && (
                    <button onClick={() => onCancel(it.id)} className="text-[10px] font-semibold text-ink-soft hover:text-red-500 cursor-pointer">Cancel</button>
                  )}
                  {(it.status === "done" || it.status === "error" || it.status === "canceled" || it.status === "duplicate") && (
                    <button onClick={() => onDismiss(it.id)} className="text-[10px] font-semibold text-ink-soft hover:text-ink cursor-pointer">Dismiss</button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
