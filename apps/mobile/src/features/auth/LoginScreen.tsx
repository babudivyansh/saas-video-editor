import { fieldErrors, loginRequest } from "@clipiro/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, ErrorBanner, GoogleButton, OrDivider, TextField, useToast } from "@/components";
import { useSession } from "@/state/session";
import { colors, type } from "@/theme";
import { login } from "@mocks/auth";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { useSubmit } from "./useSubmit";

// design/screens/E-Login.html
export function LoginScreen() {
  const toast = useToast();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, banner, run } = useSubmit();

  const submit = () => {
    const parsed = loginRequest.safeParse({ email, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    run(async () => {
      const res = await login(parsed.data);
      if ("token" in res) signIn();
      else if ("requiresEmailVerification" in res) router.push({ pathname: "/otp", params: { email: res.email, mode: "login" } });
      else toast("Two-step verification arrives with real sign-in", "info");
    });
  };

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
        returnKeyType="next"
        error={errors.email}
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
        error={errors.password}
        trailingAction={{ icon: showPw ? "eyeOff" : "eye", accessibilityLabel: showPw ? "Hide password" : "Show password", onPress: () => setShowPw((v) => !v) }}
      />
      <Pressable onPress={() => router.push("/forgot-password")} accessibilityRole="link" accessibilityLabel="Forgot password?" style={styles.forgot}>
        <Text style={type(13, "semibold", { color: colors.emeraldBright })}>Forgot password?</Text>
      </Pressable>
      <Button label="Log in" icon="arrowRight" fullWidth loading={pending} onPress={submit} />
      <OrDivider />
      <GoogleButton onPress={() => toast("Google sign-in is coming soon", "info")} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  forgot: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: -8 },
});
