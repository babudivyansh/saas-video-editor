import { fieldErrors, forgotPasswordRequest } from "@clipiro/shared";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, ErrorBanner, Icon, TextField, type IconName } from "@/components";
import { colors, radius, type } from "@/theme";
import { forgotPassword } from "@mocks/auth";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { useSubmit } from "./useSubmit";

// design/screens/E-Forgot.html. The API emails a reset *link* (it always
// answers ok, so it never reveals whether an account exists) — so success is
// a "check your email" state here, not the OTP screen the design links to.
export function ForgotScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, banner, run } = useSubmit();

  const submit = () => {
    const parsed = forgotPasswordRequest.safeParse({ email });
    if (!parsed.success) return setError(fieldErrors(parsed.error).email);
    setError(undefined);
    run(async () => {
      await forgotPassword(parsed.data);
      setSentTo(parsed.data.email);
    });
  };

  return (
    <AuthScaffold cardTop={250} backTo="/login" footer={<FooterLink label="Back to log in" onPress={() => router.back()} />}>
      {sentTo ? (
        <>
          <IconTile icon="mail" />
          <Title text="Check your email" />
          <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.55 }), styles.center]} accessibilityLiveRegion="polite">
            If an account exists for <Text style={{ color: colors.fg }}>{sentTo}</Text>, we’ve sent a link to reset your password. It
            works on this phone or your computer.
          </Text>
          <Button label="Use a different email" variant="secondary" fullWidth onPress={() => setSentTo(null)} />
        </>
      ) : (
        <>
          <IconTile icon="key" />
          <View style={{ gap: 6 }}>
            <Title text="Forgot password?" />
            <Text style={[type(14, "regular", { color: colors.fgMuted }), styles.center]}>Enter your email and we’ll send a reset link.</Text>
          </View>
          {banner ? <ErrorBanner message={banner.message} onRetry={banner.retry ? submit : undefined} /> : null}
          <TextField
            label="Email"
            leadingIcon="mail"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
            error={error}
          />
          <Button label="Send reset link" icon="arrowRight" fullWidth loading={pending} onPress={submit} />
        </>
      )}
    </AuthScaffold>
  );
}

function IconTile({ icon }: { icon: IconName }) {
  return (
    <View style={styles.iconTile}>
      <Icon name={icon} size={26} color={colors.emeraldBright} />
    </View>
  );
}

function Title({ text }: { text: string }) {
  return (
    <Text style={[type(26, "bold", { tracking: -0.03, lineHeight: 1.12 }), styles.center]} accessibilityRole="header">
      {text}
    </Text>
  );
}

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
