"use client";

// Lets a page set the title shown in the persistent admin header without the
// header itself living inside that page — needed once the header moved from
// AdminShell (mounted fresh per page) into app/admin/layout.tsx (mounted
// once per session). A page calls useAdminTitle("X") — including with a
// title that only resolves after data loads, e.g. a user's name — and the
// layout reads the current value with useAdminTitleValue().

import { createContext, useContext, useEffect, useState } from "react";

interface AdminChrome {
  title: string;
  setTitle: (t: string) => void;
  /** The dashboard needs the full viewport for a 12-column grid plus a rail;
   *  every other admin page keeps the reading-width column. */
  wide: boolean;
  setWide: (w: boolean) => void;
}

const AdminTitleContext = createContext<AdminChrome | null>(null);

export function AdminTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("Admin");
  const [wide, setWide] = useState(false);
  return (
    <AdminTitleContext.Provider value={{ title, setTitle, wide, setWide }}>
      {children}
    </AdminTitleContext.Provider>
  );
}

export function useAdminTitle(title: string, wide = false) {
  const ctx = useContext(AdminTitleContext);
  const setTitle = ctx?.setTitle;
  const setWide = ctx?.setWide;
  useEffect(() => {
    setTitle?.(title);
  }, [setTitle, title]);
  // Reset on unmount so navigating away from the dashboard restores the
  // narrow column for the next page, which never asks for it.
  useEffect(() => {
    setWide?.(wide);
    return () => setWide?.(false);
  }, [setWide, wide]);
}

export function useAdminTitleValue() {
  const ctx = useContext(AdminTitleContext);
  return ctx?.title ?? "Admin";
}

export function useAdminWide() {
  const ctx = useContext(AdminTitleContext);
  return ctx?.wide ?? false;
}
