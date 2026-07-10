"use client";

import React from "react";
import { motion } from "framer-motion";

type Variant = "primary" | "ghost" | "subtle";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "text-white shadow-editor-sm",
  ghost: "text-editor-text-muted hover:bg-editor-card hover:text-editor-text",
  subtle: "bg-editor-card text-editor-text-muted hover:text-editor-text",
};

const SIZES: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[11px]",
  md: "px-3.5 py-2 text-xs",
};

export default function Button({
  children,
  variant = "subtle",
  size = "md",
  active,
  disabled,
  onClick,
  type = "button",
  title,
  rounded = "rounded-editor-md",
  className = "",
}: {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
  /** Override the default radius (e.g. "rounded-editor-full" for pill CTAs) —
   *  kept as a separate slot rather than relying on `className` override
   *  order, since two same-specificity Tailwind radius utilities racing in
   *  one class string is undefined which one wins. */
  rounded?: string;
  className?: string;
}) {
  const primaryStyle: React.CSSProperties | undefined =
    variant === "primary"
      ? { backgroundImage: "linear-gradient(135deg, var(--editor-accent), var(--editor-accent-hover))" }
      : undefined;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      whileHover={{ scale: variant === "primary" && !disabled ? 1.02 : 1 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      style={primaryStyle}
      className={`flex items-center justify-center gap-1.5 ${rounded} font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${active ? "bg-editor-accent/15 text-editor-accent" : ""} ${className}`}
    >
      {children}
    </motion.button>
  );
}
