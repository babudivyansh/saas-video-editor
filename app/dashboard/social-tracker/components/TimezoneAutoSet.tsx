"use client";

// Gives every account without a timezone the browser's, once, silently.
//
// Until a zone is set, every time-of-day figure (best time to post, the
// composer's suggested slots, daily buckets) is worked out in UTC — "post at
// 8pm" then meant 8pm in London for a creator in Mumbai. The browser zone is
// right for nearly everyone, and Settings still lets anyone change it.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSocialApi } from "./useSocialApi";

export function TimezoneAutoSet({ accountIds }: { accountIds: string[] }) {
  const api = useSocialApi();
  const router = useRouter();
  const done = useRef(false);
  const key = accountIds.join(",");

  useEffect(() => {
    if (done.current || !key) return;
    done.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    void Promise.all(
      key.split(",").map((id) =>
        api(`/api/social/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ timezone }) }).then(
          () => true,
          () => false,
        ),
      ),
    ).then((results) => {
      if (results.some(Boolean)) router.refresh();
    });
  }, [api, key, router]);

  return null;
}
