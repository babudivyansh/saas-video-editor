"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { ReviewPromptModal } from "@/app/components/reviews/ReviewPromptModal";
import type { PromptTrigger } from "@/lib/reviews/prompt-triggers";

interface ModalConfig {
  trigger: PromptTrigger;
  featureHint?: string;
  mode: "new" | "edit";
}

type FireTrigger = (trigger: PromptTrigger, opts?: { featureHint?: string }) => Promise<void>;

const ReviewPromptContext = createContext<FireTrigger | null>(null);

// Fires a prompt-check for the given trigger and, if it qualifies, opens the
// global review modal. Safe to call from any dashboard success moment — the
// server-side throttle/eligibility rules in lib/reviews/prompt-triggers.ts
// do the actual gating, this just wires the UI up to them.
export function useReviewPromptTrigger(): FireTrigger {
  const ctx = useContext(ReviewPromptContext);
  if (!ctx) throw new Error("useReviewPromptTrigger must be used within a ReviewPromptProvider");
  return ctx;
}

export function ReviewPromptProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const fireTrigger = useCallback<FireTrigger>(
    async (trigger, opts) => {
      if (!token) return;
      const res = await fetch("/api/reviews/prompt-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trigger, featureHint: opts?.featureHint }),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data?.shouldPrompt) {
        setModal({ trigger: data.trigger ?? trigger, featureHint: opts?.featureHint, mode: "new" });
      }
    },
    [token],
  );

  return (
    <ReviewPromptContext.Provider value={fireTrigger}>
      {children}
      <Suspense fallback={null}>
        <DeepLinkWatcher onOpen={setModal} />
      </Suspense>
      {modal && (
        <ReviewPromptModal
          trigger={modal.trigger}
          featureHint={modal.featureHint}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}
    </ReviewPromptContext.Provider>
  );
}

// Handles ?prompt=1 (a review-prompt notification/email deep link — the
// server already recorded this prompt via the cron/webhook path, so this
// just opens the UI, it does not re-fire prompt-check) and ?editReview=1
// (a rejected-review notification/email deep link — evaluatePromptTrigger
// would never re-open the normal flow once a Review row exists, so this is
// the only way back into the form after a rejection). Lives in its own
// component so only this small piece needs the Suspense boundary
// useSearchParams requires.
function DeepLinkWatcher({ onOpen }: { onOpen: (config: ModalConfig) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // React StrictMode (default-on in Next.js dev) intentionally double-invokes
  // effects to surface exactly this kind of bug: without a guard, this could
  // fire twice. Also protects against any Suspense-boundary remount doing
  // the same.
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const prompt = searchParams.get("prompt");
    const editReview = searchParams.get("editReview");
    if (prompt !== "1" && editReview !== "1") return;
    handledRef.current = true;

    // Strip the param via the raw History API rather than router.replace():
    // this is a same-route, query-only cleanup with nothing new to render
    // (the destination resolves to the identical page tree), which
    // next/navigation's router can end up treating as a no-op and skip
    // updating the visible URL for. history.replaceState has no such
    // ambiguity — it always updates the address bar, and never triggers a
    // Next.js re-render/data-refetch, which is exactly what a purely
    // cosmetic URL cleanup should do.
    const params = new URLSearchParams(searchParams);
    params.delete(prompt === "1" ? "prompt" : "editReview");
    const nextUrl = params.size > 0 ? `${pathname}?${params}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);

    if (prompt === "1") {
      onOpen({ trigger: "days_active", mode: "new" });
    } else {
      onOpen({ trigger: "days_active", mode: "edit" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
