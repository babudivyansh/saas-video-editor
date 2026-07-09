"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getStoredToken } from "@/app/hooks/useVideoGenerate";
import { ProjectStatusBadge } from "@/app/components/dashboard/ProjectStatusBadge";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  _count: { clips: number };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// AutoClip project history (P1.5) — GET /api/projects already returned past
// projects, this is just the missing UI surface for browsing back into them.
export default function ClipsLibraryPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    fetch("/api/projects?productType=auto-clip", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => setError("Failed to load your clips"));
  }, []);

  return (
    <>
        <div className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">My Clips</h1>
          <Link href="/dashboard/create/auto-clip" className="text-sm font-semibold text-white bg-[#3860FF] hover:bg-[#2d50e0] px-4 py-2 rounded-lg transition-colors">New AutoClip</Link>
        </div>

        <div className="px-4 md:px-8 py-6 max-w-6xl w-full mx-auto">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!projects && !error && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          )}
          {projects && projects.length === 0 && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-sm">No AutoClip projects yet.</p>
              <Link href="/dashboard/create/auto-clip" className="text-sm font-semibold text-[#3860FF] hover:underline">Create your first one</Link>
            </div>
          )}
          {projects && projects.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/create/auto-clip?project=${p.id}`}
                  className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-2 hover:border-blue-200 hover:shadow-sm transition-all"
                >
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2">{p.title}</p>
                  <p className="text-xs text-gray-400">{fmtDate(p.createdAt)}</p>
                  <div className="flex items-center justify-between mt-auto pt-2">
                    <span className="text-xs font-medium text-gray-500">{p._count.clips} clip{p._count.clips === 1 ? "" : "s"}</span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
    </>
  );
}
