import type { Metadata } from "next";
import Link from "next/link";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import { CONTAINER, SECTION_Y } from "@/app/components/marketing/styles";

export const metadata: Metadata = {
  title: "API Docs",
  description: "Create AutoClip jobs and poll clip status from your own code with the Clipiro public API.",
  alternates: { canonical: "/docs/api" },
};

/** Section heading, at the doc scale rather than the marketing-page scale. */
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[20px] font-semibold tracking-tight text-ink">{children}</h2>;
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-3 border border-card-border p-4 text-xs leading-relaxed text-fg">
      <code>{children}</code>
    </pre>
  );
}

function Inline({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{children}</code>;
}

function Endpoint({ method, path, desc, request, response }: {
  method: string; path: string; desc: string; request?: string; response: string;
}) {
  const methodColor = method === "POST" ? "bg-tint-emerald text-emerald-700" : "bg-tint-blue text-brand";
  return (
    <div className="rounded-2xl border border-card-border p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${methodColor}`}>{method}</span>
        <code className="text-sm font-semibold text-ink">{path}</code>
      </div>
      <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{desc}</p>
      {request && (
        <>
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Request body</p>
          <Code>{request}</Code>
        </>
      )}
      <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Response</p>
      <Code>{response}</Code>
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="API Docs"
        title="Public API"
        lede={
          <>
            Create AutoClip jobs and poll clip status from your own code. Manage your keys from{" "}
            <Link
              href="/dashboard/settings/api-keys"
              className="font-medium text-brand underline decoration-brand/30 underline-offset-[3px] hover:decoration-brand"
            >
              API keys
            </Link>{" "}
            in your dashboard.
          </>
        }
      />

      <section>
        {/* Narrower than the standard container: this is reference material, and
            code blocks stay scannable at a doc measure rather than full width. */}
        <div className={`${CONTAINER} ${SECTION_Y} max-w-4xl`}>
          <H2>Authentication</H2>
          <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">
            Send your API key as a bearer token on every request. Requests without a valid key return{" "}
            <Inline>401</Inline>.
          </p>
          <Code>{`Authorization: Bearer sk_live_...`}</Code>

          <div className="mt-12">
            <H2>Rate limits</H2>
          </div>
          <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">
            Limits are per key, not per account. Creating a clip job is limited to 10 requests/minute; status polling
            is limited to 60-120 requests/minute depending on the endpoint. A <Inline>429</Inline> response includes a{" "}
            <Inline>Retry-After</Inline> header.
          </p>

          <div className="mb-4 mt-12">
            <H2>Endpoints</H2>
          </div>
          <div className="space-y-4">
            <Endpoint
              method="POST"
              path="/api/v1/projects"
              desc="Create a project. Pass uploadedVideoUrl (https) pointing at the source video if you plan to run AutoClip on it — or upload the video from the dashboard afterwards. Requires a key with write access."
              request={`{
  "title": "Podcast episode 42",
  "uploadedVideoUrl": "https://example.com/episode42.mp4"
}`}
              response={`{
  "project": {
    "id": "proj_abc123",
    "title": "Podcast episode 42",
    "status": "draft"
  }
}`}
            />
            <Endpoint
              method="GET"
              path="/api/v1/projects"
              desc="List your projects with status and clip counts."
              response={`{
  "projects": [
    { "id": "proj_abc123", "title": "Podcast episode 42", "status": "draft", "_count": { "clips": 0 } }
  ]
}`}
            />
            <Endpoint
              method="POST"
              path="/api/v1/clips"
              desc="Start an AutoClip analysis job for an existing project (create it via POST /api/v1/projects). No credits are charged here; charging happens when you confirm which clips to keep."
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

          <div className="mt-12">
            <H2>Example</H2>
          </div>
          <Code>{`curl -X POST https://clipiro.com/api/v1/clips \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"projectId": "proj_abc123", "clipCount": 5}'`}</Code>
        </div>
      </section>
    </MarketingShell>
  );
}
