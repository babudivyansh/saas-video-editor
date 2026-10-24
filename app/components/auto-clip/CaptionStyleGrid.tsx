"use client";

// The AutoClip create page's caption picker: the shared template gallery
// (app/components/captions/CaptionTemplateGallery.tsx), with locked templates
// opening the plans view.

import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
import { useUpgradePrompt } from "@/app/components/captions/useUpgradePrompt";

export interface CaptionStyleGridProps {
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export default function CaptionStyleGrid({ value, onChange, disabled }: CaptionStyleGridProps) {
  const upgrade = useUpgradePrompt();
  return <CaptionTemplateGallery value={value} onChange={onChange} onLocked={upgrade} disabled={disabled} columns={5} />;
}
