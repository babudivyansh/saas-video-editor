// Validated dataviz constants, shared by every dashboard surface.
//
// These lived in app/admin/dashboard/ui.tsx until the Social Tracker was
// rebuilt on the same layout grammar. They are not admin property — a
// categorical palette that has passed the lightness/chroma/CVD checks is worth
// exactly one definition — and a customer route must not import from
// app/admin/**, which would invert the trust direction and let an admin tweak
// ship to paying customers without customer-facing review.

// Re-validated with the dataviz palette script against the DARK chart surface
// (#0b1210) when the admin panel moved to the emerald theme. All five checks
// still pass unchanged — lightness band, chroma floor, CVD separation,
// normal-vision floor, contrast — so these hues are kept rather than remapped.
// The amber↔teal tritan pair still sits in the 6–8 band, legal because every
// categorical use direct-labels its slices/bars.
//
// These are deliberately NOT brand colours: a categorical palette wants hue
// spread for identity, and painting it emerald would collapse the series.
export const PALETTE = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#e11d48"] as const;

// Single-series colour, so this one DOES read as "the product's colour" and
// follows the brand. Not the UI's #20d68a: that is L 0.774, outside the
// 0.48–0.67 mark band, so this is the darker step that validates.
export const BRAND = "#00a968";

// ── Chart grammar ────────────────────────────────────────────────────────────
// The rules every chart on either surface follows, so the hand-rolled SVG kit
// and admin's Recharts kit read as one design language: horizontal grid only,
// no Y axis line, no tick marks, and ticks in the subtle foreground rather than
// the muted one (which is body-text weight and competes with the data).

export const CHART_GRID = "var(--line)";
export const CHART_AXIS_TICK = { fontSize: 10, fill: "var(--fg-subtle)" } as const;
export const CHART_MARGIN = { top: 4, right: 8, bottom: 0, left: 0 } as const;

/** Shown in place of a chart with nothing to draw. */
export const CHART_EMPTY_COPY = "No data in range.";
