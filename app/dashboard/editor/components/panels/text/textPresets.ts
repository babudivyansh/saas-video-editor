// Data-only: the "Add Text" quick actions and the Text Templates gallery.
// Add-Text presets create a brand-new clip (text + style). Templates apply
// style fields ONLY to the currently selected clip — never touching its
// text/richText content, per the panel's "select a template, keep my words"
// contract.

import React from "react";
import { Heading1, Heading2, Type, Sparkles, PanelBottom, Captions, Quote } from "lucide-react";
import type { TextClip } from "@/lib/editor/types";

export interface AddTextPreset {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  partial: Partial<TextClip>;
}

export const ADD_TEXT_PRESETS: AddTextPreset[] = [
  { label: "Heading", icon: Heading1, text: "Big Bold Heading", partial: { fontFamily: "Anton", fontSizePct: 0.08, bold: true, y: 0.2 } },
  { label: "Subheading", icon: Heading2, text: "Subheading text", partial: { fontFamily: "Montserrat", fontSizePct: 0.05, bold: true, y: 0.3 } },
  { label: "Body Text", icon: Type, text: "Body text goes here", partial: { fontFamily: "Arial", fontSizePct: 0.035, bold: false, y: 0.5 } },
  {
    label: "Animated Text",
    icon: Sparkles,
    text: "Animated text",
    partial: { fontFamily: "Poppins", fontSizePct: 0.06, bold: true, y: 0.4, entrance: { type: "pop", duration: 0.5, delay: 0 } },
  },
  {
    label: "Lower Third",
    icon: PanelBottom,
    text: "Name · Title",
    partial: { fontFamily: "Montserrat", fontSizePct: 0.035, x: 0.28, y: 0.78, bgColor: "#0a8f70" },
  },
  { label: "Caption", icon: Captions, text: "Clean subtitle line", partial: { fontFamily: "Arial", fontSizePct: 0.04, bold: true, y: 0.85, bgColor: "#000000" } },
  { label: "Quote", icon: Quote, text: "“Something worth quoting”", partial: { fontFamily: "Playfair Display", fontSizePct: 0.05, y: 0.5 } },
];

export interface TextTemplate {
  label: string;
  preview: string;
  styleOnly: Partial<TextClip>;
}

export const TEXT_TEMPLATES: TextTemplate[] = [
  { label: "Modern Title", preview: "Modern Title", styleOnly: { fontFamily: "Montserrat", bold: true, color: "#ffffff", bgColor: null, letterSpacingPx: 1 } },
  {
    label: "YouTube Title",
    preview: "YOUTUBE TITLE",
    styleOnly: { fontFamily: "Anton", bold: true, color: "#ffffff", strokeColor: "#000000", strokeWidthPct: 0.012, textTransform: "uppercase" },
  },
  { label: "Minimal", preview: "Minimal", styleOnly: { fontFamily: "Arial", bold: false, color: "#ffffff", bgColor: null, letterSpacingPx: 0 } },
  { label: "Podcast", preview: "Podcast", styleOnly: { fontFamily: "Poppins", bold: true, color: "#fbbf24", bgColor: "#111827" } },
  {
    label: "Gaming",
    preview: "GAMING",
    styleOnly: { fontFamily: "Oswald", bold: true, color: "#22d3ee", strokeColor: "#0f172a", strokeWidthPct: 0.01, textTransform: "uppercase" },
  },
  {
    label: "Neon",
    preview: "Neon",
    styleOnly: { fontFamily: "Bebas Neue", bold: false, color: "#f0abfc", shadow: { color: "#f0abfc", offsetXPct: 0, offsetYPct: 0, opacity: 0.9, blurPx: 16 } },
  },
  { label: "Corporate", preview: "Corporate", styleOnly: { fontFamily: "Times New Roman", bold: false, color: "#1e293b", bgColor: "#ffffff" } },
  {
    label: "Cinematic",
    preview: "CINEMATIC",
    styleOnly: {
      fontFamily: "Playfair Display",
      bold: false,
      color: "#ffffff",
      letterSpacingPx: 4,
      textTransform: "uppercase",
      shadow: { color: "#000000", offsetXPct: 0.005, offsetYPct: 0.005, opacity: 0.7, blurPx: 6 },
    },
  },
  { label: "Call To Action", preview: "Call To Action", styleOnly: { fontFamily: "Poppins", bold: true, color: "#ffffff", bgColor: "#dc2626" } },
  {
    label: "Social Media",
    preview: "Social Media",
    styleOnly: { fontFamily: "Montserrat", bold: true, color: "#ffffff", gradient: { from: "#8b5cf6", to: "#ec4899", angleDeg: 45 } },
  },
  { label: "Bubble", preview: "Bubble", styleOnly: { fontFamily: "Poppins", bold: true, color: "#111827", bgColor: "#fbbf24" } },
  {
    label: "Bold Headline",
    preview: "BOLD HEADLINE",
    styleOnly: { fontFamily: "Impact", bold: true, color: "#ffffff", strokeColor: "#000000", strokeWidthPct: 0.015, textTransform: "uppercase" },
  },
];
