import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAllToolConfigs, setToolConfig, TOOL_DEFAULTS, TOOL_SERVICE, writeAuditLog } from "@/lib/tool-config";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configs = await getAllToolConfigs();

  // Return as an array so the UI can render a stable sorted list
  const tools = Object.keys(TOOL_DEFAULTS).map(slug => ({
    slug,
    service: TOOL_SERVICE[slug] ?? "Unknown",
    ...configs[slug],
  }));

  return NextResponse.json({ tools });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug, enabled, creditCost } = await req.json() as {
    slug: string;
    enabled?: boolean;
    creditCost?: number;
  };

  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const patch: { enabled?: boolean; creditCost?: number } = {};
  if (enabled !== undefined) patch.enabled = Boolean(enabled);
  if (creditCost !== undefined) {
    const n = Number(creditCost);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: "creditCost must be a non-negative integer" }, { status: 400 });
    }
    patch.creditCost = n;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await setToolConfig(slug, patch);

  await writeAuditLog({
    adminId: admin.userId,
    action: "tool.updated",
    targetId: slug,
    after: patch,
  });

  return NextResponse.json({ ok: true, slug, ...patch });
}
