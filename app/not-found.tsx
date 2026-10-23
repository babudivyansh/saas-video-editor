import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";

// Wrapped in the marketing navbar and footer so a dead link still leaves the
// visitor somewhere they can navigate from. The second button depends on
// whether a session cookie is present: "Dashboard" means nothing to someone
// who has never signed up.
export default async function NotFound() {
  // lib/auth.ts SESSION_COOKIE_NAME (not imported: it pulls in Prisma and Redis).
  const signedIn = (await cookies()).has("session");
  return (
    <>
      <SiteNavbar />
      <main className="min-h-[70vh] bg-bg text-fg flex flex-col items-center justify-center px-4 py-20">
        <div className="flex flex-col items-center text-center max-w-md">
          <Image src="/icon.png" alt="" width={48} height={48} className="rounded-xl" />
          <p className="mt-6 text-7xl font-black text-surface-3 select-none" aria-hidden="true">404</p>
          <h1 className="mt-2 text-2xl font-bold text-fg">Page not found</h1>
          <p className="mt-3 text-fg-muted text-sm leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/"
              className="px-5 py-2.5 rounded-full bg-brand hover:bg-primary-hover text-on-primary text-sm font-semibold transition-colors"
            >
              Go home
            </Link>
            <Link
              href={signedIn ? "/dashboard" : "/pricing"}
              className="px-5 py-2.5 rounded-full border border-line hover:border-line-strong text-fg-muted hover:text-fg text-sm font-semibold transition-colors"
            >
              {signedIn ? "Dashboard" : "See pricing"}
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
