import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom ships no IntersectionObserver, and framer-motion's `whileInView`
// throws outright without one — which is every Band on a dashboard, and the
// lazy-section hook on the admin dashboard. A no-op observer is the right
// stub: these tests assert what renders, not what scrolls into view.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  } as unknown as typeof IntersectionObserver;
}

// No test.globals in vitest.config.ts, so Testing Library's own auto-cleanup
// (which detects a global afterEach) never registers — do it explicitly.
afterEach(() => {
  cleanup();
});
