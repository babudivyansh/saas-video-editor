import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { rateLimit } from "@/lib/rate-limit";
import { SERVICE_IDS, listServices, probeService } from "@/lib/admin/service-probes";

// GET /api/admin/ops/services            → every provider, configured state only (no network)
// GET /api/admin/ops/services?id=<id>    → run that provider's check
// GET /api/admin/ops/services?id=all     → run every check in parallel
// Read-only; checks use free identity endpoints (lib/admin/service-probes.ts)
// and never return a key or a raw provider error.
export const GET = withAdmin(async (req, { admin }) => {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ services: listServices() });

  if (id !== "all" && !SERVICE_IDS.includes(id)) return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  const { allowed } = await rateLimit(`admin-service-probe:${admin.userId}`, 60, 600);
  if (!allowed) return NextResponse.json({ error: "Too many checks — wait a few minutes" }, { status: 429 });

  const ids = id === "all" ? SERVICE_IDS : [id];
  const services = (await Promise.all(ids.map((s) => probeService(s)))).filter(Boolean);
  return NextResponse.json({ services });
});
