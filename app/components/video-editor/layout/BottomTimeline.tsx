"use client";

import Timeline from "../timeline/Timeline";

export default function BottomTimeline() {
  return (
    <div
      className="flex-shrink-0"
      style={{
        height: 210,
        borderTop: "1px solid #e4e7ec",
        background: "#f6f7f9",
      }}
    >
      <Timeline />
    </div>
  );
}
