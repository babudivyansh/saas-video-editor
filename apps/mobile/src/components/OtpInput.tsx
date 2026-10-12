import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, derived, radius, text, type } from "@/theme";

// Six boxes over one hidden TextInput (design/screens/E-OTP.html): typing,
// paste and SMS autofill all land in a single field, so the code can't get
// split across inputs. The box after the last digit shows the caret.
export function OtpInput({
  value,
  onChange,
  length = 6,
  error,
  label = "Verification code",
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  error?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split("");

  return (
    <View style={styles.wrap}>
      <Text style={text.label}>{label}</Text>
      <Pressable onPress={() => ref.current?.focus()} accessible={false}>
        <View style={[styles.row, { pointerEvents: "none" }]}>
          {Array.from({ length }, (_, i) => {
            const active = focused && i === Math.min(value.length, length - 1);
            const filled = i < value.length;
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  { borderColor: error ? colors.error : active ? colors.emeraldBright : filled ? colors.lineStrong : colors.line },
                  active && { boxShadow: `0 0 0 3px ${error ? derived.errorRing : derived.focusRing}` },
                ]}
              >
                {filled ? (
                  <Text style={type(24, "medium", { mono: true })} allowFontScaling={false}>
                    {digits[i]}
                  </Text>
                ) : active ? (
                  <View style={styles.caret} />
                ) : null}
              </View>
            );
          })}
        </View>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          autoFocus={autoFocus}
          caretHidden
          accessibilityLabel={`${label}, ${length} digits`}
          accessibilityHint={error}
          style={styles.hidden}
          testID="otp-input"
        />
      </Pressable>
      {error ? (
        <Text style={type(12, "regular", { color: colors.error })} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  box: {
    flex: 1,
    maxWidth: 50,
    height: 60,
    borderRadius: radius.field,
    borderWidth: 1,
    backgroundColor: colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  caret: { width: 2, height: 24, backgroundColor: colors.emeraldBright },
  // Covers the boxes so taps focus it; invisible.
  hidden: { ...StyleSheet.absoluteFill, opacity: 0 },
});
