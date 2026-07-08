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
    // Vendored/generated design-system bundle — not consumed by the app, not maintained here.
    "ds-bundle/**",
    "design-system/**",
    // Same category: a separate, self-contained design-sync tooling package
    // (has its own package.json/node_modules) — not app code.
    ".design-sync/**",
    ".ds-sync/**",
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
    },
  },
]);

export default eslintConfig;
