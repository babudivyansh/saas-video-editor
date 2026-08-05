// The document shell: doctype, head, responsive + dark-mode CSS, header, body
// blocks, legal footer.
//
// Everything the old templates lacked lives here rather than in any template, so
// it cannot be forgotten by one of 35 files. Notably the preheader — the old
// emails had none, so inboxes showed a scrape of body copy as the preview line.

import { renderBlocks, type Block } from "./blocks";
import { renderText } from "./text";
import { escapeHtml, safeUrl } from "./html";
import {
  APP_URL, COLOR, DARK, FONT_STACK, LEGAL, LOGO_HEIGHT, LOGO_URL, LOGO_WIDTH, PRODUCT_NAME, WIDTH,
} from "./tokens";

export type LocaleCode = string;

export interface EmailDocument {
  subject: string;
  /**
   * The inbox preview line. Required, not optional — a missing preheader is the
   * defect this system exists partly to fix, so the type makes it a compile
   * error rather than an omission.
   */
  preheader: string;
  blocks: Block[];
  /** Present only on non-transactional mail. Drives the footer link and headers. */
  unsubscribeUrl?: string;
  locale?: LocaleCode;
  /**
   * How much brand the message wears.
   *
   * "plain" (the default) is the Google-reference treatment: no gradient, a flat
   * accent, nothing competing with the content. "brand" adds a hairline gradient
   * at the top of the card and a gradient CTA.
   *
   * The split is by intent, not by taste. A receipt, a password reset or a
   * security alert is a document of record — it should look like infrastructure,
   * and decoration there erodes trust. A welcome or re-engagement email is
   * marketing and can carry the product's personality. In practice this is set
   * from the registry's category: "transactional" gets plain, everything else
   * gets brand.
   */
  accent?: "plain" | "brand";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  listUnsubscribe?: { http: string; mailto: string };
}

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/**
 * Gmail truncates the preview at the first whitespace run, then bleeds body copy
 * in after it. Padding with zero-width joiners stops that without printing
 * anything visible.
 */
const PREHEADER_PAD = "&#847;&zwnj;&nbsp;".repeat(30);

function styleBlock(): string {
  return `
    /* Client resets */
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;width:100%!important;}
    a{color:${COLOR.brand};}

    /* Mobile. Inline styles remain the floor for clients that strip <style>. */
    @media screen and (max-width:600px){
      .container{width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important;}
      .px{padding-left:22px!important;padding-right:22px!important;}
      .h1{font-size:21px!important;}
      .h2{font-size:17px!important;}
      .pin{font-size:30px!important;letter-spacing:8px!important;}
      .stack{display:block!important;width:100%!important;padding:0 0 12px 0!important;}
    }

    /* Dark mode. [data-ogsc]/[data-ogsb] are Outlook.com's rewrite hooks.
       Gmail on Android force-inverts regardless, so these surfaces are chosen to
       stay readable when inverted rather than to win the fight. */
    @media (prefers-color-scheme:dark){
      .bg-page{background-color:${DARK.page}!important;}
      .bg-card{background-color:${DARK.card}!important;}
      .t-ink,.h1,.h2{color:${DARK.ink}!important;}
      .t-soft{color:${DARK.inkSoft}!important;}
      .t-fine{color:${DARK.inkSoft}!important;}
      .panel{background-color:${DARK.card}!important;border-color:${DARK.border}!important;}
      .divider{border-color:${DARK.border}!important;}
    }
    [data-ogsc] .bg-page{background-color:${DARK.page}!important;}
    [data-ogsc] .bg-card{background-color:${DARK.card}!important;}
    [data-ogsc] .t-ink,[data-ogsc] .h1,[data-ogsc] .h2{color:${DARK.ink}!important;}
    [data-ogsc] .t-soft,[data-ogsc] .t-fine{color:${DARK.inkSoft}!important;}
  `;
}

/**
 * Header: the logo, centred, and nothing else.
 *
 * A hosted PNG rather than the old inline <svg> in a display:flex row — Outlook's
 * Word engine drops SVG and ignores flex, so that lockup collapsed there.
 *
 * The brand gradient bar that used to sit above it is gone. In an inbox the
 * message is competing with thirty others, and the design that reads as
 * trustworthy is the restrained one: a white card, a hairline border, one accent
 * colour on the single thing you want clicked.
 */
function header(): string {
  return `
    <tr><td class="px" align="center" style="padding:40px 40px 8px;text-align:center;">
      <a href="${safeUrl(APP_URL)}" style="text-decoration:none;">
        <img src="${LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${PRODUCT_NAME}" style="display:inline-block;border:0;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;"/>
      </a>
    </td></tr>`;
}

/**
 * Footer, centred and set OUTSIDE the card.
 *
 * Deliberately quieter than the body and visually separate from it: this is
 * housekeeping — who sent this, why you got it, how to stop it — not content.
 * Putting it on the page rather than inside the card is what keeps the card
 * reading as the message.
 */
const FINE = (extra = "") =>
  `font-family:${FONT_STACK};font-size:12px;line-height:1.7;color:${COLOR.faint};margin:0;${extra}`;

function footer(unsubscribeUrl?: string): string {
  const why = unsubscribeUrl
    ? `You are receiving this because you have a ${PRODUCT_NAME} account.<br/>
       <a href="${safeUrl(unsubscribeUrl)}" style="color:${COLOR.muted};text-decoration:underline;">Unsubscribe</a>
       &nbsp;·&nbsp;
       <a href="${safeUrl(`${APP_URL}/dashboard/settings/notifications`)}" style="color:${COLOR.muted};text-decoration:underline;">Manage preferences</a>`
    : `You received this because it relates to your ${PRODUCT_NAME} account.<br/>
       Service messages like this one have no unsubscribe link.`;

  return `
    <tr><td align="center" class="px" style="padding:24px 40px 40px;text-align:center;">
      <p class="t-fine" style="${FINE("padding:0 0 10px;")}">${why}</p>
      <p class="t-fine" style="${FINE("padding:0 0 10px;")}">
        <a href="mailto:${escapeHtml(LEGAL.supportEmail)}" style="color:${COLOR.muted};text-decoration:none;">${escapeHtml(LEGAL.supportEmail)}</a>
        &nbsp;·&nbsp;<a href="${safeUrl(`${APP_URL}/privacy`)}" style="color:${COLOR.muted};text-decoration:none;">Privacy</a>
        &nbsp;·&nbsp;<a href="${safeUrl(`${APP_URL}/terms`)}" style="color:${COLOR.muted};text-decoration:none;">Terms</a>
      </p>
      <p class="t-fine" style="${FINE()}">
        &copy; ${new Date().getFullYear()} ${escapeHtml(LEGAL.entity)}, ${escapeHtml(LEGAL.address)}
      </p>
    </td></tr>`;
}

/**
 * A 3px gradient hairline across the very top of the card.
 *
 * Three pixels, not the six the earlier pass used: enough to register as Clipiro
 * at a glance, not enough to become the first thing you look at. Solid brand
 * blue underneath, since Outlook and Gmail webmail do not render CSS gradients
 * and would otherwise show nothing at all.
 */
function gradientRule(): string {
  return `<tr><td style="font-size:0;line-height:0;height:3px;background-color:${COLOR.brand};background-image:linear-gradient(90deg,${COLOR.brand} 0%,${COLOR.violet} 55%,${COLOR.fuchsia} 100%);border-radius:12px 12px 0 0;">&nbsp;</td></tr>`;
}

export function renderEmail(doc: EmailDocument): RenderedEmail {
  const locale = doc.locale ?? "en";
  const dir = RTL_LOCALES.has(locale.split("-")[0]) ? "rtl" : "ltr";
  const accent = doc.accent ?? "plain";
  const brand = accent === "brand";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="${escapeHtml(locale)}" dir="${dir}">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="x-apple-disable-message-reformatting"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>${escapeHtml(doc.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">${styleBlock()}</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:${COLOR.page};">
<div style="display:none;font-size:1px;color:${COLOR.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(doc.preheader)}${PREHEADER_PAD}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg-page" style="background-color:${COLOR.page};">
  <tr><td align="center" style="padding:32px 12px 8px;">
    <!-- The card: hairline border, no shadow, no fill beyond white. -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" class="container bg-card" style="width:${WIDTH}px;max-width:${WIDTH}px;background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;">
      ${brand ? gradientRule() : ""}
      ${header()}
      ${renderBlocks(doc.blocks, accent)}
      <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
  </td></tr>
  <!-- Footer lives OUTSIDE the card, so the card reads as the message. -->
  <tr><td align="center" style="padding:0 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${WIDTH}" class="container" style="width:${WIDTH}px;max-width:${WIDTH}px;">
      ${footer(doc.unsubscribeUrl)}
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = renderText({
    preheader: doc.preheader,
    blocks: doc.blocks,
    unsubscribeUrl: doc.unsubscribeUrl,
  });

  return {
    subject: doc.subject,
    html,
    text,
    listUnsubscribe: doc.unsubscribeUrl
      ? {
          http: doc.unsubscribeUrl,
          mailto: `mailto:${LEGAL.unsubscribeMailbox}?subject=unsubscribe`,
        }
      : undefined,
  };
}
