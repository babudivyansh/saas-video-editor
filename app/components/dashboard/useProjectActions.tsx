"use client";

// Rename + delete for a project card, shared by the dashboard's "Continue
// where you left off" rail and the Clips library.
//
// Neither surface offered any way to manage a project: the dashboard cards had
// no affordance at all and the Clips page was entirely read-only, so a user
// whose rail filled with empty drafts had no way to clear them. The server side
// already existed — DELETE and PATCH on /api/projects/[id] are both
// tenant-scoped — this is the missing UI half.
//
// The two pages draw very different cards, so this shares the behaviour and
// the overlays while leaving each page its own markup. Labels are injected
// rather than translated here because the dashboard is localised and the Clips
// page is not.

import { useState } from "react";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import { useToast } from "@/app/components/ui/Toast";

export interface ProjectTarget {
  id: string;
  title: string;
}

interface Labels {
  rename: string;
  delete: string;
  renameTitle: string;
  renameMessage: string;
  renameConfirm: string;
  deleteTitle: string;
  /** Receives the project title. */
  deleteMessage: (title: string) => string;
  deleteConfirm: string;
  deleted: string;
  renamed: string;
  failed: string;
}

interface Options {
  labels: Labels;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, title: string) => void;
}

export function useProjectActions({ labels, onDeleted, onRenamed }: Options) {
  const { showToast } = useToast();
  const menu = useContextMenu<ProjectTarget>();
  const [pendingDelete, setPendingDelete] = useState<ProjectTarget | null>(null);
  const [renaming, setRenaming] = useState<ProjectTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function runDelete() {
    if (!pendingDelete) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${pendingDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      // Checked deliberately: the pre-existing delete in profile/my-videos
      // ignores res.ok and removes the card even on a 401 or 500, so the row
      // reappears on the next load with no explanation.
      if (!res.ok) throw new Error("delete failed");
      onDeleted(pendingDelete.id);
      showToast(labels.deleted, "success");
    } catch {
      showToast(labels.failed, "error");
    } finally {
      setPendingDelete(null);
    }
  }

  async function runRename() {
    if (!renaming) return;
    const title = renameValue.trim();
    if (!title || title === renaming.title) {
      setRenaming(null);
      return;
    }
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(`/api/projects/${renaming.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("rename failed");
      onRenamed(renaming.id, title);
      showToast(labels.renamed, "success");
    } catch {
      showToast(labels.failed, "error");
    } finally {
      setRenaming(null);
    }
  }

  const overlays = (
    <>
      <ContextMenu open={menu.open} x={menu.x} y={menu.y} onClose={menu.close}>
        {menu.data && (
          <>
            <ContextMenuItem
              onClick={() => {
                setRenaming(menu.data!);
                setRenameValue(menu.data!.title);
                menu.close();
              }}
            >
              {labels.rename}
            </ContextMenuItem>
            <ContextMenuItem danger onClick={() => { setPendingDelete(menu.data!); menu.close(); }}>
              {labels.delete}
            </ContextMenuItem>
          </>
        )}
      </ContextMenu>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={labels.deleteTitle}
        message={pendingDelete ? labels.deleteMessage(pendingDelete.title) : ""}
        confirmLabel={labels.deleteConfirm}
        danger
        onClose={() => setPendingDelete(null)}
        onConfirm={runDelete}
      />

      <ConfirmDialog
        open={renaming !== null}
        title={labels.renameTitle}
        message={labels.renameMessage}
        confirmLabel={labels.renameConfirm}
        confirmDisabled={!renameValue.trim()}
        onClose={() => setRenaming(null)}
        onConfirm={runRename}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && renameValue.trim()) void runRename(); }}
          className="w-full rounded-xl border border-card-border px-3 py-2 text-sm text-ink outline-none focus:border-brand"
        />
      </ConfirmDialog>
    </>
  );

  return {
    /**
     * Wire to the card's kebab button. `show` calls preventDefault, which is
     * what stops the surrounding Card's next/link from navigating.
     */
    openMenu: menu.show,
    overlays,
  };
}
