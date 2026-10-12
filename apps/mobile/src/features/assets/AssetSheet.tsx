import { ARCHIVE_RETENTION_DAYS, formatBytes, type Asset } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { BottomSheet, Button, ConfirmSheet, OptionList, TextField, useToast } from "@/components";
import { assets as assetsApi } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { colors, type } from "@/theme";
import { useAutoClipDraft } from "../create/draft";
import { startEdit } from "../editor/open";
import { mmss } from "../projects/format";
import { assetKeys, patchAssetEverywhere, useFolders } from "./queries";

type Mode = "menu" | "move" | "rename" | "delete";

/** Everything you can do with one file. Not drawn in the designs. */
export function AssetSheet({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const folders = useFolders();
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setMode("menu");
    onClose();
  };
  const refresh = () => qc.invalidateQueries({ queryKey: assetKeys.all });
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast(done, "success");
      close();
    } catch (e) {
      toast(apiErrorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  /** Shows the change at once; puts it back if the server says no. */
  const instant = async (change: Partial<Asset> | "remove", fn: () => Promise<unknown>, done: string | null, closeAfter: boolean) => {
    const undo = patchAssetEverywhere(qc, asset!.id, change);
    if (closeAfter) close();
    try {
      await fn();
      if (done) toast(done, "success");
      if (change === "remove") void qc.invalidateQueries({ queryKey: assetKeys.storage });
    } catch (e) {
      undo();
      toast(apiErrorMessage(e), "error");
    }
  };

  if (!asset) return null;
  const ready = asset.status === "ready";
  const meta = [asset.kind, asset.durationSec ? mmss(asset.durationSec) : null, formatBytes(asset.sizeBytes)].filter(Boolean).join(" · ");

  if (mode === "delete")
    return (
      <ConfirmSheet
        visible
        title="Delete for good?"
        body={`“${asset.name}” will be deleted now and its storage freed. This can't be undone.`}
        confirmLabel="Delete for good"
        busy={busy}
        onClose={() => setMode("menu")}
        onConfirm={() => run(() => assetsApi.remove(asset.id), "File deleted.")}
      />
    );

  return (
    <BottomSheet visible onClose={close} title={mode === "move" ? "Move to folder" : mode === "rename" ? "Rename" : asset.name}>
      {mode === "menu" ? (
        <>
          <Text style={type(12, "regular", { color: colors.fgMuted })}>{asset.archivedAt ? `Archived · ${meta}` : meta}</Text>
          {asset.status === "processing" ? <Text style={type(12, "regular", { color: colors.info })}>Still processing. You can use it once it’s ready.</Text> : null}
          <View style={{ gap: 8 }}>
            {asset.archivedAt ? (
              <Button label="Restore" icon="refresh" iconPosition="start" variant="secondary" size="sm" fullWidth loading={busy} onPress={() => void instant("remove", () => assetsApi.update(asset.id, { restore: true }), "Restored.", true)} />
            ) : (
              <>
                {asset.kind === "video" ? (
                  <Button
                    label="Use for AutoClip"
                    icon="scissors"
                    iconPosition="start"
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={!ready}
                    onPress={() => {
                      useAutoClipDraft.getState().setSource({ kind: "asset", assetId: asset.id, title: asset.name, durationSec: asset.durationSec ?? 60 });
                      close();
                      router.push("/create/autoclip");
                    }}
                  />
                ) : null}
                <Button label="Use in editor" icon="editor" iconPosition="start" variant="secondary" size="sm" fullWidth disabled={!ready} onPress={() => (close(), void startEdit({ from: "asset", assetId: asset.id }).then((err) => err && toast(err, "error")))} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label={asset.favorite ? "Starred" : "Star"}
                    icon="star"
                    iconPosition="start"
                    variant="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => void instant({ favorite: !asset.favorite }, () => assetsApi.update(asset.id, { favorite: !asset.favorite }), null, false)}
                  />
                  <Button label="Move" icon="folder" iconPosition="start" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setMode("move")} />
                </View>
                <Button label="Rename" icon="pencil" iconPosition="start" variant="secondary" size="sm" fullWidth onPress={() => (setName(asset.name), setMode("rename"))} />
                <Button
                  label={`Archive · kept ${ARCHIVE_RETENTION_DAYS} days`}
                  icon="trash"
                  iconPosition="start"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onPress={() => void instant("remove", () => assetsApi.archive(asset.id), `Archived. Restore it any time in the next ${ARCHIVE_RETENTION_DAYS} days.`, true)}
                />
              </>
            )}
            {asset.archivedAt ? <Button label="Delete for good" variant="danger" size="sm" fullWidth onPress={() => setMode("delete")} /> : null}
          </View>
        </>
      ) : mode === "move" ? (
        <View style={{ maxHeight: 380 }}>
          <OptionList
            accessibilityLabel="Folder"
            value={asset.folderId ?? "none"}
            options={[{ value: "none", label: "No folder" }, ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name, detail: `${f.fileCount} files` }))]}
            onChange={(id) => run(() => assetsApi.update(asset.id, { folderId: id === "none" ? null : id }), id === "none" ? "Removed from folder." : "Moved.")}
          />
        </View>
      ) : (
        <>
          <TextField label="Name" value={name} onChangeText={setName} autoFocus maxLength={200} returnKeyType="done" />
          <Button label="Save" variant="secondary" size="sm" fullWidth loading={busy} onPress={() => run(() => assetsApi.update(asset.id, { name: name.trim() }), "Renamed.")} />
        </>
      )}
      {mode !== "menu" ? <Button label="Back" variant="ghost" size="md" onPress={() => setMode("menu")} /> : null}
    </BottomSheet>
  );
}
