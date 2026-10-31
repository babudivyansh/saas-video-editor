import type { EditorVoice } from "@clipiro/shared";
import { ScrollView } from "react-native";
import { Chip } from "@/components";

// The app's voice language filter (web: VoiceLibraryPicker). ~220 voices in a
// flat list was unusable on a phone; a language narrows it to that language's
// own voices plus the multilingual ones (language null), which read any of them.

export type VoiceLanguage = { code: string; label: string };

/** The languages that have voices of their own, alphabetical. */
export function voiceLanguages(voices: readonly EditorVoice[]): VoiceLanguage[] {
  const seen = new Map<string, string>();
  for (const v of voices) if (v.language && v.languageLabel) seen.set(v.language, v.languageLabel);
  return [...seen].map(([code, label]) => ({ code, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Own-language voices first, then the multilingual ones. Null = every voice. */
export function voicesFor(voices: readonly EditorVoice[], language: string | null): EditorVoice[] {
  if (!language) return [...voices];
  return [...voices.filter((v) => v.language === language), ...voices.filter((v) => !v.language)];
}

export function VoiceLanguageChips({ languages, value, onChange }: { languages: VoiceLanguage[]; value: string | null; onChange: (code: string | null) => void }) {
  if (languages.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel="Voice language">
      <Chip label="All languages" selected={value == null} onPress={() => onChange(null)} />
      {languages.map((l) => (
        <Chip key={l.code} label={l.label} selected={value === l.code} onPress={() => onChange(l.code)} />
      ))}
    </ScrollView>
  );
}
