import { ConfirmDialog, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

const noop = () => {};

// Built on Modal. Cancel/Confirm labels come from the app's i18n catalogue;
// pass confirmLabel to name the action. onConfirm may be async — the dialog
// shows busy state and closes itself when it resolves.
export const Default = () => (
  <ConfirmDialog
    open
    title="Publish 6 clips?"
    message="They'll be posted to your connected YouTube channel on the schedule you set."
    confirmLabel="Publish"
    onConfirm={noop}
    onClose={noop}
  />
);

// `danger` turns the confirm button solid red — use it for anything irreversible.
export const Danger = () => (
  <ConfirmDialog
    open
    danger
    title="Delete project?"
    message="“Podcast episode 42” and its 12 clips will be permanently deleted. This can't be undone."
    confirmLabel="Delete project"
    onConfirm={noop}
    onClose={noop}
  />
);
