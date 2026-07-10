"use client";

import React from "react";
import { motion } from "framer-motion";
import Tooltip from "./Tooltip";

export default function IconButton({
  icon,
  label,
  active,
  disabled,
  onClick,
  size = "md",
  tooltipSide = "right",
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
  tooltipSide?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  const dims = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const button = (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      whileHover={{ scale: disabled ? 1 : 1.05 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      className={`flex ${dims} flex-shrink-0 items-center justify-center rounded-editor-md text-editor-text-muted transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent ${
        active ? "bg-editor-accent/15 text-editor-accent shadow-editor-glow" : "hover:bg-editor-card hover:text-editor-text"
      } ${className}`}
    >
      {icon}
    </motion.button>
  );
  return (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
}
