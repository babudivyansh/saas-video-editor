import { useEffect, useRef } from "react";
import { Tooltip } from "@clipiro/ui";

function CreditsInfo() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <Tooltip content="140 credits included every month">
      <button
        ref={ref}
        type="button"
        style={{
          width: 20,
          height: 20,
          borderRadius: "999px",
          border: "1px solid #d1d5db",
          background: "#fff",
          fontSize: 12,
          fontWeight: 700,
          color: "#6b7280",
          cursor: "pointer",
        }}
      >
        i
      </button>
    </Tooltip>
  );
}

export function OnHover() {
  return (
    <div style={{ paddingTop: 48, display: "flex", justifyContent: "center" }}>
      <CreditsInfo />
    </div>
  );
}
