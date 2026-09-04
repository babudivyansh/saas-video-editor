import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // The codebase's established data-fetching pattern is
      // `useEffect(() => { load() }, [load])` where `load` sets state —
      // idiomatic "fetch on mount", used across ~25 admin/dashboard pages.
      // Treated as a warning rather than a hard error: refactoring every
      // call site onto a different fetching pattern is a real architectural
      // change, not a lint fix, and isn't worth the regression risk of
      // touching ~25 pages' runtime behavior in one pass.
      "react-hooks/set-state-in-effect": "warn",
      // Production code should go through lib/logger.ts (structured, greppable,
      // piped to Sentry on error) instead of bare console.*. See the per-file
      // override below for the logger's own implementation and scripts/.
      "no-console": "warn",
      // A leading underscore is this codebase's marker for "required by the
      // signature, deliberately unused" — e.g. a route handler that ignores
      // its Request, or a stub that must keep its parameter list. Honour the
      // convention instead of forcing every such site to carry a disable
      // comment.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Manually-invoked CLI tooling, not server-request code paths — same
    // category as scripts/**, just not physically under that directory.
    files: [
      "lib/logger.ts",
      "scripts/**",
      "prisma/seed.ts",
      "prisma/repair-subscription.ts",
      "utils/test-ffmpeg.ts",
      "utils/test-effects.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
