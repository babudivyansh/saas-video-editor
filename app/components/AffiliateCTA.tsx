"use client";

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

export default function AffiliateCTA() {
  const { user, openAuthModal } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      {user ? (
        <Link
          href="/dashboard/referral"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-bold text-on-primary shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:bg-brand-dark"
        >
          Go to your referral dashboard
        </Link>
      ) : (
        <button
          onClick={() => openAuthModal("register")}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-bold text-on-primary shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:bg-brand-dark"
        >
          Join the affiliate program
        </button>
      )}
      <a
        href="/affiliate-tos"
        className="inline-flex items-center gap-2 rounded-full border border-line px-8 py-3.5 text-base font-semibold text-fg transition-colors hover:bg-surface-2"
      >
        Read the full terms
      </a>
    </div>
  );
}
