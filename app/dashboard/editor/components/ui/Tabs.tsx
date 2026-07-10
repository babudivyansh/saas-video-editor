"use client";

// Controlled, icon-only tab strip with a sliding accent underline
// (framer-motion layoutId shared-layout animation). Give each Tabs instance
// a distinct layoutId so unrelated tab bars don't animate into each other.

import React from "react";
import { motion } from "framer-motion";
import Tooltip from "./Tooltip";

export interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export default function Tabs({
  items,
  value,
  onChange,
  layoutId,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  layoutId: string;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-editor-border px-2">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <Tooltip key={item.id} content={item.label} side="bottom">
            <button
              type="button"
              onClick={() => onChange(item.id)}
              aria-label={item.label}
              className={`relative flex items-center justify-center px-3 py-2.5 transition-colors cursor-pointer ${
                active ? "text-editor-accent" : "text-editor-text-muted hover:text-editor-text"
              }`}
            >
              {item.icon}
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-editor-accent"
                />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
