import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { toolPatchSchema } from "@/lib/admin/schemas";
import { getAllToolConfigs, setToolConfig, TOOL_DEFAULTS, TOOL_SERVICE } from "@/lib/tool-config";

export const GET = withAdmin(async () => {
  const configs = await getAllToolConfigs();

  // Return as an array so the UI can render a stable sorted list
  const tools = Object.keys(TOOL_DEFAULTS).map((slug) => ({
    slug,
    service: TOOL_SERVICE[slug] ?? "Unknown",
    ...configs[slug],
  }));

  return NextResponse.json({ tools });
});

export const PATCH = withAdmin(async (req, { admin }) => {
  const { slug, enabled, creditCost } = await parseBody(req, toolPatchSchema);

  const patch: { enabled?: boolean; creditCost?: number } = {};
  if (enabled !== undefined) patch.enabled = enabled;
  if (creditCost !== undefined) patch.creditCost = creditCost;

  await setToolConfig(slug, patch);

  await auditAdminAction(admin.userId, "tool.updated", slug, { after: patch, ip: auditIp(req) });

  return NextResponse.json({ ok: true, slug, ...patch });
});
