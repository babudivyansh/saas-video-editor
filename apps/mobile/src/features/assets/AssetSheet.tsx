import { ARCHIVE_RETENTION_DAYS, formatBytes, type Asset } from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { BottomSheet, Button, ConfirmSheet, OptionList, TextField, useToast } from "@/components";
import { colors, type } from "@/theme";
import { errorMessage } from "@mocks/core";
import { deleteAsset, updateAsset } from "@mocks/assets";
import { useAutoClipDraft } from "../create/draft";
import { mmss } from "../projects/format";
import { assetKeys, useFolders } from "./queries";

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
  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: assetKeys.all });
      toast(done, "success");
      close();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
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
        body={`“${asset.name}” will be deleted now and can't be restored. To keep it for ${ARCHIVE_RETENTION_DAYS} days instead, archive it.`}
        confirmLabel="Delete for good"
        busy={busy}
        onClose={() => setMode("menu")}
        onConfirm={() => run(() => deleteAsset(asset.id), "File deleted.")}
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
              <Button label="Restore" icon="refresh" iconPosition="start" variant="secondary" size="sm" fullWidth loading={busy} onPress={() => run(() => updateAsset(asset.id, { archivedAt: null }), "Restored.")} />
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
                <Button label="Use in editor" icon="editor" iconPosition="start" variant="secondary" size="sm" fullWidth disabled={!ready} onPress={() => (close(), router.push("/editor"))} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label={asset.favorite ? "Starred" : "Star"}
                    icon="star"
                    iconPosition="start"
                    variant="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                    onPress={() => run(() => updateAsset(asset.id, { favorite: !asset.favorite }), asset.favorite ? "Removed from starred." : "Starred.")}
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
                  onPress={() => run(() => updateAsset(asset.id, { archivedAt: new Date().toISOString() }), "Archived. Restore it any time in the next 30 days.")}
                />
              </>
            )}
            <Button label="Delete for good" variant="danger" size="sm" fullWidth onPress={() => setMode("delete")} />
          </View>
        </>
      ) : mode === "move" ? (
        <View style={{ maxHeight: 380 }}>
          <OptionList
            accessibilityLabel="Folder"
            value={asset.folderId ?? "none"}
            options={[{ value: "none", label: "No folder" }, ...(folders.data ?? []).map((f) => ({ value: f.id, label: f.name, detail: `${f.fileCount} files` }))]}
            onChange={(id) => run(() => updateAsset(asset.id, { folderId: id === "none" ? null : id }), id === "none" ? "Removed from folder." : "Moved.")}
          />
        </View>
      ) : (
        <>
          <TextField label="Name" value={name} onChangeText={setName} autoFocus maxLength={200} returnKeyType="done" />
          <Button label="Save" variant="secondary" size="sm" fullWidth loading={busy} onPress={() => run(() => updateAsset(asset.id, { name: name.trim() }), "Renamed.")} />
        </>
      )}
      {mode !== "menu" ? <Button label="Back" variant="ghost" size="md" onPress={() => setMode("menu")} /> : null}
    </BottomSheet>
  );
}
