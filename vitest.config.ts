import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Default environment for the vast majority (backend) tests. Component
    // tests opt into jsdom per-file via a `// @vitest-environment jsdom`
    // docblock (Vitest 4 dropped environmentMatchGlobs).
    environment: "node",
    include: ["**/*.test.ts", "**/*.component.test.tsx"],
    exclude: ["node_modules/**", ".next/**", "design-system/**", "ds-bundle/**"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
