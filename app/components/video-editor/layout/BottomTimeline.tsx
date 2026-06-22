"use client";

import Timeline from "../timeline/Timeline";

export default function BottomTimeline() {
  return (
    <div
      className="flex-shrink-0"
      style={{
        height: 210,
        borderTop: "1px solid #27272a",
        background: "#111113",
      }}
    >
      <Timeline />
    </div>
  );
}
