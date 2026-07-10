"use client";

import React from "react";
import { motion } from "framer-motion";

export default function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-editor-lg border border-editor-border bg-editor-card text-editor-text-faint">
        {icon}
      </span>
      <p className="text-xs leading-relaxed text-editor-text-muted">{message}</p>
    </motion.div>
  );
}
