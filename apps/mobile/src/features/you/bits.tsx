import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { BottomSheet, Button, Header, Icon, StatusBarScrim, type IconName } from "@/components";
import { useScreenPadding } from "@/navigation/insets";
import { colors, radius, statusTint, text, type, withAlpha } from "@/theme";

/** Frame of the pushed You screens: back header, scroll, pull to refresh. */
export function Page({
  title,
  actions,
  onRefresh,
  children,
}: {
  title: string;
  actions?: ReactNode;
  onRefresh?: () => Promise<unknown>;
  children: ReactNode;
}) {
  const pad = useScreenPadding();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, pad]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await onRefresh();
                setRefreshing(false);
              }}
              tintColor={colors.emeraldBright}
              colors={[colors.emeraldBright]}
              progressBackgroundColor={colors.surface2}
            />
          ) : undefined
        }
      >
        <Header
          title={title}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/you"))}
          actions={actions}
        />
        {children}
      </ScrollView>
      <StatusBarScrim />
    </View>
  );
}

/** Uppercase section label ("YOUR STUDIO"). */
export function Label({ children }: { children: string }) {
  return (
    <Text style={[text.label, styles.label]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Icon in a rounded dark square: leading visual of list rows. */
export function IconChip({
  name,
  color = colors.emeraldBright,
}: {
  name: IconName;
  color?: string;
}) {
  return (
    <View style={styles.chip}>
      <Icon name={name} size={18} color={color} />
    </View>
  );
}

/** "Earn credits": what the referral program pays, and where it lives. */
export function ReferralSheet({
  visible,
  onClose,
  percent,
}: {
  visible: boolean;
  onClose: () => void;
  percent: number;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Earn credits">
      <Text style={type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 })}>
        Share your link and earn {percent}% of every payment from people who subscribe with it, for
        as long as they stay. Your link and payouts live in the affiliate program on clipiro.com.
      </Text>
      <Button
        label="Open the affiliate program"
        size="sm"
        fullWidth
        icon="link"
        onPress={() => (onClose(), Linking.openURL("https://clipiro.com/affiliate-program"))}
      />
    </BottomSheet>
  );
}

/** Blue info note ("Buying credits … is coming soon"). */
export function Notice({ children }: { children: string }) {
  return (
    <View style={styles.notice} accessible accessibilityRole="text">
      <Icon name="info" size={18} color={colors.info} />
      <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.45 }), { flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  label: { marginTop: 6 },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface3,
  },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: statusTint(colors.info),
    borderWidth: 1,
    borderColor: withAlpha(colors.info, 0.25),
  },
});
