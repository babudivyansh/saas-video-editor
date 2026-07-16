"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthUser, type AuthUser } from "./useAuthUser";

type User = AuthUser;

interface AuthModalState {
  isOpen: boolean;
  mode: "login" | "register";
  feature?: string;
  isFree?: boolean;
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

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/register",
  "/pricing",
  "/billing",   // billing page handles its own auth redirect to /login
  "/about",
  "/blog",
  "/terms",
  "/privacy",
  "/refund",
  "/affiliate-tos",
];

const FREE_TOOL_NAMES: Record<string, string> = {
  "/dashboard/tools/free/audio-balancer": "Audio Balancer",
  "/dashboard/tools/free/mp3-converter": "MP3 Converter",
  "/dashboard/tools/free/video-compressor": "Video Compressor",
};

function isPublicRoute(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/admin")) return true;
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route) && route !== "/");
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

    const isPublic = isPublicRoute(pathname);
    if (!user && !isPublic) {
      const freeTool = FREE_TOOL_NAMES[pathname];
      setAuthModal({
        isOpen: true,
        mode: "login",
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
    setAuthModal({ isOpen: true, mode, feature, isFree });
  };

  const closeAuthModal = () => {
    setAuthModal(prev => ({ ...prev, isOpen: false }));
  };

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
