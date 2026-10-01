import { Tabs } from "expo-router/js-tabs";
import { RouterTabBar } from "@/navigation/RouterTabBar";
import { colors } from "@/theme";

// Floating pill tab bar: Home · Projects · Create (centre) · Social · You.
// Each tab is its own stack (see the _layout.tsx inside each folder), so a
// tab keeps its history when you switch away and back.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <RouterTabBar {...props} />}
      // Android convention: back on another tab's root returns to Home; back on
      // Home leaves the app. (Within a tab, back pops that tab's own stack.)
      backBehavior="firstRoute"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="projects" options={{ title: "Projects" }} />
      <Tabs.Screen name="create" options={{ title: "Create" }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="you" options={{ title: "You" }} />
    </Tabs>
  );
}
