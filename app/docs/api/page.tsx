import type { Metadata } from "next";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";

export const metadata: Metadata = {
  title: "API Docs",
  description: "Create AutoClip jobs and poll clip status from your own code with the Clipiro public API.",
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-gray-900 p-4 text-xs leading-relaxed text-gray-100">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path, desc, request, response }: {
  method: string; path: string; desc: string; request?: string; response: string;
}) {
  const methodColor = method === "POST" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700";
  return (
    <div className="rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${methodColor}`}>{method}</span>
        <code className="text-sm font-semibold text-gray-900">{path}</code>
      </div>
      <p className="mt-2 text-sm text-gray-600">{desc}</p>
      {request && (
        <>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Request body</p>
          <Code>{request}</Code>
        </>
      )}
      <p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-400">Response</p>
      <Code>{response}</Code>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />
      <main>
        <section className="border-b border-gray-100 bg-gray-50/60">
          <div className="mx-auto w-full max-w-4xl px-4 py-16 md:px-6">
            <span className="text-xs font-bold uppercase tracking-widest text-[#335CFF]">API Docs</span>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight text-gray-900 md:text-4xl">Public API</h1>
            <p className="mt-4 max-w-2xl text-lg text-gray-600">
              Create AutoClip jobs and poll clip status from your own code. Manage your keys from{" "}
              <Link href="/dashboard/settings/api-keys" className="text-[#335CFF] hover:underline">API keys</Link> in your dashboard.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
          <h2 className="text-lg font-extrabold text-gray-900">Authentication</h2>
          <p className="mt-2 text-sm text-gray-600">
            Send your API key as a bearer token on every request. Requests without a valid key return <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">401</code>.
          </p>
          <Code>{`Authorization: Bearer sk_live_...`}</Code>

          <h2 className="mt-12 text-lg font-extrabold text-gray-900">Rate limits</h2>
          <p className="mt-2 text-sm text-gray-600">
            Limits are per key, not per account. Creating a clip job is limited to 10 requests/minute; status polling is limited to 60-120 requests/minute depending on the endpoint. A <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">429</code> response includes a <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">Retry-After</code> header.
          </p>

          <h2 className="mt-12 mb-4 text-lg font-extrabold text-gray-900">Endpoints</h2>
          <div className="space-y-4">
            <Endpoint
              method="POST"
              path="/api/v1/clips"
              desc="Start an AutoClip analysis job for an existing project (create the project and upload its video from the dashboard first — there's no project-creation endpoint yet). No credits are charged here; charging happens when you confirm which clips to keep."
              request={`{
  "projectId": "proj_abc123",
  "minDuration": 15,
  "maxDuration": 60,
  "clipCount": 5,
  "aspectRatio": "9:16",
  "instructions": "Focus on the funniest moments"
}`}
              response={`{
  "status": "analyzing",
  "projectId": "proj_abc123"
}`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/projects/{id}/clips"
              desc="Poll a project's analysis status and every proposed clip's progress."
              response={`{
  "project": { "status": "pending_review", "warnings": [] },
  "clips": [
    {
      "id": "clip_123",
      "index": 0,
      "title": "The moment everything changed",
      "startSec": 42.5,
      "endSec": 87.2,
      "status": "pending_review",
      "score": 87
    }
  ]
}`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/clips/{id}"
              desc="Single clip detail, including the download URL once rendered."
              response={`{
  "clip": {
    "id": "clip_123",
    "status": "ready",
    "videoUrl": "https://...",
    "thumbnailUrl": "https://..."
  }
}`}
            />
          </div>

          <h2 className="mt-12 text-lg font-extrabold text-gray-900">Example</h2>
          <Code>{`curl -X POST https://clipiro.com/api/v1/clips \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"projectId": "proj_abc123", "clipCount": 5}'`}</Code>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
