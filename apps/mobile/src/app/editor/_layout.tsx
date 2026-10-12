import { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { colors, radius } from "@/theme";

// The editor is a full-screen modal (root layout). Its tool panels open as
// bottom sheets over the timeline; Export is a modal of its own.
type ScreenOptions = NonNullable<ComponentProps<typeof Stack.Screen>["options"]>;

const PANEL: ScreenOptions = {
  presentation: "formSheet",
  sheetAllowedDetents: [0.6, 0.95],
  sheetCornerRadius: radius.sheet,
  sheetGrabberVisible: true,
  contentStyle: { backgroundColor: colors.surface2 },
};

export default function EditorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="media" options={PANEL} />
      <Stack.Screen name="captions" options={PANEL} />
      <Stack.Screen name="audio" options={PANEL} />
      <Stack.Screen name="text" options={PANEL} />
      <Stack.Screen name="effects" options={PANEL} />
      <Stack.Screen name="ai-tools" options={PANEL} />
      <Stack.Screen name="export" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
