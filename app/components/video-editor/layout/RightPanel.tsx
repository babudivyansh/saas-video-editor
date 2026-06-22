"use client";

import PropertiesPanel from "../properties/PropertiesPanel";

export default function RightPanel() {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-hidden"
      style={{ width: 260, borderLeft: "1px solid #27272a", background: "#141416" }}
    >
      <div
        className="px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid #27272a" }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#52525b" }}>
          Properties
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <PropertiesPanel />
      </div>
    </div>
  );
}
