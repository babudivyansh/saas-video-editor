import { forwardRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, derived, radius, text, type } from "@/theme";
import { Icon, type IconName } from "./Icon";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  leadingIcon?: IconName;
  /** Icon button inside the right edge (e.g. show/hide password). */
  trailingAction?: { icon: IconName; accessibilityLabel: string; onPress: () => void };
  error?: string;
  helper?: string;
};

// Field: 54 high, radius 12 (field token), surface1 fill, lineStrong border,
// emerald border + 3px ring when focused (design/screens/E-Login.html).
// The error look is not drawn in the designs; it mirrors the focus ring in
// the error colour.
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, leadingIcon, trailingAction, error, helper, onFocus, onBlur, editable = true, ...input },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const message = error ?? helper;
  const borderColor = error ? colors.error : focused ? colors.emeraldBright : colors.lineStrong;
  const ring = error ? derived.errorRing : focused ? derived.focusRing : "transparent";

  return (
    <View style={styles.wrap}>
      <Text style={text.label}>{label}</Text>
      <View style={[styles.ring, { borderColor: ring }]}>
        <View style={[styles.field, { borderColor }, !editable && styles.readOnly]}>
          {leadingIcon && (
            <View style={[styles.leading, { pointerEvents: "none" }]}>
              <Icon name={leadingIcon} size={20} color={colors.fgSubtle} />
            </View>
          )}
          <TextInput
            ref={ref}
            {...input}
            editable={editable}
            accessibilityLabel={input.accessibilityLabel ?? label}
            accessibilityHint={error ?? input.accessibilityHint}
            placeholderTextColor={colors.fgSubtle}
            selectionColor={colors.emeraldBright}
            cursorColor={colors.emeraldBright}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            style={[styles.input, { paddingLeft: leadingIcon ? 46 : 16, paddingRight: trailingAction ? 52 : 16 }]}
          />
          {trailingAction && (
            <Pressable
              onPress={trailingAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={trailingAction.accessibilityLabel}
              style={styles.trailing}
            >
              <Icon name={trailingAction.icon} size={20} color={colors.fgMuted} />
            </Pressable>
          )}
        </View>
      </View>
      {message ? (
        <Text style={[styles.message, error ? { color: colors.error } : null]} accessibilityLiveRegion={error ? "polite" : "none"}>
          {message}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  // 3px ring drawn as an outer border so it is visible on Android (no spread shadows there).
  ring: { borderWidth: 3, borderRadius: radius.field + 3, margin: -3 },
  field: {
    minHeight: 54,
    borderRadius: radius.field,
    borderWidth: 1,
    backgroundColor: colors.surface1,
    justifyContent: "center",
  },
  readOnly: { opacity: 0.6 },
  input: { ...type(15), minHeight: 52, paddingVertical: 0 },
  leading: { position: "absolute", left: 16, top: 0, bottom: 0, justifyContent: "center" },
  trailing: { position: "absolute", right: 4, top: 4, bottom: 4, width: 46, alignItems: "center", justifyContent: "center" },
  message: { ...type(12, "regular", { color: colors.fgSubtle }) },
});
