"use client";

import { useEffect, useState } from "react";
import type { TabItem } from "../ui";

/** Tracks which properties-panel tab is active, resetting to the first tab
 *  whenever the selected clip changes (so e.g. leaving a video clip's
 *  "effects" tab and selecting a text clip doesn't try to land on a tab id
 *  that type doesn't have). */
export function useClipTab(clipId: string, items: TabItem[]) {
  const [activeTab, setActiveTab] = useState(items[0].id);

  useEffect(() => {
    setActiveTab(items[0].id);
    // Only the clip identity should reset the tab — `items` is a fresh
    // array reference every render, but its content only actually changes
    // when the clip's type (and therefore its tab list) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId]);

  return [activeTab, setActiveTab] as const;
}
