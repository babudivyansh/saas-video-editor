import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// No test.globals in vitest.config.ts, so Testing Library's own auto-cleanup
// (which detects a global afterEach) never registers — do it explicitly.
afterEach(() => {
  cleanup();
});
