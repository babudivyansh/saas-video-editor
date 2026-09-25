import { ContextMenu, ContextMenuItem, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

const noop = () => {};

// Right-click menu, portaled to <body> at viewport coordinates. In real use,
// pair it with the exported useContextMenu() hook:
//   const menu = useContextMenu<Clip>();
//   <div onContextMenu={(e) => menu.show(e, clip)}>…</div>
//   <ContextMenu open={menu.open} x={menu.x} y={menu.y} onClose={menu.close}>…</ContextMenu>
export const AssetMenu = () => (
  <ContextMenu open x={140} y={60} onClose={noop}>
    <ContextMenuItem onClick={noop}>Open in editor</ContextMenuItem>
    <ContextMenuItem onClick={noop}>Rename</ContextMenuItem>
    <ContextMenuItem onClick={noop}>Move to folder</ContextMenuItem>
    <ContextMenuItem onClick={noop} danger>Delete</ContextMenuItem>
  </ContextMenu>
);
