// Auth and security email. All transactional — never gated by notification
// preferences and never carrying an unsubscribe link, because a user cannot opt
// out of being told their password changed.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { greet } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

const SECURE_URL = `${APP_URL}/reset-password-request`;

export function otp(p: { otp: string }): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} verification code`,
    preheader: `Your code is ${p.otp}. It expires in 10 minutes.`,
    blocks: [
      { kind: "heading", text: "Verify your email address" },
      {
        kind: "paragraph",
        text: html`Enter the code below to continue. This code expires in <strong>10 minutes</strong>.`,
      },
      { kind: "pin", code: p.otp },
      {
        kind: "paragraph",
        tone: "fine",
        text: "If you didn't request this code you can safely ignore this email — someone may have typed your address by mistake.",
      },
    ],
  };
}

export function passwordReset(p: { name: string; resetLink: string }): EmailDocument {
  return {
    subject: `Reset your ${PRODUCT_NAME} password`,
    preheader: "Choose a new password. This link expires in 15 minutes.",
    blocks: [
      { kind: "heading", text: `Hi ${greet(p.name)}, reset your password` },
      {
        kind: "paragraph",
        text: html`We received a request to reset your password. Choose a new one below — this link expires in
          <strong>15 minutes</strong>.`,
      },
      { kind: "button", href: p.resetLink, label: "Reset password" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "If you didn't request a reset you can ignore this email — your password will not change.",
      },
    ],
  };
}

export function verifyEmail(p: { name: string; verifyLink: string }): EmailDocument {
  return {
    subject: `Verify your email — ${PRODUCT_NAME}`,
    preheader: "One tap to confirm your address and finish securing your account.",
    blocks: [
      { kind: "heading", text: "Verify your email" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, confirm this is your email address to finish securing your ${PRODUCT_NAME} account.`,
      },
      { kind: "button", href: p.verifyLink, label: "Verify email" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "This link expires in 30 minutes. If you didn't request it, you can ignore this email.",
      },
    ],
  };
}

export function changeEmailConfirm(p: { name: string; confirmLink: string }): EmailDocument {
  return {
    subject: `Confirm your new email — ${PRODUCT_NAME}`,
    preheader: "Confirm this address to complete the change to your account email.",
    blocks: [
      { kind: "heading", text: "Confirm your new email" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, someone asked to change the email on a ${PRODUCT_NAME} account to this address. Confirm below to complete the change — your account keeps using the old address until you do.`,
      },
      { kind: "button", href: p.confirmLink, label: "Confirm email change" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "This link expires in 30 minutes. If you didn't request this, ignore it and nothing will change.",
      },
    ],
  };
}

export function loginAlert(p: { name: string; time: string; location: string; device: string }): EmailDocument {
  return {
    subject: `New sign-in to your ${PRODUCT_NAME} account`,
    preheader: `A new sign-in from ${p.device} at ${p.time}.`,
    blocks: [
      { kind: "heading", text: "New sign-in to your account" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, we noticed a new sign-in to your ${PRODUCT_NAME} account.`,
      },
      {
        kind: "kv",
        title: "Sign-in details",
        rows: [
          { label: "Time", value: p.time },
          { label: "Location", value: p.location },
          { label: "Device", value: p.device },
        ],
      },
      {
        kind: "paragraph",
        text: "If this was you, no action is needed. If you don't recognise it, secure your account now.",
      },
      { kind: "button", href: SECURE_URL, label: "Secure my account", tone: "danger" },
    ],
  };
}

export function passwordChanged(p: { name: string; time: string }): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} password was changed`,
    preheader: `Your password was changed on ${p.time}.`,
    blocks: [
      { kind: "heading", text: "Your password was changed" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, this confirms your ${PRODUCT_NAME} password was changed on ${p.time}. Every other device you were signed in on has been signed out — this one stays signed in.`,
      },
      {
        kind: "paragraph",
        text: "If you made this change, no action is needed. If you didn't, secure your account immediately.",
      },
      { kind: "button", href: SECURE_URL, label: "Secure my account", tone: "danger" },
    ],
  };
}

export function twoFactorChanged(p: { name: string; enabled: boolean; time: string }): EmailDocument {
  // Turning 2FA OFF is the direction an attacker wants to happen quietly, so it
  // gets the louder treatment of the two.
  const heading = p.enabled ? "Two-factor authentication is on" : "Two-factor authentication was turned off";
  const body = p.enabled
    ? `Hi ${greet(p.name)}, two-factor authentication was enabled on your ${PRODUCT_NAME} account on ${p.time}. You'll be asked for a code from your authenticator app each time you sign in.`
    : `Hi ${greet(p.name)}, two-factor authentication was disabled on your ${PRODUCT_NAME} account on ${p.time}, and every other device has been signed out. Your account is now protected by your password alone.`;

  return {
    subject: p.enabled
      ? `Two-factor authentication enabled on ${PRODUCT_NAME}`
      : `Two-factor authentication disabled on ${PRODUCT_NAME}`,
    preheader: p.enabled ? "2FA is now protecting your account." : "2FA was switched off on your account.",
    blocks: [
      { kind: "heading", text: heading },
      { kind: "paragraph", text: body },
      ...(p.enabled
        ? []
        : ([
            {
              kind: "callout",
              tone: "warning",
              title: "Didn't do this?",
              body: "Someone with access to your password could have turned this off. Reset it now.",
            },
          ] as const)),
      {
        kind: "paragraph",
        text: "If you made this change, no action is needed. If you didn't, secure your account immediately.",
      },
      { kind: "button", href: SECURE_URL, label: "Secure my account", tone: "danger" },
    ],
  };
}

export function accountExportReady(p: { name: string; downloadUrl: string }): EmailDocument {
  return {
    subject: `Your ${PRODUCT_NAME} data export is ready`,
    preheader: "Your account data is ready to download. The link expires in 24 hours.",
    blocks: [
      { kind: "heading", text: "Your data export is ready" },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, the copy of your ${PRODUCT_NAME} account data you asked for is ready.`,
      },
      { kind: "button", href: p.downloadUrl, label: "Download my data", tone: "violet" },
      { kind: "paragraph", tone: "fine", text: "This link expires in 24 hours." },
    ],
  };
}
