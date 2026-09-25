import { ContextMenu, ContextMenuItem, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

const noop = () => {};

// ContextMenuItem is DropdownItem under a menu-appropriate name — same props
// (onClick, icon, danger). Use it inside ContextMenu.
export const InMenu = () => (
  <ContextMenu open x={140} y={60} onClose={noop}>
    <ContextMenuItem onClick={noop}>Copy link</ContextMenuItem>
    <ContextMenuItem onClick={noop}>Duplicate</ContextMenuItem>
    <ContextMenuItem onClick={noop} danger>Remove from project</ContextMenuItem>
  </ContextMenu>
);
