import {
  BRAND_COLOR_FIELDS,
  BRAND_COLOR_PRESETS,
  PLAN_LABEL,
  type BrandKitPatch,
} from "@clipiro/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  BottomSheet,
  Button,
  EmptyState,
  Icon,
  ListGroup,
  ListRow,
  OptionList,
  SkeletonCard,
  StatusBadge,
  TextField,
  useToast,
} from "@/components";
import { imageSource, sample } from "@/lib/images";
import { colors, derived, radius, type } from "@/theme";
import { me } from "@/lib/api";
import { apiErrorMessage as errorMessage } from "@/lib/errors";
import { uploadToAssets } from "../create/toolUpload";
import { useCaptionTemplates } from "../create/queries";
import { Label, Page } from "./bits";
import { useBrandKit, youKeys } from "./queries";

type ColorKey = (typeof BRAND_COLOR_FIELDS)[number]["key"];

// design/screens/BN-BrandKit. Colours are the caption colours the web's brand
// kit stores; watermark and intro/outro aren't in the product yet.
export function BrandKitScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const kit = useBrandKit();
  const templates = useCaptionTemplates();
  const [editingColor, setEditingColor] = useState<ColorKey | null>(null);
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState<string | undefined>();
  const [picking, setPicking] = useState<"font" | "style" | null>(null);

  const [logoBusy, setLogoBusy] = useState(false);
  const save = async (patch: BrandKitPatch, done?: string) => {
    try {
      const next = await me.saveBrandKit(patch);
      qc.setQueryData(youKeys.brandKit, next.kit);
      if (done) toast(done, "success");
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  const pickLogo = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
    });
    const file = res.canceled ? null : res.assets[0];
    if (!file) return;
    // The logo is kept in Assets, like any image, and the kit points at it.
    setLogoBusy(true);
    try {
      const asset = await uploadToAssets({ uri: file.uri, name: file.name, mimeType: file.mimeType ?? "image/png", sizeBytes: file.size ?? 0 }, () => {});
      await save({ logoAssetId: asset.id }, "Logo updated.");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setLogoBusy(false);
    }
  };

  const k = kit.data;
  const style = templates.data?.find((t) => t.id === k?.captionTemplateId);
  const colorField = BRAND_COLOR_FIELDS.find((f) => f.key === editingColor);

  return (
    <Page title="Brand Kit" onRefresh={() => kit.refetch()}>
      {kit.isPending ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </>
      ) : kit.isError ? (
        <EmptyState
          tone="error"
          title="Couldn’t load your brand kit"
          body={errorMessage(kit.error)}
          action={{ label: "Try again", onPress: () => kit.refetch() }}
        />
      ) : !k ? (
        <EmptyState
          icon="palette"
          title="No brand kit yet"
          body="Save your logo, caption colours and font once, and use them on every clip."
          action={{ label: "Create brand kit", onPress: () => save({}, "Brand kit created.") }}
        />
      ) : (
        <>
          <View style={styles.logoCard}>
            <View style={styles.logo}>
              {k.logoUrl ? (
                <Image
                  source={imageSource(k.logoUrl)}
                  style={styles.logoImage}
                  contentFit="contain"
                  accessibilityLabel="Your logo"
                />
              ) : (
                <Icon name="image" size={24} color={colors.fgMuted} />
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={type(16, "bold")}>Logo</Text>
              <Text style={type(12, "regular", { color: colors.fgMuted })}>
                PNG with transparency works best
              </Text>
            </View>
            <Button
              label={k.logoUrl ? "Replace" : "Add"}
              variant="secondary"
              size="md"
              onPress={pickLogo}
              loading={logoBusy}
              accessibilityLabel={k.logoUrl ? "Replace logo" : "Add logo"}
            />
          </View>

          <Label>Accent colour</Label>
          <View style={styles.swatches}>
            {BRAND_COLOR_FIELDS.map((f) => (
              <Pressable
                key={f.key}
                onPress={() => {
                  setEditingColor(f.key);
                  setHexDraft(k[f.key]);
                  setHexError(undefined);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${f.label} colour ${k[f.key]}. Change`}
                style={styles.swatchCol}
              >
                {/* User data: the swatch is the colour they chose. */}
                <View style={[styles.swatch, { backgroundColor: k[f.key] }]} />
                <Text style={type(13, "regular", { color: colors.fgMuted })}>{f.label}</Text>
                <Text style={type(12, "medium", { mono: true })}>{k[f.key]}</Text>
              </Pressable>
            ))}
          </View>

          <Label>Default caption style</Label>
          <Pressable
            onPress={() => setPicking("style")}
            accessibilityRole="button"
            accessibilityLabel={`Default caption style: ${style?.name ?? "none"}. Change`}
            style={styles.preview}
          >
            <Image
              source={sample("creator-violet")}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: derived.scrim }]} />
            {/* The caption in the kit's own colours (user data). */}
            <Text
              style={[type(22, "heavy", { color: k.baseColor }), styles.captionText]}
              allowFontScaling={false}
            >
              {"WATCH "}
              <Text style={{ color: k.highlightColor }}>THIS</Text>
              {" PART"}
            </Text>
            <View style={styles.styleBadge}>
              <Text style={type(12, "semibold")}>{style?.name ?? "Choose a style"}</Text>
            </View>
          </Pressable>

          <ListGroup>
            <ListRow
              first
              title="Logo watermark"
              subtitle="Your logo on every export"
              trailing={<StatusBadge label="Coming soon" tone="neutral" dot={false} />}
            />
            <ListRow
              title="Intro & outro"
              subtitle="A logo sting on every export"
              trailing={<StatusBadge label="Coming soon" tone="neutral" dot={false} />}
            />
          </ListGroup>
        </>
      )}

      <BottomSheet
        visible={!!editingColor}
        onClose={() => setEditingColor(null)}
        title={`${colorField?.label ?? ""} colour`}
      >
        <View style={styles.presets}>
          {BRAND_COLOR_PRESETS.map((c) => (
            <Pressable
              key={c}
              onPress={() => (setHexDraft(c), setHexError(undefined))}
              accessibilityRole="radio"
              aria-checked={hexDraft.toLowerCase() === c}
              accessibilityLabel={c}
              style={[
                styles.preset,
                { backgroundColor: c },
                hexDraft.toLowerCase() === c && styles.presetOn,
              ]}
            />
          ))}
        </View>
        <TextField
          label="Hex"
          value={hexDraft}
          onChangeText={(t) => (setHexDraft(t.trim()), setHexError(undefined))}
          error={hexError}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
        />
        <Button
          label="Save colour"
          size="sm"
          fullWidth
          onPress={async () => {
            if (!/^#[0-9a-fA-F]{6}$/.test(hexDraft))
              return setHexError("Use a hex colour like #20d68a");
            if (
              editingColor &&
              (await save({ [editingColor]: hexDraft.toLowerCase() }, "Colour saved."))
            )
              setEditingColor(null);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={picking === "style"}
        onClose={() => setPicking(null)}
        title="Default caption style"
      >
        <ScrollView style={{ maxHeight: 420 }}>
          <OptionList
            accessibilityLabel="Default caption style"
            value={k?.captionTemplateId ?? null}
            options={(templates.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
              trailing: t.tier !== "free" ? PLAN_LABEL[t.tier] : undefined,
            }))}
            onChange={(id) => (setPicking(null), save({ captionTemplateId: id }))}
          />
        </ScrollView>
      </BottomSheet>
    </Page>
  );
}

const styles = StyleSheet.create({
  logoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
    overflow: "hidden",
  },
  logoImage: { width: 44, height: 44 },
  swatches: { flexDirection: "row", gap: 10 },
  swatchCol: { flex: 1, gap: 6 },
  swatch: { height: 56, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.lineStrong },
  preview: {
    height: 112,
    borderRadius: radius.card,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  captionText: {
    textShadowColor: derived.shadow,
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 2 },
  },
  styleBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: derived.overlay,
  },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  presetOn: { borderWidth: 3, borderColor: colors.emeraldBright },
});
