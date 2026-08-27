"use client";

// Shared debounce for search inputs — was previously hand-rolled separately
// per page (a setTimeout + useRef pattern duplicated in at least
// users/page.tsx and affiliate/page.tsx). Pages adopting react-query use
// this instead: the debounced value becomes part of the query key, so
// react-query's own caching/dedup does the rest.

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
