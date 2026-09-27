import { NextResponse } from "next/server";
import { getModelOverrides, type ModelOverrideMap } from "@/lib/model-overrides";

// Public: the admin runtime overrides for the image/video model registries
// (lib/model-overrides.ts, set in /admin/models). The generator routes have
// always billed these, but the generator UIs priced from the static registry,
// so a repriced model showed one number and charged another. The UIs apply
// this map through the same helpers the routes use.
export async function GET() {
  const overrides = await getModelOverrides();
  // Only the two public fields — nothing else in the Config value leaks out.
  const out: ModelOverrideMap = {};
  for (const [id, o] of Object.entries(overrides)) {
    out[id] = {
      ...(o.enabled === false ? { enabled: false } : {}),
      ...(o.creditCost != null ? { creditCost: o.creditCost } : {}),
    };
  }
  return NextResponse.json(
    { overrides: out },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=60" } },
  );
}
