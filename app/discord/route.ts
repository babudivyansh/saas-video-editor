import { redirect } from "next/navigation";

export async function GET() {
  const discordUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || "https://discord.gg/h6FKmEp8hP";
  redirect(discordUrl);
}
