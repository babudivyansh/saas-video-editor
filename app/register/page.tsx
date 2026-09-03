"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";
import { useAuth } from "@/app/components/AuthContext";
import { getSafeNextPath, withNextParam } from "@/lib/safe-redirect";

function BlurredBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg">
      <div className="absolute inset-0 bg-ambient" />
      <div className="absolute inset-0 blur-sm opacity-70">
        <div className="absolute top-0 left-0 right-0 h-14 bg-surface-2 border-b border-line" />
        <div className="absolute top-14 left-0 w-52 bottom-0 bg-surface-1 border-r border-line" />
        <div className="absolute top-24 left-60 w-72 h-36 bg-emerald-brand/70 rounded-xl" />
        <div className="absolute top-24 left-60 right-8 h-8 bg-emerald-bright/40 rounded-lg ml-80" />
        <div className="absolute top-36 left-60 right-8 h-8 bg-primary/25 rounded-lg ml-80" />
        <div className="absolute top-48 left-60 right-8 h-8 bg-emerald-bright/20 rounded-lg ml-80" />
        <div className="absolute bottom-32 left-60 w-48 h-28 bg-surface-2 rounded-xl border border-line" />
        <div className="absolute bottom-32 left-60 ml-56 w-48 h-28 bg-surface-2 rounded-xl border border-line" />
        <div className="absolute bottom-8 left-60 flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-bright to-emerald-brand opacity-70" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 backdrop-blur-sm bg-bg/45" />
    </div>
  );
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  // AuthProvider is mounted once at the root layout and never remounts on
  // client-side navigation, so a bare router.push here used to leave its
  // token/user state stale (null) straight through the redirect — which
  // deterministically opened the "Welcome back, sign in" modal on a session
  // that was actually valid. refreshUser() re-reads the token AuthForm just
  // wrote to localStorage and resolves the user before we navigate.
  const handleSuccess = async () => {
    await refreshUser();
    const next = getSafeNextPath(searchParams.get("next"));
    router.push(next ?? "/dashboard");
  };

  const handleModeToggle = (mode: "login" | "register") => {
    router.push(withNextParam(mode === "login" ? "/login" : "/register", searchParams.get("next")));
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 bg-bg text-fg">
      <BlurredBackground />

      <div className="relative z-10 w-full max-w-[760px] min-h-[520px] flex rounded-2xl shadow-2xl overflow-hidden bg-panel">
        <AuthForm
          initialMode="register"
          onSuccess={handleSuccess}
          onModeToggle={handleModeToggle}
          next={searchParams.get("next")}
        />

        {/* Right panel */}
        <div className="hidden sm:flex w-72 flex-shrink-0 bg-surface-2 flex-col items-center justify-center p-8 border-l border-line">
          <div className="bg-panel rounded-2xl p-6 text-center shadow-sm w-full border border-line">
            <div className="w-14 h-14 rounded-full grad-brand flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg className="w-7 h-7" viewBox="0 0 40 40" fill="none">
                <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="#071006" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M22 10L28 13V27L22 30V10Z" fill="#071006" fillOpacity="0.3" stroke="#071006" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="25" cy="20" r="1.5" fill="#071006" />
              </svg>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed font-medium">
              Get started in seconds. Login or create an account now.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense fallback={null}>
      <RegisterPageContent />
    </React.Suspense>
  );
}
