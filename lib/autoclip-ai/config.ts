// Server half of the AutoClip AI config: the Config-table read. Everything
// else lives in config-shared.ts so client code can import it without Prisma.

import { prisma } from "@/lib/prisma";
import { AUTOCLIP_AI_DEFAULTS, CONFIG_KEY, mergeAutoClipAiConfig, type AutoClipAiConfig } from "@/lib/autoclip-ai/config-shared";

export * from "@/lib/autoclip-ai/config-shared";

export async function getAutoClipAiConfig(): Promise<AutoClipAiConfig> {
  try {
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    return mergeAutoClipAiConfig(row ? JSON.parse(row.value) : null);
  } catch {
    return structuredClone(AUTOCLIP_AI_DEFAULTS);
  }
}
