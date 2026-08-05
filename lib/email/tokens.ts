// Brand constants for email, mirrored from app/globals.css.
//
// Mirrored rather than imported because CSS custom properties do not exist in an
// email client — every value has to be a literal hex in an inline style. When
// globals.css changes, this file changes with it.
//
// The old templates used #2563eb, which is not one of Clipiro's colours at all;
// the real brand blue is #335cff.

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
  brand: "#335cff",
  brandDark: "#2348d8",
  brandDeep: "#3b5eff",
  brandSoft: "#eaefff",
  violet: "#7c3aed",
  fuchsia: "#d946ef",

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
  violetSoft: "#f5f3ff",
  violetBorder: "#ddd6fe",
} as const;

/** Dark-mode surfaces. Chosen to stay readable when Gmail force-inverts anyway. */
export const DARK = {
  page: "#0b1120",
  card: "#111c33",
  ink: "#e2e8f0",
  inkSoft: "#94a3b8",
  border: "#1e293b",
} as const;

export const FONT_STACK =
  "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Container width. 600px is the widest safe value across desktop clients. */
export const WIDTH = 600;

/**
 * The product's real logo, already served from public/ and already live at
 * https://clipiro.com/logo.png — so there is no new asset to deploy before email
 * can ship. Intrinsic size is 760×261 (a ~2.91:1 wordmark), displayed at 120×41.
 *
 * A PNG rather than the inline SVG the old header used: Outlook's Word engine
 * drops SVG entirely, which is why that logo lockup collapsed there.
 */
export const LOGO_URL = `${ASSET_URL}/logo.png`;
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
