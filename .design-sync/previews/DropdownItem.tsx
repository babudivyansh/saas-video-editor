import { useEffect } from "react";
import { Button, Dropdown, DropdownItem, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

function OpenOnMount({ toggle }: { toggle: () => void }) {
  useEffect(() => { toggle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const Icon = ({ d }: { d: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

// A row inside a Dropdown (or ContextMenu, where it's exported as
// ContextMenuItem). `icon` sits before the label; `danger` marks destructive rows.
export const WithIconsAndDanger = () => (
  <div className="pb-40">
    <Dropdown
      trigger={({ toggle }) => (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={toggle}>Clip</Button>
          <OpenOnMount toggle={toggle} />
        </>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem onClick={close} icon={<Icon d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />}>Download MP4</DropdownItem>
          <DropdownItem onClick={close} icon={<Icon d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13" />}>Publish</DropdownItem>
          <DropdownItem onClick={close} icon={<Icon d="M3 6h18M8 6V4h8v2m-9 0l1 14h8l1-14" />} danger>Delete clip</DropdownItem>
        </>
      )}
    </Dropdown>
  </div>
);
