import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationUrl } from "./prisma/migration-url";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  // CLI only (the app connects via lib/prisma.ts). A transaction-pooler
  // DATABASE_URL (:6543) is swapped for session mode (:5432) here, because
  // migrate deploy needs an advisory lock. See prisma/migration-url.ts.
  datasource: {
    url: migrationUrl(process.env),
  },
});
