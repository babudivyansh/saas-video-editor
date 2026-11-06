export { default, alt, size, contentType } from "./opengraph-image";
// Route segment config can't be re-exported; mirrors opengraph-image so the
// Diwali card swaps back after 15 Nov 2026 without a redeploy.
export const revalidate = 3600;
