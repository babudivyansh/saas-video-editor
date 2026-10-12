import { router, type Href } from "expo-router";
import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { EmptyState, FilterPills, Header, IconButton, SkeletonCard, StatusBarScrim } from "@/components";
import { useScreenPadding } from "@/navigation/insets";
import { colors } from "@/theme";
import { errorMessage } from "@mocks/core";
import { useSocialAccounts } from "./queries";

type Tab = "overview" | "content" | "audience" | "competitors" | "reports";
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "content", label: "Content" },
  { value: "audience", label: "Audience" },
  { value: "competitors", label: "Competitors" },
  { value: "reports", label: "Reports" },
] as const;
const HREF: Record<Tab, Href> = {
  overview: "/social/insights/account-analytics",
  // No separate account-analytics Content design: it's the Insights Content screen.
  content: "/social/insights/content-performance",
  audience: "/social/insights/account-analytics/audience",
  competitors: "/social/insights/account-analytics/competitors",
  reports: "/social/insights/account-analytics/reports",
};

// Frame shared by the account-analytics screens (design/screens/BN-Social*.html).
export function AnalyticsShell({ tab, children, onRefresh }: { tab: Tab; children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const pad = useScreenPadding();
  const accounts = useSocialAccounts();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([accounts.refetch(), onRefresh?.()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.emeraldBright} colors={[colors.emeraldBright]} progressBackgroundColor={colors.surface2} />}
      >
        <Header
          title="Analytics"
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/social"))}
          actions={<IconButton icon="plus" accessibilityLabel="Connect an account" onPress={() => router.navigate("/social")} />}
        />
        <FilterPills
          accessibilityLabel="Analytics"
          options={TABS}
          value={tab}
          onChange={(t) => {
            if (t === tab) return;
            if (t === "content") router.push(HREF[t]);
            else router.replace(HREF[t]);
          }}
        />
        {accounts.isPending ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </>
        ) : accounts.isError ? (
          <EmptyState tone="error" title="Couldn’t load your accounts" body={errorMessage(accounts.error)} action={{ label: "Try again", onPress: () => accounts.refetch() }} />
        ) : accounts.data.length === 0 ? (
          <EmptyState icon="social" title="Connect an account first" body="Analytics fill in after YouTube, Instagram or Facebook is connected and synced." action={{ label: "Connect an account", onPress: () => router.navigate("/social") }} />
        ) : (
          children
        )}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
});
