import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/theme";

/**
 * Scroll padding for a screen: clears the status bar at the top and, inside
 * the tabs, the floating tab bar at the bottom, so nothing sits under it.
 */
export function useScreenPadding({ inTabs = true }: { inTabs?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + 16,
    paddingBottom: inTabs ? layout.tabBar.height + layout.tabBar.inset + insets.bottom + 24 : insets.bottom + 24,
  };
}
