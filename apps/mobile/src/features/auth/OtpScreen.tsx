import { OTP_LENGTH, otpSchema, type ApiError } from "@clipiro/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, ErrorBanner, Icon, OtpInput, useToast } from "@/components";
import { auth } from "@/lib/api";
import { colors, radius, type } from "@/theme";
import { AuthScaffold, FooterLink } from "./AuthScaffold";
import { finishSignIn } from "./finish";
import { useSubmit } from "./useSubmit";

export const RESEND_SECONDS = 60;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// design/screens/E-OTP.html. Reached after Sign up (mode "signup", with the
// signupToken) or when a login needs the email verified first (mode "login",
// with the password proof the login answer carried).
export function OtpScreen() {
  const toast = useToast();
  const params = useLocalSearchParams<{ email?: string; signupToken?: string; mode?: "signup" | "login"; proof?: string }>();
  const email = params.email ?? "";
  const login = params.mode === "login";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [left, setLeft] = useState(RESEND_SECONDS);
  // A wrong code (401) goes under the boxes; an expired signup is a banner.
  const { pending, banner, serverField, run } = useSubmit(wrongCode);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const verify = (value = code) => {
    const parsed = otpSchema.safeParse(value);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    run(async () => {
      if (login) await finishSignIn(await auth.verifyEmail({ email, otp: parsed.data, passwordProof: params.proof }));
      else await finishSignIn(await auth.verifySignup({ email, otp: parsed.data, signupToken: params.signupToken ?? "" }));
    });
  };

  const resend = () =>
    run(async () => {
      await (login ? auth.resendLoginCode({ email }) : auth.resendSignupCode({ email }));
      setLeft(RESEND_SECONDS);
      setCode("");
      toast(`New code sent to ${email}`, "success");
    });

  return (
    <AuthScaffold
      cardTop={250}
      backTo="/login"
      footer={<FooterLink label="Change email" onPress={() => router.back()} />}
    >
      <View style={styles.iconTile}>
        <Icon name="mail" size={26} color={colors.emeraldBright} />
      </View>
      <View style={styles.head}>
        <Text style={[type(26, "bold", { tracking: -0.03, lineHeight: 1.12 }), styles.center]} accessibilityRole="header">
          Verify your email
        </Text>
        <Text style={[type(14, "regular", { color: colors.fgMuted, lineHeight: 1.55 }), styles.center]}>
          We sent a code to <Text style={{ color: colors.fg }}>{email || "your email"}</Text>
        </Text>
      </View>
      {banner ? <ErrorBanner message={banner.message} onRetry={banner.retry ? () => verify() : undefined} /> : null}
      <OtpInput
        value={code}
        onChange={(c) => {
          setCode(c);
          setError(undefined);
          // Auto-submit once the last digit lands (also after paste/SMS autofill).
          if (c.length === OTP_LENGTH) verify(c);
        }}
        error={error ?? serverField.otp}
        autoFocus
      />
      <View style={styles.resend}>
        <Text style={type(14, "regular", { color: colors.fgMuted })}>Didn’t get it? </Text>
        {left > 0 ? (
          <Text
            style={type(14, "regular", { color: colors.fgSubtle, mono: true })}
            accessibilityLabel={`You can resend the code in ${left} seconds`}
          >
            Resend in {mmss(left)}
          </Text>
        ) : (
          <Pressable onPress={resend} accessibilityRole="button" accessibilityLabel="Resend code" style={styles.resendBtn}>
            <Text style={type(14, "semibold", { color: colors.emeraldBright })}>Resend code</Text>
          </Pressable>
        )}
      </View>
      <Button label="Verify" icon="arrowRight" fullWidth loading={pending} onPress={() => verify()} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
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
  head: { gap: 6 },
  center: { textAlign: "center" },
  resend: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap", minHeight: 44 },
  resendBtn: { minHeight: 44, justifyContent: "center" },
});

const wrongCode = (e: ApiError) => (e.status === 401 || (e.status === 400 && !e.body.expired) ? "otp" : undefined);
