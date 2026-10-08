import { fieldErrors, signupRequest, type ApiError } from "@clipiro/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button, Checkbox, ErrorBanner, GoogleButton, OrDivider, TextField } from "@/components";
import { auth } from "@/lib/api";
import { colors, type } from "@/theme";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { continueWithGoogle } from "./finish";
import { useSubmit } from "./useSubmit";

const SITE = "https://clipiro.com";

// design/screens/E-Signup.html. The design has no "confirm password" field;
// the API wants one, so the password is sent as its own confirmation.
export function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The server answers 409 for a taken email without naming the field.
  const { pending, banner, serverField, run } = useSubmit(emailTaken);
  const google = useSubmit();
  const shown = banner ?? google.banner;

  const submit = () => {
    const parsed = signupRequest.safeParse({ name, email, password, confirmPassword: password });
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (!agree) errs.agree = "Accept the Terms and Privacy Policy to continue";
    setErrors(errs);
    if (!parsed.success || !agree) return;
    run(async () => {
      const res = await auth.signup(parsed.data);
      router.push({ pathname: "/otp", params: { email: res.email, signupToken: res.signupToken, mode: "signup" } });
    });
  };

  return (
    <AuthScaffold
      cardTop={170}
      backTo="/login"
      footer={<FooterLink prompt="Already have an account?" label="Log in" onPress={() => router.back()} />}
    >
      <Text style={type(26, "bold", { tracking: -0.03, lineHeight: 1.12 })} accessibilityRole="header">
        Create your account
      </Text>
      {shown ? <ErrorBanner message={shown.message} onRetry={shown.retry ? (banner ? submit : () => google.run(continueWithGoogle)) : undefined} /> : null}
      <TextField label="Full name" leadingIcon="person" value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" textContentType="name" error={errors.name ?? serverField.name} />
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
        error={errors.email ?? serverField.email}
      />
      <TextField
        label="Password"
        leadingIcon="lock"
        value={password}
        onChangeText={setPassword}
        placeholder="Create a password"
        secureTextEntry={!showPw}
        autoComplete="new-password"
        textContentType="newPassword"
        helper="At least 8 characters."
        error={errors.password ?? serverField.password}
        trailingAction={{ icon: showPw ? "eyeOff" : "eye", accessibilityLabel: showPw ? "Hide password" : "Show password", onPress: () => setShowPw((v) => !v) }}
      />
      <View>
        <Checkbox
          checked={agree}
          onChange={setAgree}
          accessibilityLabel="I agree to Clipiro’s Terms and Privacy Policy"
          label={
            <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.5 }), styles.terms]}>
              I agree to Clipiro’s{" "}
              <Text style={styles.link} onPress={() => Linking.openURL(`${SITE}/terms`)} accessibilityRole="link">
                Terms
              </Text>{" "}
              and{" "}
              <Text style={styles.link} onPress={() => Linking.openURL(`${SITE}/privacy`)} accessibilityRole="link">
                Privacy Policy
              </Text>
              .
            </Text>
          }
        />
        {errors.agree ? <Text style={type(12, "regular", { color: colors.error })}>{errors.agree}</Text> : null}
      </View>
      <Button label="Create account" icon="arrowRight" fullWidth loading={pending} onPress={submit} />
      <OrDivider />
      <GoogleButton onPress={() => google.run(continueWithGoogle)} loading={google.pending} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  terms: { flex: 1 },
  link: { color: colors.emeraldBright, fontFamily: type(14, "semibold").fontFamily },
});

const emailTaken = (e: ApiError) => (e.status === 409 ? "email" : undefined);
