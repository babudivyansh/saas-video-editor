import "dotenv/config";
import { prisma } from "../lib/prisma";
import { sampleVideo } from "../lib/sample-projects";

// Marks a finished AutoClip run as the demo project for one sample video
// (lib/demo-projects.ts), taking the slug off whichever project had it.
// Usage: npx tsx scripts/set-demo-project.ts <podcast|gaming|vlog> <projectId>
//        npx tsx scripts/set-demo-project.ts <slug> --clear

async function main() {
  const [slug, projectId] = process.argv.slice(2);
  if (!slug || !sampleVideo(slug) || !projectId) throw new Error("usage: set-demo-project.ts <podcast|gaming|vlog> <projectId|--clear>");
  await prisma.$transaction(async (tx) => {
    await tx.project.updateMany({ where: { demoSlug: slug }, data: { demoSlug: null } });
    if (projectId === "--clear") return;
    const p = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true, _count: { select: { clips: { where: { status: "ready" } } } } } });
    if (p.status !== "completed" || p._count.clips === 0) throw new Error(`project ${projectId} isn't a finished run with ready clips (status ${p.status})`);
    await tx.project.update({ where: { id: projectId }, data: { demoSlug: slug } });
  });
  console.log(projectId === "--clear" ? `cleared demo ${slug}` : `demo ${slug} -> ${projectId}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
