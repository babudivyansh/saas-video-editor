import "dotenv/config";
import { prisma } from "../lib/prisma";

// Promote a user to ADMIN by email. Usage: tsx scripts/promote-admin.ts <email>
async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: tsx scripts/promote-admin.ts <email>");
  const user = await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`promoted ${user.email} -> ${user.role}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
