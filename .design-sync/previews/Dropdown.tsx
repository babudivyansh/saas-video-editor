import { useEffect } from "react";
import { Button, Dropdown, DropdownItem, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

// Preview-only: opens the menu once on mount through the component's own
// `toggle`, so the card shows the real open state instead of a closed trigger.
function OpenOnMount({ toggle }: { toggle: () => void }) {
  useEffect(() => { toggle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Both `trigger` and `children` are render functions. `trigger` receives
// { open, toggle }; `children` receives { close } — call it after an action.
export const ProjectActions = () => (
  <div className="pb-40">
    <Dropdown
      trigger={({ toggle }) => (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={toggle}>Actions</Button>
          <OpenOnMount toggle={toggle} />
        </>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem onClick={close}>Rename</DropdownItem>
          <DropdownItem onClick={close}>Duplicate</DropdownItem>
          <DropdownItem onClick={close}>Download all clips</DropdownItem>
          <DropdownItem onClick={close} danger>Delete project</DropdownItem>
        </>
      )}
    </Dropdown>
  </div>
);

// align="right" pins the menu to the trigger's right edge — for triggers near
// the right side of a row or header.
export const AlignedRight = () => (
  <div className="pb-40 flex justify-end max-w-md">
    <Dropdown
      align="right"
      trigger={({ toggle }) => (
        <>
          <Button type="button" variant="secondary" size="sm" onClick={toggle}>Sort: Newest</Button>
          <OpenOnMount toggle={toggle} />
        </>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem onClick={close}>Newest</DropdownItem>
          <DropdownItem onClick={close}>Highest score</DropdownItem>
          <DropdownItem onClick={close}>Longest</DropdownItem>
        </>
      )}
    </Dropdown>
  </div>
);
