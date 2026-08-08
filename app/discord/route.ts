import { redirect } from "next/navigation";
import { env } from "@/lib/env";

export async function GET() {
  const discordUrl = env.NEXT_PUBLIC_DISCORD_INVITE_URL || "https://discord.gg/F7jftK3fxe";
  redirect(discordUrl);
}
