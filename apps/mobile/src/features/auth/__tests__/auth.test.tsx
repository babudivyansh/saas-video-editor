import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { GoogleOneTapSignIn } from "react-native-nitro-google-signin";
import { api, tokenStore, userStore } from "@/lib/api";
import { useSession } from "@/state/session";
import { installFakeAuthServer, SESSION } from "@/test/fakeAuthServer";
import { ForgotScreen } from "../ForgotScreen";
import { LoginScreen } from "../LoginScreen";
import { OtpScreen, RESEND_SECONDS } from "../OtpScreen";
import { SignupScreen } from "../SignupScreen";
import { TwoFactorScreen } from "../TwoFactorScreen";

// Screens rendered in a small in-memory router (no auth guards), with the
// app's real API client and session store over a fake server — so these
// cover what is sent, what is stored, and where each answer leads.
const routes = {
  login: LoginScreen,
  "sign-up": SignupScreen,
  otp: OtpScreen,
  "two-factor": TwoFactorScreen,
  "forgot-password": ForgotScreen,
  home: () => null,
};
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
// Pressing settles the whole submit (the fake server answers in microtasks).
const press = (name: string) => act(async () => void fireEvent.press(screen.getByRole("button", { name })));
const signedIn = () => useSession.getState().signedIn;

let server: ReturnType<typeof installFakeAuthServer>;
const google = GoogleOneTapSignIn as jest.Mocked<typeof GoogleOneTapSignIn>;

beforeEach(async () => {
  server = installFakeAuthServer();
  await tokenStore.set(null);
  await userStore.set(null);
  useSession.setState({ ready: true, signedIn: false, user: null });
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web-client.apps.googleusercontent.com";
  jest.clearAllMocks();
});
afterEach(() => server.restore());

async function logIn(email: string, password = "clipiro2026") {
  await type("Email", email);
  await type("Password", password);
  await press("Log in");
}

describe("Login", () => {
  it("shows field errors from the shared schema and doesn't submit", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await type("Email", "not-an-email");
    await press("Log in");
    expect(screen.getByText("Enter a valid email address")).toBeOnTheScreen();
    expect(screen.getByText("Enter your password")).toBeOnTheScreen();
    expect(server.calls).toHaveLength(0);
  });

  it("signs in and keeps the session in secure storage", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await logIn("Maya@CreatorLab.co");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(server.to("/auth/login")[0]!.body).toEqual({ email: "maya@creatorlab.co", password: "clipiro2026" });
    // The phone names itself for the web's Sessions list; no token on a sign-in call.
    expect(server.calls[0]!.headers["User-Agent"]).toMatch(/^Clipiro\/1\.0 \(Android/);
    expect(server.calls[0]!.headers.Authorization).toBeUndefined();
    expect(await tokenStore.get()).toEqual({ accessToken: "acc-1", refreshToken: "u1.s1.secret", expiresIn: 3600 });
    expect((await userStore.get())?.email).toBe("maya@creatorlab.co");
  });

  it("shows the server's error for a wrong password", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await logIn("maya@creatorlab.co", "wrong-password");
    expect(await screen.findByText("Email or password is incorrect")).toBeOnTheScreen();
    expect(signedIn()).toBe(false);
    expect(await tokenStore.get()).toBeNull();
  });

  it("offers retry on a network error", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await logIn("offline@creatorlab.co");
    expect(await screen.findByText("No connection. Check your internet and try again.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });

  it("sends an unverified account to the OTP screen, which finishes the login", async () => {
    const r = renderRouter(routes, { initialUrl: "/login" });
    await logIn("unverified@creatorlab.co");
    await waitFor(() => expect(r.getPathname()).toBe("/otp"));
    expect(r.getSearchParams()).toMatchObject({ email: "unverified@creatorlab.co", mode: "login", proof: "proof-1" });
    await fireEvent.changeText(screen.getByTestId("otp-input"), "482193");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(server.to("/auth/login/verify-email")[0]!.body).toEqual({ email: "unverified@creatorlab.co", otp: "482193", passwordProof: "proof-1" });
  });

  it("asks for the 2FA code, rejects a wrong one, then signs in", async () => {
    const r = renderRouter(routes, { initialUrl: "/login" });
    await logIn("2fa@creatorlab.co");
    await waitFor(() => expect(r.getPathname()).toBe("/two-factor"));
    await type("Code", "000000");
    await press("Verify");
    expect(await screen.findByText("Invalid code")).toBeOnTheScreen();
    expect(signedIn()).toBe(false);
    await type("Code", "123456");
    await press("Verify");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(server.to("/auth/2fa").at(-1)!.body).toEqual({ ticket: "ticket-1", code: "123456" });
  });

  it("offers to reactivate a deactivated account", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await logIn("deactivated@creatorlab.co");
    expect(await screen.findByText("Reactivate your account?")).toBeOnTheScreen();
    expect(signedIn()).toBe(false);
    await press("Reactivate");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(server.to("/auth/reactivate")[0]!.body).toEqual({ email: "deactivated@creatorlab.co", password: "clipiro2026" });
  });
});

describe("Google", () => {
  it("sends Google's ID token to the server and signs in", async () => {
    google.createAccount.mockResolvedValueOnce({ type: "success", data: { idToken: "google-id-token", user: {} as never, scopes: [], serverAuthCode: null } });
    renderRouter(routes, { initialUrl: "/login" });
    await press("Continue with Google");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(google.configure).toHaveBeenCalledWith({ webClientId: "web-client.apps.googleusercontent.com" });
    expect(server.to("/auth/google")[0]!.body).toEqual({ idToken: "google-id-token" });
  });

  it("does nothing when the picker is dismissed", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await press("Continue with Google");
    await waitFor(() => expect(google.createAccount).toHaveBeenCalled());
    expect(server.calls).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when Google isn't set up for the build", async () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "";
    renderRouter(routes, { initialUrl: "/sign-up" });
    await press("Continue with Google");
    expect(await screen.findByText(/Google sign-in isn’t set up yet/)).toBeOnTheScreen();
  });

  it("explains a misconfigured Android client instead of failing silently", async () => {
    google.signIn.mockRejectedValueOnce({ code: "DEVELOPER_ERROR", message: "10:" });
    renderRouter(routes, { initialUrl: "/login" });
    await press("Continue with Google");
    expect(await screen.findByText(/isn’t set up for this build yet/)).toBeOnTheScreen();
  });
});

describe("Sign up", () => {
  async function fillSignup(email = "maya@creatorlab.co") {
    await type("Full name", "Maya Okafor");
    await type("Email", email);
    await type("Password", "clipiro2026");
  }

  it("requires accepting the terms", async () => {
    renderRouter(routes, { initialUrl: "/sign-up" });
    await fillSignup();
    await press("Create account");
    expect(screen.getByText("Accept the Terms and Privacy Policy to continue")).toBeOnTheScreen();
    expect(server.calls).toHaveLength(0);
  });

  it("goes to OTP with the signup token, and the code signs in", async () => {
    const r = renderRouter(routes, { initialUrl: "/sign-up" });
    await fillSignup();
    await fireEvent.press(screen.getByRole("checkbox"));
    await press("Create account");
    await waitFor(() => expect(r.getPathname()).toBe("/otp"));
    expect(r.getSearchParams()).toMatchObject({ email: "maya@creatorlab.co", signupToken: "signup-token-1", mode: "signup" });
    await fireEvent.changeText(screen.getByTestId("otp-input"), "482193");
    await waitFor(() => expect(signedIn()).toBe(true));
    expect(server.to("/auth/signup/verify")[0]!.body).toEqual({ email: "maya@creatorlab.co", otp: "482193", signupToken: "signup-token-1" });
  });

  it("puts 'email taken' under the email field", async () => {
    renderRouter(routes, { initialUrl: "/sign-up" });
    await fillSignup("taken@creatorlab.co");
    await fireEvent.press(screen.getByRole("checkbox"));
    await press("Create account");
    expect(await screen.findByText(/already exists/)).toBeOnTheScreen();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("OTP", () => {
  const SIGNUP_OTP = "/otp?email=maya%40creatorlab.co&signupToken=t&mode=signup";

  it("keeps digits only, max 6, and auto-submits on the sixth", async () => {
    renderRouter(routes, { initialUrl: SIGNUP_OTP });
    const input = screen.getByTestId("otp-input");
    await fireEvent.changeText(input, "48a2");
    expect(input.props.value).toBe("482");
    await fireEvent.changeText(input, "48"); // backspace
    expect(input.props.value).toBe("48");
    await fireEvent.changeText(input, "482193999"); // paste longer than 6
    await waitFor(() => expect(signedIn()).toBe(true));
  });

  it("shows a wrong code under the boxes", async () => {
    renderRouter(routes, { initialUrl: SIGNUP_OTP });
    await fireEvent.changeText(screen.getByTestId("otp-input"), "000000");
    expect(await screen.findByText("Invalid or expired code")).toBeOnTheScreen();
    expect(signedIn()).toBe(false);
  });

  it("counts down before allowing a resend, then resends for the right flow", async () => {
    jest.useFakeTimers();
    try {
      renderRouter(routes, { initialUrl: SIGNUP_OTP });
      expect(screen.getByText(`Resend in 1:00`)).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull();
      for (let i = 0; i < RESEND_SECONDS; i++) await act(() => jest.advanceTimersByTime(1000));
      await press("Resend code");
    } finally {
      jest.useRealTimers();
    }
    await waitFor(() => expect(server.to("/auth/signup/resend")).toHaveLength(1));
    expect(server.to("/auth/login/resend")).toHaveLength(0);
  });
});

describe("Forgot password", () => {
  it("confirms without revealing whether the account exists", async () => {
    renderRouter(routes, { initialUrl: "/forgot-password" });
    await type("Email", "maya@creatorlab.co");
    await press("Send reset link");
    expect(await screen.findByText("Check your email")).toBeOnTheScreen();
    expect(screen.getByText(/If an account exists for/)).toBeOnTheScreen();
    expect(server.to("/auth/forgot-password")[0]!.body).toEqual({ email: "maya@creatorlab.co" });
  });
});

describe("session", () => {
  it("restores a saved session at launch, without the network", async () => {
    await useSession.getState().signIn(SESSION());
    useSession.setState({ ready: false, signedIn: false, user: null });
    server.calls.length = 0;
    await useSession.getState().hydrate();
    expect(useSession.getState()).toMatchObject({ ready: true, signedIn: true, user: { email: "maya@creatorlab.co" } });
    expect(server.calls).toHaveLength(0);
  });

  it("logs out on the server and forgets the tokens", async () => {
    await useSession.getState().signIn(SESSION());
    await useSession.getState().signOut();
    expect(signedIn()).toBe(false);
    expect(await tokenStore.get()).toBeNull();
    expect(server.to("/auth/logout")[0]!.body).toEqual({ refreshToken: "u1.s1.secret" });
    expect(google.signOut).toHaveBeenCalled(); // the next Google sign-in shows the picker again
  });

  it("still signs out when the logout call can't reach the server", async () => {
    await useSession.getState().signIn(SESSION("offline@creatorlab.co"));
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await useSession.getState().signOut();
    expect(signedIn()).toBe(false);
    expect(await tokenStore.get()).toBeNull();
  });

  it("signs out when the server refuses the refresh token", async () => {
    await useSession.getState().signIn(SESSION());
    expect(await api.refresh()).toBe(false);
    expect(signedIn()).toBe(false);
    expect(await tokenStore.get()).toBeNull();
    expect(await userStore.get()).toBeNull();
  });
});
