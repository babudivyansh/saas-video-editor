// Shared ElevenLabs voice catalogue for VoiceoverTool and VoiceChangerTool.
// Previously duplicated verbatim (with descriptions drifting apart) in both
// files — every future voice addition meant editing two files in lockstep.
// Each slug is resolved to a real ElevenLabs voice id by
// utils/voice-ids.ts's resolveVoiceId(), which is what the picker UIs
// (kept separate — they have genuinely different UX, not just duplicated
// markup) actually pass to the synthesis APIs.
export interface Voice {
  slug: string;
  name: string;
  desc: string;
  gender: "Male" | "Female";
  age: "Young" | "Middle aged" | "Mature";
  language: "English" | "Multilingual";
  color: string;
}

export const VOICES: Voice[] = [
  { slug: "william", name: "William", desc: "The default narrator — clear and neutral. Suits stories, narration and Reddit threads.", gender: "Male", age: "Middle aged", language: "English", color: "#ec4899" },
  { slug: "adam", name: "Adam", desc: "Adam is one of the most recognizable voices used in many viral short-form videos.", gender: "Male", age: "Middle aged", language: "Multilingual", color: "#3b82f6" },
  { slug: "dandan", name: "Dan Dan", desc: "Warm and conversational — suits story and commentary channels.", gender: "Male", age: "Middle aged", language: "Multilingual", color: "#6366f1" },
  { slug: "natasha", name: "Natasha", desc: "Natasha is the soft voice most notably used in viral short-form videos for storytelling and narration.", gender: "Female", age: "Young", language: "Multilingual", color: "#10b981" },
  { slug: "amir1", name: "Amir #1", desc: "The one and only built-different sir Uber driver.", gender: "Male", age: "Young", language: "Multilingual", color: "#f59e0b" },
  { slug: "amir2", name: "Amir #2 (Ameer)", desc: "Amir's brother who is rivaling on doordash.", gender: "Male", age: "Young", language: "Multilingual", color: "#22c55e" },
  { slug: "daniel", name: "Daniel", desc: "Deep, authoritative British voice. Perfect for documentaries, explainers and professional narration.", gender: "Male", age: "Middle aged", language: "English", color: "#7c3aed" },
  { slug: "harry", name: "Harry", desc: "Bold and expressive British voice ideal for dramatic storytelling and gaming content.", gender: "Male", age: "Young", language: "English", color: "#f97316" },
  { slug: "liam", name: "Liam", desc: "Energetic and clear American voice. Great for YouTube tutorials, product reviews and everyday content.", gender: "Male", age: "Young", language: "Multilingual", color: "#0ea5e9" },
  { slug: "charlie", name: "Charlie", desc: "Friendly, conversational voice well suited for podcasts, storytelling and casual narration.", gender: "Male", age: "Young", language: "Multilingual", color: "#14b8a6" },
  { slug: "thomas", name: "Thomas", desc: "Calm and measured voice ideal for educational content, tutorials and e-learning.", gender: "Male", age: "Middle aged", language: "English", color: "#8b5cf6" },
  { slug: "matthew", name: "Matthew", desc: "Warm American narrator voice with excellent clarity, great for audiobooks and long-form content.", gender: "Male", age: "Middle aged", language: "English", color: "#06b6d4" },
  { slug: "aria", name: "Aria", desc: "Versatile, expressive female voice great for a wide range of content from vlogs to narration.", gender: "Female", age: "Young", language: "Multilingual", color: "#a855f7" },
  { slug: "rachel", name: "Rachel", desc: "Clear, neutral American accent. The go-to voice for professional voiceovers and audiobooks.", gender: "Female", age: "Middle aged", language: "English", color: "#f43f5e" },
  { slug: "bella", name: "Bella", desc: "Soft and soothing voice perfect for meditation guides, calming content and gentle narration.", gender: "Female", age: "Young", language: "English", color: "#d946ef" },
  { slug: "charlotte", name: "Charlotte", desc: "British female voice with natural warmth. Great for storytelling, lifestyle and fashion content.", gender: "Female", age: "Middle aged", language: "English", color: "#7c3aed" },
  { slug: "emily", name: "Emily", desc: "Young and lively American voice ideal for social media, vlogs and upbeat narration.", gender: "Female", age: "Young", language: "English", color: "#f97316" },
  { slug: "sarah", name: "Sarah", desc: "Confident and engaging female voice with a neutral American accent suitable for any topic.", gender: "Female", age: "Young", language: "English", color: "#f59e0b" },
  { slug: "matilda", name: "Matilda", desc: "Warm and nurturing voice great for educational, kids content and friendly brand voiceovers.", gender: "Female", age: "Middle aged", language: "English", color: "#22c55e" },
  { slug: "freya", name: "Freya", desc: "Dynamic and expressive voice perfect for gaming, entertainment and high-energy content.", gender: "Female", age: "Young", language: "English", color: "#10b981" },
  { slug: "grace", name: "Grace", desc: "Elegant and articulate voice suited for news-style narration, documentaries and formal content.", gender: "Female", age: "Middle aged", language: "English", color: "#84cc16" },
];

export function voiceBySlug(slug: string): Voice {
  return VOICES.find((v) => v.slug === slug) ?? VOICES[0];
}
