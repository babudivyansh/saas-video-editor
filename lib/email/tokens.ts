// Brand constants for email, mirrored from app/globals.css.
//
// Mirrored rather than imported because CSS custom properties do not exist in an
// email client — every value has to be a literal hex in an inline style. When
// globals.css changes, this file changes with it.
//
// EMAIL STAYS ON A LIGHT CARD. The 2026-09 emerald migration took the product
// dark, and this file followed it to emerald — but NOT to a dark background. A
// dark email is a worse email: Gmail and Outlook apply their own inversion on
// top, quoted replies and forwards land on white anyway, and any image with a
// baked-in background stops matching. What changed here is the BRAND, not the
// surface.
//
// The app's emeralds cannot simply be copied in, because they are tuned for
// #050908. Measured against this white card: --emerald-bright #20d68a is
// 1.90:1 and --emerald-brand #00a968 is 3.05:1 — both fail as link text and
// both fail with white button text. The values below are the light-surface
// steps of the same family, each at 5.2:1 or better both ways.

/**
 * WHY THIS FILE READS process.env DIRECTLY.
 *
 * lib/env.ts parses its whole schema eagerly at import. Anything that reaches it
 * therefore needs a complete production environment just to be imported — which
 * is exactly why every existing test that touches lib/email has to
 * vi.mock("@/lib/email") instead of rendering anything for real.
 *
 * Keeping the render layer (tokens / blocks / layout / text / templates) free of
 * lib/env is what lets templates be unit-tested and lets the preview script run
 * with no .env at all. Both values below are non-secret and have safe defaults.
 */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://clipiro.com").replace(/\/$/, "");

/**
 * Images are split from links deliberately.
 *
 * Links must follow the deployment (a staging email must link to staging, which
 * the old hardcoded https://clipiro.com CTAs got wrong). Images must NOT — a
 * staging or local preview still needs the logo to load, and staging hosts are
 * usually unreachable from a mail client.
 */
export const ASSET_URL = (process.env.EMAIL_ASSET_BASE_URL ?? "https://clipiro.com").replace(/\/$/, "");

/**
 * app/globals.css :root, plus a quieter neutral ramp for email.
 *
 * The neutrals are deliberately softer and lower-contrast than the app's. An
 * email is read once in someone's inbox next to thirty other messages, so the
 * design that reads as trustworthy there is a restrained one — a white card, a
 * hairline border, one accent colour doing all the work. The brand gradient
 * stays in the product; here it only appears where it earns attention.
 */
export const COLOR = {
  /** Links, list bullets and the CTA fill. 5.48:1 on white, both directions. */
  brand: "#047857",
  brandDark: "#065f46",
  brandDeep: "#0a7a4d",
  /** Pale wash behind a brand callout; `brand` on it is 5.25:1. */
  brandSoft: "#f0fdf6",
  brandBorder: "#a7e8cd",

  /**
   * The second callout colour, replacing the retired `violet`. Deep teal rather
   * than another emerald so two callouts in one message stay distinguishable;
   * 5.47:1 on white, 5.21:1 on its own wash. Lime is deliberately absent — the
   * product's accent is 1.3:1 here and cannot carry text or a fill.
   */
  accent: "#0f766e",
  accentSoft: "#effcfa",
  accentBorder: "#99e6dd",

  /** Decorative only — the 3px cap on the card, which carries no text. */
  gradientFrom: "#047857",
  gradientMid: "#0a7a4d",
  gradientTo: "#00a968",

  ink: "#1a1c1e",
  inkSoft: "#44474e",
  muted: "#5f6368",
  faint: "#80868b",

  page: "#ffffff",
  card: "#ffffff",
  surface: "#f7f8fa",
  border: "#dfe1e5",
  borderSoft: "#ebedf0",

  success: "#16a34a",
  successSoft: "#f0fdf4",
  successBorder: "#bbf7d0",
  warning: "#d97706",
  warningSoft: "#fffbeb",
  warningBorder: "#fde68a",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
} as const;

/**
 * Dark-mode surfaces, for the clients that force-invert regardless of what the
 * message asks for. These now match the product's own dark values instead of
 * the navy they used to be, so a force-inverted Clipiro email and the app agree.
 */
export const DARK = {
  page: "#050908",
  card: "#0b1210",
  ink: "#f5f7f4",
  inkSoft: "#9aa49f",
  border: "#1e2a26",
} as const;

/**
 * Geist first, matching the app. In practice a mail client almost never has it
 * installed and no webfont is loaded here, so the system fallbacks do the real
 * work — but a client that does have it now agrees with the product.
 */
export const FONT_STACK =
  "Geist,'Geist Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Container width. 600px is the widest safe value across desktop clients. */
export const WIDTH = 600;

/**
 * The light-surface lockup: emerald mark, ink wordmark. Intrinsic size 760×261
 * (a ~2.91:1 wordmark), displayed at 120×41.
 *
 * Three variants exist and they are not interchangeable. `logo.png` is the
 * RETIRED brand blue. `logo-emerald.png` is the dark-surface lockup — its
 * wordmark is near-white, so on this white card it disappears and only the mark
 * shows. `logo-email.png` is this one. **A new deploy must ship it before this
 * URL resolves**, unlike the old logo.png which was already live.
 *
 * A PNG rather than the inline SVG the old header used: Outlook's Word engine
 * drops SVG entirely, which is why that logo lockup collapsed there.
 */
export const LOGO_URL = `${ASSET_URL}/logo-email.png`;
export const LOGO_WIDTH = 120;
export const LOGO_HEIGHT = 41;

/**
 * Footer legal block.
 *
 * ⚠ PLACEHOLDERS. CAN-SPAM and the Gmail/Yahoo bulk-sender rules both require a
 * real registered postal address in the footer of marketing mail. These must be
 * filled in before any non-transactional email is sent to a real recipient.
 */
export const LEGAL = {
  entity: "[LEGAL ENTITY NAME]",
  address: "[REGISTERED ADDRESS — street, city, state, postcode, country]",
  supportEmail: "support@clipiro.com",
  unsubscribeMailbox: "unsubscribe@clipiro.com",
} as const;

export const PRODUCT_NAME = "Clipiro";
export const TAGLINE = "AI video, made in minutes";
