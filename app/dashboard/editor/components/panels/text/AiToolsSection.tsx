"use client";

// Pure UI stub — panel-level (general "give me text ideas") AI actions,
// distinct from the clip-scoped "ai" tab in the properties panel (rewrite
// *this* clip's text). Structured so a real handler can replace the
// disabled/no-op buttons later without any layout change.

import React from "react";
import { Wand2, Scissors, Maximize2, Languages, SpellCheck2, Zap, Type, Smile } from "lucide-react";
import { Button, PropertyCard, Tooltip } from "../../ui";

const AI_TOOLS = [
  { label: "Rewrite", icon: Wand2 },
  { label: "Shorten", icon: Scissors },
  { label: "Expand", icon: Maximize2 },
  { label: "Translate", icon: Languages },
  { label: "Improve Grammar", icon: SpellCheck2 },
  { label: "Generate Hook", icon: Zap },
  { label: "Generate Title", icon: Type },
  { label: "Add Emojis", icon: Smile },
] as const;

export default function AiToolsSection() {
  return (
    <PropertyCard title="AI Tools" defaultOpen={false}>
      <div className="grid grid-cols-2 gap-1.5">
        {AI_TOOLS.map(({ label, icon: Icon }) => (
          <Tooltip key={label} content="Coming soon" side="top">
            <Button variant="subtle" size="sm" disabled className="justify-start gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          </Tooltip>
        ))}
      </div>
    </PropertyCard>
  );
}
