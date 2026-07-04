"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

interface UserPlan {
  id: string;
  slug: string;
  name: string;
  credits: number;
  priceInPaise: number;
}

interface User {
  id: string;
  email: string;
  phone: string | null;
  credits: number;
  createdAt: string;
  role: "USER" | "ADMIN";
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
  gender: string | null;
  intendedUse: string | null;
  subscriptionEndsAt: string | null;
  nextRefillAt: string | null;
  monthlyCredits: number;
  veo3Enabled: boolean;
  veo3Credits: number;
  plan: UserPlan | null;
}

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
  signOut: () => void;
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
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route) && route !== "/");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModal, setAuthModal] = useState<AuthModalState>({
    isOpen: false,
    mode: "login",
  });

  const refreshUser = async () => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    setToken(storedToken);
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Token is expired/invalid
        localStorage.removeItem("token");
        setUser(null);
        setToken(null);
      }
    } catch {
      // Keep existing local token state in case of offline/network issues
    } finally {
      setIsLoading(false);
    }
  };

  // Run on mount
  useEffect(() => {
    refreshUser();
  }, []);

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

  const openAuthModal = (mode: "login" | "register" = "login", feature?: string, isFree?: boolean) => {
    setAuthModal({ isOpen: true, mode, feature, isFree });
  };

  const closeAuthModal = () => {
    setAuthModal(prev => ({ ...prev, isOpen: false }));
  };

  const signOut = () => {
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
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
