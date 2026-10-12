import { NextRequest } from "next/server";
import { GET as webExport } from "@/app/api/social/export/route";
import { mobileError, mobileJson, withMobileSubscriber } from "@/lib/mobile/http";

// GET /api/mobile/v1/social/export?accountId= → { filename, csv, rows }: one
// account's posts, from the web's own export (formula-safe CSV, its rate
// limit). JSON-wrapped so the app's client can read it; the app saves and
// shares the file.
export const GET = withMobileSubscriber(async (req: NextRequest) => {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return mobileError(400, "accountId is required", { code: "invalid_request" });
  const url = new URL(req.url);
  url.search = new URLSearchParams({ accountId, kind: "posts" }).toString();
  const headers = new Headers(req.headers);
  headers.delete("cookie");
  const res = await webExport(new NextRequest(url, { method: "GET", headers }));
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return mobileError(res.status, j.error ?? "Couldn't export this account.", j.code ? { code: j.code } : {});
  }
  const csv = await res.text();
  const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "clipiro-posts.csv";
  const rows = Math.max(0, csv.split(/\r?\n/).filter((l) => l.length > 0).length - 1);
  return mobileJson({ filename, csv, rows });
});
