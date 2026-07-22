"use client";

// Pure UI stub — whole-track AI actions (grammar/filler-words/translation/
// etc. all operate on every cue at once, so they live here rather than being
// duplicated per-cue on the properties panel). Structured so a real handler
// can replace the disabled/no-op buttons later without any layout change.

import React from "react";
import { SpellCheck2, BookOpenCheck, Scissors, Languages, Wand2, Smile, WrapText, Flame } from "lucide-react";
import { Button, PropertyCard, Tooltip } from "../../ui";

const AI_TOOLS = [
  { label: "Fix Grammar", icon: SpellCheck2 },
  { label: "Improve Readability", icon: BookOpenCheck },
  { label: "Remove Filler Words", icon: Scissors },
  { label: "Translate", icon: Languages },
  { label: "Rewrite", icon: Wand2 },
  { label: "Add Emojis", icon: Smile },
  { label: "Auto Line Breaks", icon: WrapText },
  { label: "Convert to Viral Style", icon: Flame },
] as const;

export default function AiToolsSection() {
  return (
    <PropertyCard title="AI Tools (Coming Soon)" defaultOpen={false}>
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
