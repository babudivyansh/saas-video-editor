"use client";

// Left-nav column for the account section: avatar + name/email header, then a
// vertical list of links to each account sub-page. Reuses the exact avatar
// upload pattern from AccountSettings.tsx (upload -> PATCH avatarUrl ->
// refreshUser()) so there's only one implementation of that flow in the app.

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";

function IcCamera() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function IcSpinner() {
  return <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />;
}
function IcVideo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 10l5-3v10l-5-3" />
    </svg>
  );
}
function IcUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IcBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12 2l3 5.5 6 .9-4.4 4.2 1 6-5.6-3-5.6 3 1-6L3 8.4l6-.9z" />
    </svg>
  );
}
function IcCoin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.2 9.3c0-1.1 1.1-1.8 2.8-1.8s2.8.8 2.8 1.7-1.2 1.4-2.8 1.4-2.8.5-2.8 1.6 1.2 1.8 2.8 1.8 2.8-.6 2.8-1.7" />
    </svg>
  );
}
function IcMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  );
}
function IcReceipt() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

const NAV_ITEMS = [
  { label: "My Videos", href: "/dashboard/profile/my-videos", icon: IcVideo },
  { label: "Personal Info", href: "/dashboard/profile/personal-info", icon: IcUser },
  { label: "Subscription", href: "/dashboard/profile/subscription", icon: IcBadge },
  { label: "Credits", href: "/dashboard/profile/credits", icon: IcCoin },
  { label: "Message", href: "/dashboard/profile/message", icon: IcMessage },
  { label: "Payment History", href: "/dashboard/profile/payment-history", icon: IcReceipt },
];

export default function AccountNav() {
  const { user, token, refreshUser } = useAuth();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const up = await fetch("/api/upload?skipAsset=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const upData = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !upData.url) throw new Error(upData.error ?? "Upload failed");
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: upData.url }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      await refreshUser();
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Avatar upload failed.");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <aside className="w-72 flex-shrink-0 sticky top-8">
      <div className="rounded-[var(--radius-card)] border border-card-border bg-white p-6">
        {/* Avatar + identity */}
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            {user?.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt="avatar"
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-full grad-brand flex items-center justify-center text-white text-3xl font-extrabold select-none shadow-sm">
                {(user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Change avatar"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white shadow border border-card-border flex items-center justify-center text-ink-soft hover:text-brand transition-colors cursor-pointer"
            >
              {uploadingAvatar ? <IcSpinner /> : <IcCamera />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <p className="mt-3 text-base font-bold text-ink truncate max-w-full">{user?.name || user?.email || "—"}</p>
          {user?.email && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft/70 truncate max-w-full">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {user.email}
            </p>
          )}
          {avatarError && <p className="mt-2 text-xs text-red-600">{avatarError}</p>}
        </div>

        {/* Nav list */}
        <nav className="mt-6 space-y-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "bg-tint-violet text-brand" : "text-ink-soft hover:bg-tint-blue hover:text-ink"
                }`}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full grad-brand" />}
                <Icon />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
