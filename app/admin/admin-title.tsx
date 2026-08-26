"use client";

// Lets a page set the title shown in the persistent admin header without the
// header itself living inside that page — needed once the header moved from
// AdminShell (mounted fresh per page) into app/admin/layout.tsx (mounted
// once per session). A page calls useAdminTitle("X") — including with a
// title that only resolves after data loads, e.g. a user's name — and the
// layout reads the current value with useAdminTitleValue().

import { createContext, useContext, useEffect, useState } from "react";

const AdminTitleContext = createContext<{ title: string; setTitle: (t: string) => void } | null>(null);

export function AdminTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("Admin");
  return <AdminTitleContext.Provider value={{ title, setTitle }}>{children}</AdminTitleContext.Provider>;
}

export function useAdminTitle(title: string) {
  const ctx = useContext(AdminTitleContext);
  useEffect(() => {
    ctx?.setTitle(title);
  }, [ctx, title]);
}

export function useAdminTitleValue() {
  const ctx = useContext(AdminTitleContext);
  return ctx?.title ?? "Admin";
}
