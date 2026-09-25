import { useEffect, useRef } from "react";
import { Button, Tooltip } from "@clipiro/ui";

// The bubble is CSS-only: it appears on hover or keyboard focus of the wrapped
// element. Previews focus the trigger so the real bubble is visible.
function Focused({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus(); }, []);
  return <span ref={ref}>{children}</span>;
}

// The bubble is a fixed w-56 centred on its trigger, so give the trigger room
// on both sides — near a container edge the bubble overflows it.
export const Top = () => (
  <div className="pt-20 flex justify-center">
    <Focused>
      <Tooltip content="Uses 12 credits per minute of source video">
        <Button type="button" size="sm">Generate clips</Button>
      </Tooltip>
    </Focused>
  </div>
);

export const Bottom = () => (
  <div className="flex justify-center" style={{ paddingBottom: 80 }}>
    <Focused>
      <Tooltip content="Virality score: how likely this clip is to hold attention" position="bottom">
        <Button type="button" size="sm" variant="secondary">Score 87</Button>
      </Tooltip>
    </Focused>
  </div>
);
