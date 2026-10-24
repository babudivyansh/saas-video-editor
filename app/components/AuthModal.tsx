"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import AuthArtPanel from "./AuthArtPanel";
import AuthForm from "./AuthForm";
import { Modal } from "./ui/Modal";

export default function AuthModal() {
  const { authModal, closeAuthModal, refreshUser } = useAuth();
  const { feature, isFree, next } = authModal;
  // The form toggles sign-in ↔ sign-up internally; mirror it so the art follows.
  const [artMode, setArtMode] = useState<"login" | "register">(authModal.mode);
  useEffect(() => {
    if (authModal.isOpen) setArtMode(authModal.mode);
  }, [authModal.isOpen, authModal.mode]);

  const handleSuccess = async (_token: string) => {
    await refreshUser();
    closeAuthModal();
    // Return to wherever the user was actually trying to go (e.g. a specific
    // editor project deep link) when we know it and it isn't the generic
    // "open the pricing modal" flow below. Full page load, so it cannot open
    // the overlay directly — the ?billing=1 param is what BillingOverlayProvider
    // reads on mount.
    const dest = feature && !isFree ? "/dashboard?billing=1" : (next ?? "/dashboard");
    window.location.href = dest;
  };

  return (
    <Modal
      open={authModal.isOpen}
      onClose={closeAuthModal}
      bare
      ariaLabel={authModal.mode === "register" ? "Create your account" : "Sign in"}
      maxWidth="max-w-[860px]"
      panelClassName="relative flex !overflow-hidden sm:min-h-[min(600px,90vh)]"
    >
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute top-4 right-4 z-50 p-1.5 rounded-full text-fg-subtle hover:text-fg-muted hover:bg-surface-3 transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          aria-label="Close"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Auth Form (Left sliding panel inside AuthForm) */}
        <div className="flex-1 overflow-y-auto max-h-[90vh]">
          <AuthForm
            initialMode={authModal.mode}
            onModeToggle={setArtMode}
            onSuccess={handleSuccess}
            isModalContext={true}
            next={next}
          />
        </div>

        {/* Right panel (desktop only): the same artwork as /login and /register,
            following the form's sign-in / sign-up toggle. When a tool opened the
            popup, its free/premium context sits on top of the art. */}
        <AuthArtPanel mode={artMode}>
          {feature && (
            <div className="rounded-xl border border-line bg-panel/85 backdrop-blur-sm px-3 py-2">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${isFree ? "text-success" : "text-brand"}`}>
                {isFree ? "Free Tool" : "Premium Feature"}
              </p>
              <p className="text-sm text-fg font-bold leading-snug">{feature}</p>
              <p className="text-[11px] text-fg-muted leading-relaxed">
                {isFree
                  ? "This tool is completely free — just sign in to get started."
                  : "Sign in to continue and unlock all premium tools."}
              </p>
            </div>
          )}
        </AuthArtPanel>
    </Modal>
  );
}
