"use client";
import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";
import AuthArtPanel from "@/app/components/AuthArtPanel";
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

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSuccess = () => {
    const next = getSafeNextPath(searchParams.get("next"));
    router.push(next ?? "/dashboard");
  };

  const handleModeToggle = (mode: "login" | "register") => {
    router.push(withNextParam(mode === "login" ? "/login" : "/register", searchParams.get("next")));
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 bg-bg text-fg">
      <BlurredBackground />

      <div className="relative z-10 w-full max-w-[860px] min-h-[600px] flex rounded-3xl border border-line shadow-2xl overflow-hidden bg-panel">
        <AuthForm
          initialMode="login"
          onSuccess={handleSuccess}
          onModeToggle={handleModeToggle}
          next={searchParams.get("next")}
        />

        <AuthArtPanel mode="login" />
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageContent />
    </React.Suspense>
  );
}
