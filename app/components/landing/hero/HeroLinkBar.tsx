"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { withNextParam } from "@/lib/safe-redirect";

// The hero's real way in: paste a video link (or choose to upload) and get
// clips. It hands off to AutoClip, which already takes a
// pasted link as ?url= (the Home launch box uses the same door). Visitors who
// are signed out go through /register?next=…, so the link survives sign-up;
// nothing is fetched or sent from this page.

const AUTOCLIP = "/dashboard/create/auto-clip";

function isVideoLink(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const IcPlusCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export default function HeroLinkBar() {
  const router = useRouter();
  const { user } = useAuth();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const go = (dest: string) => router.push(user ? dest : withNextParam("/register", dest));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = link.trim();
    if (!value) return go(AUTOCLIP);
    if (!isVideoLink(value)) {
      setError("Paste a full video link, like https://youtube.com/watch?v=…");
      return;
    }
    go(`${AUTOCLIP}?url=${encodeURIComponent(value)}`);
  };

  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-2">
      <form
        onSubmit={submit}
        noValidate
        className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-2 p-[5px] pl-3 shadow-[0_0_0_1px_var(--line-strong),0_12px_32px_-14px_rgba(0,0,0,0.8)] focus-within:shadow-[0_0_0_1px_var(--emerald-bright),0_12px_32px_-14px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={() => go(AUTOCLIP)}
          aria-label="Upload a file"
          title="Upload a file"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-subtle outline-none transition-colors hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-emerald-bright"
        >
          <IcPlusCircle />
        </button>
        <label htmlFor="hero-link" className="sr-only">Video link</label>
        <input
          id="hero-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Drop a video link or upload a file"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "hero-link-error" : undefined}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          className="h-11 shrink-0 cursor-pointer rounded-full bg-fg px-5 text-[15px] font-semibold text-[var(--bg-deep)] outline-none transition-transform duration-150 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-emerald-bright focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:px-6"
        >
          Get free clips
        </button>
      </form>
      {error && (
        <p id="hero-link-error" role="alert" className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
