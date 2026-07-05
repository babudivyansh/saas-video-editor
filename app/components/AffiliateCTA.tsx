"use client";

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { ZapIcon } from "@/app/components/landing/icons";

export default function AffiliateCTA() {
  const { user, openAuthModal } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      {user ? (
        <Link
          href="/dashboard/referral"
          className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:bg-brand-dark"
        >
          <ZapIcon className="h-4 w-4" />
          Go to your referral dashboard
        </Link>
      ) : (
        <button
          onClick={() => openAuthModal("register")}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-8 py-3.5 text-base font-bold text-white shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:bg-brand-dark"
        >
          <ZapIcon className="h-4 w-4" />
          Join the affiliate program
        </button>
      )}
      <a
        href="/affiliate-tos"
        className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-8 py-3.5 text-base font-semibold text-gray-700 transition-colors hover:bg-gray-50"
      >
        Read the full terms
      </a>
    </div>
  );
}
