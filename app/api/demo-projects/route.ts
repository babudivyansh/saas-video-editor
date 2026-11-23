import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { listDemoProjects } from "@/lib/demo-projects";

// Home's "Start from a demo project" cards: the demos this environment has.
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ demos: await listDemoProjects() });
}
