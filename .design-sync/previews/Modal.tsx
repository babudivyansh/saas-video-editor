import { Button, Modal, __dsSettleMotion } from "@clipiro/ui";

// Render the settled state — see .design-sync/preview-support.ts.
__dsSettleMotion();

const noop = () => {};

export const Dialog = () => (
  <Modal open onClose={noop} title="Rename project">
    <label className="block text-xs font-semibold text-fg-muted mb-1.5" htmlFor="project-name">Project name</label>
    <input
      id="project-name"
      defaultValue="Podcast episode 42"
      className="w-full rounded-[var(--radius-field)] border border-line bg-surface-1 px-3 py-2 text-sm text-fg outline-none focus:border-primary/60"
    />
    <div className="mt-6 flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm">Cancel</Button>
      <Button type="button" size="sm">Save</Button>
    </div>
  </Modal>
);

export const Drawer = () => (
  <Modal open onClose={noop} title="Clip settings" variant="drawer">
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-fg">Aspect ratio</p>
        <p className="text-fg-muted">9:16 — vertical, for Shorts, Reels and TikTok</p>
      </div>
      <div>
        <p className="font-semibold text-fg">Captions</p>
        <p className="text-fg-muted">Bold, word-by-word highlight</p>
      </div>
      <div>
        <p className="font-semibold text-fg">Clip length</p>
        <p className="text-fg-muted">30–60 seconds</p>
      </div>
    </div>
  </Modal>
);
