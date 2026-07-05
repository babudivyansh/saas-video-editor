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

export default function EditorPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-zinc-950">
          <p className="text-sm text-zinc-400">Opening editor…</p>
        </div>
      }
    >
      <EditorPageContent />
    </React.Suspense>
  );
}
