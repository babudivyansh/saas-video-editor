"use client";

import { useId, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { FieldLabel, Input } from "@/app/components/ui/Field";

type Status = "idle" | "submitting" | "sent" | "error";

/**
 * Blog newsletter capture. Deliberately avoids Toast/Modal/ConfirmDialog for
 * feedback: all three call useTranslations, and NextIntlClientProvider is only
 * mounted inside the authenticated AppShellLayout — using them on a public
 * marketing page throws a missing-provider error. Status is inline text, and
 * all copy is an inline English literal, matching the rest of app/blog.
 */
export default function NewsletterSignup({ source = "blog_footer" }: { source?: string }) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("error");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source, hp: honeypot }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-[var(--radius-card)] border border-card-border bg-tint-emerald p-8 text-center">
        <p className="text-base font-bold text-ink">Check your inbox</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
          We&apos;ve sent a confirmation link to {email.trim().toLowerCase()}. Tap it and you&apos;re in.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-card-border bg-surface p-8 text-center">
      <p className="text-base font-bold text-ink">Get the creator playbook</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Practical short-form video tactics, roughly twice a month. No spam, unsubscribe anytime.
      </p>

      <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row">
        <div className="flex-1 text-left">
          <FieldLabel htmlFor={inputId}>
            <span className="sr-only">Email address</span>
          </FieldLabel>
          <Input
            id={inputId}
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            aria-invalid={status === "error"}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <Button type="button" size="lg" disabled={status === "submitting"} onClick={() => void submit()}>
          {status === "submitting" ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>

      {status === "error" && (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          That doesn&apos;t look like a valid email. Mind checking it?
        </p>
      )}

      {/* Honeypot: hidden from humans and assistive tech, irresistible to bots. */}
      <input
        type="text"
        name="hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
    </div>
  );
}
