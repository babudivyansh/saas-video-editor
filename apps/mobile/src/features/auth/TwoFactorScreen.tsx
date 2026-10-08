import { twoFactorRequest, type ApiError } from "@clipiro/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, ErrorBanner, Icon, TextField } from "@/components";
import { auth } from "@/lib/api";
import { colors, radius, type } from "@/theme";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { finishSignIn } from "./finish";
import { useSubmit } from "./useSubmit";

// The second step for accounts with two-step verification on (after a
// password or Google). The design has no screen for it: this follows E-OTP's
// layout with a plain field, since the code can be a 6-digit authenticator
// code or a longer recovery code.
export function TwoFactorScreen() {
  const { ticket = "" } = useLocalSearchParams<{ ticket?: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { pending, banner, serverField, run } = useSubmit(wrongCode);

  const submit = () => {
    const parsed = twoFactorRequest.safeParse({ ticket, code });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    run(async () => finishSignIn(await auth.twoFactor(parsed.data)));
  };

  return (
    <AuthScaffold cardTop={250} backTo="/login" footer={<FooterLink label="Back to log in" onPress={() => router.back()} />}>
      <View style={styles.iconTile}>
        <Icon name="lock" size={26} color={colors.emeraldBright} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={[type(26, "bold", { tracking: -0.03, lineHeight: 1.12 }), styles.center]} accessibilityRole="header">
          Two-step verification
        </Text>
        <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.55 }), styles.center]}>
          Enter the code from your authenticator app, or one of your recovery codes.
        </Text>
      </View>
      {banner ? <ErrorBanner message={banner.message} onRetry={banner.retry ? submit : undefined} /> : null}
      <TextField
        label="Code"
        leadingIcon="key"
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        autoCapitalize="none"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="go"
        onSubmitEditing={submit}
        autoFocus
        error={error ?? serverField.code}
      />
      <Button label="Verify" icon="arrowRight" fullWidth loading={pending} onPress={submit} />
    </AuthScaffold>
  );
}

// A wrong code goes under the field; an expired ticket (400, "sign in again") is a banner.
const wrongCode = (e: ApiError) => (e.status === 401 ? "code" : undefined);

const styles = StyleSheet.create({
  center: { textAlign: "center" },
  iconTile: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: radius.tile,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.tintBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
