import { ApiError, fieldErrors, loginRequest } from "@clipiro/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, ConfirmSheet, ErrorBanner, GoogleButton, OrDivider, TextField } from "@/components";
import { auth } from "@/lib/api";
import { colors, type } from "@/theme";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { continueWithGoogle, finishSignIn } from "./finish";
import { useSubmit } from "./useSubmit";

// design/screens/E-Login.html. A deactivated account (within its 30 days)
// gets a "reactivate?" sheet — the design has none; it reuses ConfirmSheet.
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deactivated, setDeactivated] = useState(false);
  const { pending, banner, serverField, run } = useSubmit();
  const google = useSubmit();

  const submit = () => {
    const parsed = loginRequest.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(
      async () => finishSignIn(await auth.login(parsed.data)),
      (e) => {
        if (!(e instanceof ApiError && e.body.deactivated)) return false;
        setDeactivated(true);
        return true;
      },
    );
  };

  const reactivate = () =>
    run(async () => {
      setDeactivated(false);
      await finishSignIn(await auth.reactivate({ email, password }));
    });

  const shown = banner ?? google.banner;

  return (
    <AuthScaffold
      cardTop={250}
      backTo="/onboarding/grow"
      footer={<FooterLink prompt="New to Clipiro?" label="Create an account" onPress={() => router.push("/sign-up")} />}
    >
      <View style={styles.head}>
        <Text style={type(28, "bold", { tracking: -0.03, lineHeight: 1.12 })} accessibilityRole="header">
          Welcome back
        </Text>
        <Text style={type(14, "regular", { color: colors.fgMuted })}>Your clips are waiting.</Text>
      </View>
      {shown ? <ErrorBanner message={shown.message} onRetry={shown.retry ? (banner ? submit : () => google.run(continueWithGoogle)) : undefined} /> : null}
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
        returnKeyType="next"
        error={errors.email ?? serverField.email}
      />
      <TextField
        label="Password"
        leadingIcon="lock"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry={!showPw}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={errors.password ?? serverField.password}
        trailingAction={{ icon: showPw ? "eyeOff" : "eye", accessibilityLabel: showPw ? "Hide password" : "Show password", onPress: () => setShowPw((v) => !v) }}
      />
      <Pressable onPress={() => router.push("/forgot-password")} accessibilityRole="link" accessibilityLabel="Forgot password?" style={styles.forgot}>
        <Text style={type(13, "semibold", { color: colors.emeraldBright })}>Forgot password?</Text>
      </Pressable>
      <Button label="Log in" icon="arrowRight" fullWidth loading={pending} onPress={submit} />
      <OrDivider />
      <GoogleButton onPress={() => google.run(continueWithGoogle)} loading={google.pending} />
      <ConfirmSheet
        visible={deactivated}
        title="Reactivate your account?"
        body="This account was deactivated. Reactivate it to restore everything in it — your projects, clips and plan."
        confirmLabel="Reactivate"
        onClose={() => setDeactivated(false)}
        onConfirm={reactivate}
      />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  forgot: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: -8 },
});
