import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { derived } from "@/theme";

// Android draws edge to edge: without this, scrolled content runs under the
// clock and icons. Put it last inside a screen that scrolls under the status bar.
export function StatusBarScrim() {
  const { top } = useSafeAreaInsets();
  return <View style={[styles.scrim, { height: top, pointerEvents: "none" }]} />;
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: derived.statusBar },
});
