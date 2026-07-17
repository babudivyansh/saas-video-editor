"use client";

// Browser video editor entry. Full-screen (no ToolsSidebar). Loads the project
// named by ?projectId=, or creates a fresh "editor" project on first visit.

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import type { TimelineDoc } from "@/lib/editor/types";
import { useEditorStore } from "./store/editorStore";
import EditorShell from "./EditorShell";

function EditorPageContent() {
  const { user, token, openAuthModal } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadProject = useEditorStore((s) => s.loadProject);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user === undefined) return; // auth still resolving
    if (!user || !token) {
      openAuthModal("login");
      return;
    }

    const projectId = searchParams.get("projectId");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    (async () => {
      try {
        if (projectId) {
          const res = await fetch(`/api/projects/${projectId}`, { headers });
          if (!res.ok) throw new Error("Project not found");
          const { project } = await res.json();
          loadProject(project.id, (project.editorDoc as TimelineDoc) ?? null);
          setState("ready");
        } else {
          const res = await fetch("/api/projects", {
            method: "POST",
            headers,
            body: JSON.stringify({ title: "Untitled project", productType: "editor" }),
          });
          if (!res.ok) throw new Error("Could not create project");
          const { project } = await res.json();
          router.replace(`/dashboard/editor?projectId=${project.id}`);
          loadProject(project.id, null);
          setState("ready");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to open editor");
        setState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, searchParams]);

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-400">Sign in to open the editor.</p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <p className="text-sm text-zinc-400">Opening editor…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-800"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return <EditorShell />;
}

// Multi-track editing on a phone screen isn't a realistic workflow (no
// competitor's web editor attempts full parity there either — CapCut mobile
// is a separate native app, not a responsive reflow of the desktop editor).
// Rather than rebuild EditorShell's dense, deliberately desktop-oriented
// panel layout for narrow viewports, block it below a usable width with a
// clear notice instead of letting it render cramped/broken.
function SmallScreenNotice() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-zinc-950 px-8 text-center md:hidden">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 text-zinc-400">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
          <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M4 6h16M4 18h16" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-zinc-100">The editor needs a larger screen</p>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
        Timeline editing works best on a tablet or desktop. Switch to a wider screen to continue, or use AutoClip on mobile instead.
      </p>
      <a href="/dashboard" className="mt-1 rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-800">
        Back to dashboard
      </a>
    </div>
  );
}

export default function EditorPage() {
  return (
    <>
      <SmallScreenNotice />
      <React.Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-zinc-950">
            <p className="text-sm text-zinc-400">Opening editor…</p>
          </div>
        }
      >
        <EditorPageContent />
      </React.Suspense>
    </>
  );
}
