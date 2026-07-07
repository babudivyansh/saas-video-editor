import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"] || "";
let directUrl = process.env["DIRECT_URL"] || process.env["DIRECT_DATABASE_URL"] || "";

if (!directUrl && databaseUrl) {
  // If the DATABASE_URL uses the transaction pooler (port 6543),
  // route migrations to the session pooler (port 5432) which supports advisory locks.
  if (databaseUrl.includes(":6543")) {
    directUrl = databaseUrl.replace(/:6543/g, ":5432");
    // Strip pooler-specific queries like ?pgbouncer=true or &pgbouncer=true if present
    directUrl = directUrl.replace(/[\?&]pgbouncer=true/gi, "");
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    ...(directUrl ? { directUrl } : {}),
  },
});
