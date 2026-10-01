import type { ComponentProps } from "react";
import type { Tabs } from "expo-router/js-tabs";
import { TabBar, type TabKey } from "@/components";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const KEYS: TabKey[] = ["home", "projects", "create", "social", "you"];

// Connects the design-system TabBar to Expo Router's tab navigator.
// Emits `tabPress` like the stock bar does, so pressing the active tab pops
// its stack back to the tab's root screen.
export function RouterTabBar({ state, navigation }: TabBarProps) {
  const current = state.routes[state.index]?.name;
  const active = (KEYS.includes(current as TabKey) ? current : "home") as TabKey;

  return (
    <TabBar
      active={active}
      onSelect={(key) => {
        const route = state.routes.find((r) => r.name === key);
        if (!route) return;
        const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
        if (!event.defaultPrevented && key !== current) navigation.navigate(route.name, route.params);
      }}
    />
  );
}
