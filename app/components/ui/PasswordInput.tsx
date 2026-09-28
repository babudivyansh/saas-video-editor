"use client";

// Password field with a show/hide toggle, built on ui/Field's Input so it gets
// the same error/hint wiring. `autoComplete` is required, not defaulted: a
// sign-in field wants "current-password" and a new-password field wants
// "new-password" (so password managers offer to generate and save), and
// guessing wrong silently breaks one of those.

import { useState } from "react";
import { Input } from "./Field";

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete"> & {
  autoComplete: "current-password" | "new-password";
  error?: string | null;
  hint?: string | null;
};

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.1 10.1 0 0 1 12 19c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export function PasswordInput({ className = "", ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={`pr-12 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        // Positioned against the input row only (not the error text under it).
        className="absolute right-1 top-[1.3rem] -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-fg-muted hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        <EyeIcon open={!visible} />
      </button>
    </div>
  );
}
