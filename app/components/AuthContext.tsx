"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthUser, type AuthUser } from "./useAuthUser";
import { getSafeNextPath } from "@/lib/safe-redirect";

type User = AuthUser;

interface AuthModalState {
  isOpen: boolean;
  mode: "login" | "register";
  feature?: string;
  isFree?: boolean;
  /** Where to send the user after a successful login/register — the page they were actually trying to reach. */
  next?: string;
}

/** Current path+query, validated as a safe same-origin redirect target. Call only client-side. */
function currentSafeNext(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return getSafeNextPath(window.location.pathname + window.location.search) ?? undefined;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  authModal: AuthModalState;
  openAuthModal: (mode?: "login" | "register", feature?: string, isFree?: boolean) => void;
  closeAuthModal: () => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const FREE_TOOL_NAMES: Record<string, string> = {
  "/dashboard/tools/free/audio-balancer": "Audio Balancer",
  "/dashboard/tools/free/mp3-converter": "MP3 Converter",
  "/dashboard/tools/free/video-compressor": "Video Compressor",
};

// Gate by an allowlist of routes that actually require auth, rather than an
// allowlist of public ones — the inverse used to silently 401-gate any typo,
// stale link, or new public page nobody remembered to add (it did: /contact,
// /affiliate-program, /cookies, and /reset-password were never in the old
// PUBLIC_ROUTES list, and neither is a genuine 404). /admin and /billing have
// their own auth handling and are deliberately not included here.
const GATED_PREFIXES = ["/dashboard", "/editor"];

function requiresAuthGate(pathname: string) {
  return GATED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  // Distinguishes "haven't checked localStorage yet" from "checked, no token"
  // — without it there'd be a one-tick flash of logged-out state on mount.
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);
  const [authModal, setAuthModal] = useState<AuthModalState>({
    isOpen: false,
    mode: "login",
  });

  // Shared query — the billing page (and anywhere else) calling useAuthUser
  // with the same token shares this cached request instead of independently
  // re-fetching /api/auth/me.
  const { data: user, isLoading: userLoading, isError, refetch } = useAuthUser(token);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
    setHasCheckedStorage(true);
  }, []);

  // fetchAuthUser resolves to null (not a thrown error) when the token is
  // expired/invalid — clear it client-side. A thrown error (network/offline)
  // leaves the stored token alone so a reconnect can retry.
  useEffect(() => {
    if (token && !userLoading && !isError && user === null) {
      localStorage.removeItem("token");
      setToken(null);
    }
  }, [token, userLoading, isError, user]);

  const isLoading = !hasCheckedStorage || (!!token && userLoading);

  const refreshUser = async () => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
    if (storedToken) await refetch();
  };

  // Monitor path changes to trigger login prompt for protected routes
  useEffect(() => {
    if (isLoading) return;

    if (!user && requiresAuthGate(pathname)) {
      const freeTool = FREE_TOOL_NAMES[pathname];
      setAuthModal({
        isOpen: true,
        mode: "login",
        next: currentSafeNext(),
        ...(freeTool ? { feature: freeTool, isFree: true } : {}),
      });
    }
  }, [pathname, user, isLoading]);

  // Inverse case: a signed-in user shouldn't land back on the marketing page
  // (e.g. clicking the logo, or opening a bookmark to "/") — send them to
  // the dashboard instead.
  useEffect(() => {
    if (isLoading) return;
    if (user && pathname === "/") {
      router.replace("/dashboard");
    }
  }, [pathname, user, isLoading, router]);

  const openAuthModal = (mode: "login" | "register" = "login", feature?: string, isFree?: boolean) => {
    setAuthModal({ isOpen: true, mode, feature, isFree, next: currentSafeNext() });
  };

  const closeAuthModal = () => {
    setAuthModal(prev => ({ ...prev, isOpen: false }));
  };

  // A one-tick race exists right after `token` first resolves: `isLoading`
  // can briefly read false (userLoading hasn't caught up to the now-enabled
  // query yet) while `user` is still unresolved, so the gating effect above
  // can open the modal for an instant even on a genuinely authenticated
  // session. Close it the moment real user data arrives rather than trying
  // to close the race itself — this fixes the symptom regardless of timing.
  useEffect(() => {
    if (user) closeAuthModal();
  }, [user]);

  const signOut = async () => {
    const storedToken = localStorage.getItem("token");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
    } catch {
      // Best-effort — still clear local state below even if this fails
    }
    localStorage.removeItem("token");
    setToken(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        token,
        isLoading,
        authModal,
        openAuthModal,
        closeAuthModal,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
