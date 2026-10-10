import type { NextRequest } from "next/server";
import { contactRequest } from "@clipiro/shared";
import { POST as webContact } from "@/app/api/contact/route";
import { callWeb, mobileError, mobileJson, parseBody, webError, withMobileAuth } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";

// POST /api/mobile/v1/support/contact { subject, message } → { ok }: the web's
// contact form (emailed to the team), signed with the account's own name and
// email so the reply reaches them.
export const POST = withRateLimit(
  withMobileAuth(async (req: NextRequest, auth) => {
    const body = await parseBody(req, contactRequest);
    if (!body.ok) return body.res;
    const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { name: true, email: true } });
    if (!user) return mobileError(404, "Account not found");
    const r = await callWeb(webContact, req, { name: (user.name ?? "").trim() || user.email.split("@")[0], email: user.email, subject: body.data.subject, message: body.data.message });
    return r.status >= 400 ? webError(r) : mobileJson({ ok: true });
  }),
  { limit: 5, windowSec: 3600, keyBy: "user", name: "mobile:support-contact" },
);
