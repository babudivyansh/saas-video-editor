"use client";

// Shared keyboard behaviour for menu-like popovers (Dropdown, ContextMenu):
// focus moves into the first menu item on open, ArrowUp/Down cycle through
// items, Home/End jump, and focus returns to whatever had it before the menu
// opened. Items are discovered by [role="menuitem"], so DropdownItem rows
// work in both hosts unchanged.

import { useEffect } from "react";

export function useMenuNav(ref: React.RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const lastFocused = document.activeElement as HTMLElement | null;

    const items = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);

    // Deferred a frame so the open animation/portal has mounted the items.
    const t = requestAnimationFrame(() => items()[0]?.focus());

    function onKeyDown(e: KeyboardEvent) {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = items();
      if (list.length === 0) return;
      e.preventDefault();
      const current = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0 :
        e.key === "End" ? list.length - 1 :
        e.key === "ArrowDown" ? (current + 1) % list.length :
        (current - 1 + list.length) % list.length;
      list[next]?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(t);
      document.removeEventListener("keydown", onKeyDown);
      lastFocused?.focus();
    };
  }, [ref, open]);
}
