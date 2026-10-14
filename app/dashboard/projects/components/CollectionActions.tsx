"use client";

import { useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Input } from "@/app/components/ui/Field";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { ContextMenu, ContextMenuItem, useContextMenu } from "@/app/components/ui/ContextMenu";
import { useToast } from "@/app/components/ui/Toast";
import { useCollectionMutations, type CollectionRow } from "../hooks/useCollections";

// New / rename / delete for clip collections: the dialogs and the tile's "⋯"
// menu, as one hook so the projects page and the clips page's "Add to
// collection" share the same naming dialog.

type NameDialog = { mode: "create" } | { mode: "rename"; collection: CollectionRow };

export function useCollectionActions({ onCreated }: { onCreated?: (c: CollectionRow) => void } = {}) {
  const { showToast } = useToast();
  const { create, rename, remove } = useCollectionMutations();
  const menu = useContextMenu<CollectionRow>();
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CollectionRow | null>(null);

  const openDialog = (d: NameDialog) => {
    setDialog(d);
    setName(d.mode === "rename" ? d.collection.name : "");
    setError(null);
  };
  const busy = create.isPending || rename.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the collection a name");
      return;
    }
    try {
      if (dialog.mode === "create") {
        const { collection } = await create.mutateAsync(trimmed);
        showToast("Collection created", "success");
        onCreated?.(collection);
      } else {
        await rename.mutateAsync({ id: dialog.collection.id, name: trimmed });
        showToast("Collection renamed", "success");
      }
      setDialog(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
      showToast("Collection deleted", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
    setPendingDelete(null);
  }

  const overlays = (
    <>
      <ContextMenu open={menu.open} x={menu.x} y={menu.y} onClose={menu.close}>
        <ContextMenuItem
          onClick={() => {
            if (menu.data) openDialog({ mode: "rename", collection: menu.data });
            menu.close();
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          danger
          onClick={() => {
            if (menu.data) setPendingDelete(menu.data);
            menu.close();
          }}
        >
          Delete
        </ContextMenuItem>
      </ContextMenu>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.mode === "rename" ? "Rename collection" : "New collection"}
        maxWidth="max-w-md"
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            aria-label="Collection name"
            placeholder="Podcast hooks"
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            error={error}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {dialog?.mode === "rename" ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete collection?"
        message={`“${pendingDelete?.name ?? ""}” will be deleted. The clips in it stay in their projects.`}
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );

  return {
    startCreate: () => openDialog({ mode: "create" }),
    openMenu: menu.show,
    overlays,
  };
}
