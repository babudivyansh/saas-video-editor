import type { GeneratedMedia } from "@clipiro/shared";
import { respond } from "./core";

// What's left of the Create tab's stand-in API: Enhance speech and Vocal
// remover until Phase 10.2 runs them as real jobs. Everything else in Create
// reads the API (src/test/mockServer.ts serves the fixtures in tests).
// Scenario (core.ts): "generate".

let seq = 0;

/** Enhance speech / vocal remover: returns the processed track. */
export async function runAudioTool(tool: "enhance" | "vocal", fileName: string): Promise<GeneratedMedia> {
  await respond("generate");
  return {
    id: `gen_${tool}_${++seq}`,
    kind: "audio",
    url: "mock://processed.mp3",
    title: `${tool === "enhance" ? "enhanced" : "instrumental"}-${fileName.replace(/\.[^.]+$/, "")}.mp3`,
    createdAt: new Date().toISOString(),
    favorite: false,
    assetId: `ast_ai_${tool}_${seq}`,
  };
}
