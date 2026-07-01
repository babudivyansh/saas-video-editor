import * as React from "react";
import { cx } from "../../utils/cx";
import { XIcon } from "../../icons";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className = "" }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          "relative z-10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white dark:bg-zinc-900",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="font-bold text-gray-900 dark:text-zinc-100">{title}</h2>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all dark:hover:bg-zinc-800"
        >
          <XIcon className="h-4 w-4" />
        </button>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
