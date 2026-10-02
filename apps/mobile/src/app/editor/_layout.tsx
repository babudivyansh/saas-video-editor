import { Stack } from "expo-router";
import { colors } from "@/theme";

// The editor is a full-screen modal (root layout). Panels are the editor in
// "panel mode" (design/screens/BN-Ed*.html): each is its own screen so Back
// returns to the timeline, shown without a transition so switching panels
// reads as one screen changing. Export is a modal of its own.
export default function EditorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "none" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="export" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
