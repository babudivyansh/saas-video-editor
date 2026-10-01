import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, layout, radius, type } from "@/theme";
import { Icon, type IconName } from "./Icon";

// Not in the designs: a surface3 pill above the floating tab bar, with a
// status-coloured icon. Announced to TalkBack as it appears.
type Tone = "success" | "error" | "info";
type ToastMsg = { id: number; text: string; tone: Tone };

const ICON: Record<Tone, { name: IconName; color: string }> = {
  success: { name: "check", color: colors.success },
  error: { name: "alert", color: colors.error },
  info: { name: "info", color: colors.info },
};

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((text: string, tone: Tone = "info") => {
    clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, tone });
    AccessibilityInfo.announceForAccessibility(text);
    timer.current = setTimeout(() => setMsg(null), 3500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && <ToastView key={msg.id} msg={msg} />}
    </ToastContext.Provider>
  );
}

function ToastView({ msg }: { msg: ToastMsg }) {
  const insets = useSafeAreaInsets();
  const [y] = useState(() => new Animated.Value(20));
  useEffect(() => {
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
  }, [y]);
  const icon = ICON[msg.tone];
  return (
    <View
      style={[styles.host, { pointerEvents: "none", bottom: insets.bottom + layout.tabBar.height + layout.tabBar.inset + 12 }]}
    >
      <Animated.View style={[styles.toast, { transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite">
        <Icon name={icon.name} size={18} color={icon.color} strokeWidth={2.2} />
        <Text style={[type(14, "medium"), styles.text]}>{msg.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: layout.screenPadding, right: layout.screenPadding, alignItems: "center" },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  text: { flexShrink: 1 },
});
