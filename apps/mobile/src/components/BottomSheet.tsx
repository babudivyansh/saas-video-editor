import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, derived, radius, type } from "@/theme";
import { IconButton } from "./IconButton";

// Sheet: radius 24 top corners, surface2, lineStrong top border, 40×4 handle
// (design/screens/BN-EdCaptions.html panel). Built on Modal so it works with
// TalkBack focus trapping and the Android back button out of the box.
// Swipe-to-dismiss and snap points come with the editor in Phase 9.
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sheet" />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.head}>
              <Text style={type(17, "bold")} accessibilityRole="header">
                {title}
              </Text>
              <IconButton icon="close" accessibilityLabel="Close" variant="plain" onPress={onClose} />
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: derived.scrim },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 16,
    gap: 12,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.lineStrong, marginTop: 8 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
