"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  videoUrl?: string;
}

interface User {
  email: string;
  credits: number;
}

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    Promise.all([
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch("/api/projects", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([me, proj]) => {
      if (!me.user) { router.push("/login"); return; }
      setUser(me.user);
      setProjects(proj.projects ?? []);
    }).finally(() => setLoading(false));
  }, [router]);

  function logout() {
    localStorage.removeItem("token");
    router.push("/login");
  }

  async function createNew() {
    const token = localStorage.getItem("token")!;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Untitled project" }),
    });
    const data = await res.json();
    if (data.project) router.push(`/editor?id=${data.project.id}`);
  }

  const statusColor: Record<string, string> = {
    draft: "text-zinc-400",
    rendering: "text-yellow-400",
    completed: "text-green-400",
    failed: "text-red-400",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <span className="text-zinc-500">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-zinc-800">
        <Link href="/" className="text-lg font-bold text-white">ClipForge</Link>
        <div className="flex items-center gap-6">
          <span className="text-sm text-zinc-400">{user?.credits ?? 0} credits</span>
          <Link href="/billing" className="text-sm text-violet-400 hover:underline">Buy credits</Link>
          <button onClick={logout} className="text-sm text-zinc-500 hover:text-white">Sign out</button>
        </div>
      </nav>

      <main className="flex-1 px-8 py-10 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">My Videos</h1>
          <button
            onClick={createNew}
            className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + New video
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-zinc-500 mb-4">No videos yet.</p>
            <button
              onClick={createNew}
              className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium"
            >
              Create your first video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium text-white text-sm truncate max-w-[160px]">{p.title}</h3>
                  <span className={`text-xs font-medium ${statusColor[p.status] ?? "text-zinc-400"}`}>
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 mb-4">{new Date(p.createdAt).toLocaleDateString()}</p>
                <div className="flex gap-2">
                  <Link
                    href={`/editor?id=${p.id}`}
                    className="flex-1 text-center text-xs border border-zinc-700 text-zinc-300 py-1.5 rounded-lg hover:border-zinc-500 transition-colors"
                  >
                    Edit
                  </Link>
                  {p.videoUrl && (
                    <a
                      href={p.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center text-xs bg-violet-600 hover:bg-violet-500 text-white py-1.5 rounded-lg transition-colors"
                    >
                      Watch
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
