import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { useSession } from "@/state/session";
import { setMockDelay } from "@mocks/auth";
import { ForgotScreen } from "../ForgotScreen";
import { LoginScreen } from "../LoginScreen";
import { OtpScreen, RESEND_SECONDS } from "../OtpScreen";
import { SignupScreen } from "../SignupScreen";

// Screens rendered in a small in-memory router (no auth guards), so the
// tests see real navigation + the session flag.
const routes = {
  login: LoginScreen,
  "sign-up": SignupScreen,
  otp: OtpScreen,
  "forgot-password": ForgotScreen,
  home: () => null,
};
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  useSession.setState({ signedIn: false });
});

describe("Login", () => {
  it("shows field errors from the shared schema and doesn't submit", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await type("Email", "not-an-email");
    await press("Log in");
    expect(screen.getByText("Enter a valid email address")).toBeOnTheScreen();
    expect(screen.getByText("Enter your password")).toBeOnTheScreen();
    expect(useSession.getState().signedIn).toBe(false);
  });

  it("signs in with valid details", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await type("Email", "Maya@CreatorLab.co");
    await type("Password", "clipiro2026");
    await press("Log in");
    await waitFor(() => expect(useSession.getState().signedIn).toBe(true));
  });

  it("shows the server's error for a wrong password", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await type("Email", "maya@creatorlab.co");
    await type("Password", "wrong-password");
    await press("Log in");
    expect(await screen.findByText("Email or password is incorrect")).toBeOnTheScreen();
    expect(useSession.getState().signedIn).toBe(false);
  });

  it("offers retry on a network error", async () => {
    renderRouter(routes, { initialUrl: "/login" });
    await type("Email", "offline@creatorlab.co");
    await type("Password", "clipiro2026");
    await press("Log in");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });
});

describe("Sign up", () => {
  it("requires accepting the terms", async () => {
    renderRouter(routes, { initialUrl: "/sign-up" });
    await type("Full name", "Maya Okafor");
    await type("Email", "maya@creatorlab.co");
    await type("Password", "clipiro2026");
    await press("Create account");
    expect(screen.getByText("Accept the Terms and Privacy Policy to continue")).toBeOnTheScreen();
  });

  it("goes to OTP with the signup token", async () => {
    const r = renderRouter(routes, { initialUrl: "/sign-up" });
    await type("Full name", "Maya Okafor");
    await type("Email", "maya@creatorlab.co");
    await type("Password", "clipiro2026");
    await fireEvent.press(screen.getByRole("checkbox"));
    await press("Create account");
    await waitFor(() => expect(r.getPathname()).toBe("/otp"));
    expect(r.getSearchParams()).toMatchObject({ email: "maya@creatorlab.co", signupToken: "mock-signup-token" });
  });

  it("puts 'email taken' under the email field", async () => {
    renderRouter(routes, { initialUrl: "/sign-up" });
    await type("Full name", "Maya Okafor");
    await type("Email", "taken@creatorlab.co");
    await type("Password", "clipiro2026");
    await fireEvent.press(screen.getByRole("checkbox"));
    await press("Create account");
    expect(await screen.findByText(/already exists/)).toBeOnTheScreen();
  });
});

describe("OTP", () => {
  it("keeps digits only, max 6, and auto-submits on the sixth", async () => {
    renderRouter(routes, { initialUrl: "/otp?email=maya%40creatorlab.co&signupToken=t" });
    const input = screen.getByTestId("otp-input");
    await fireEvent.changeText(input, "48a2");
    expect(input.props.value).toBe("482");
    await fireEvent.changeText(input, "48"); // backspace
    expect(input.props.value).toBe("48");
    await fireEvent.changeText(input, "482193999"); // paste longer than 6
    await waitFor(() => expect(useSession.getState().signedIn).toBe(true));
  });

  it("shows the server error for a wrong code", async () => {
    renderRouter(routes, { initialUrl: "/otp?email=maya%40creatorlab.co&signupToken=t" });
    await fireEvent.changeText(screen.getByTestId("otp-input"), "000000");
    expect(await screen.findByText("That code is incorrect or has expired.")).toBeOnTheScreen();
    expect(useSession.getState().signedIn).toBe(false);
  });

  it("counts down before allowing a resend", async () => {
    jest.useFakeTimers();
    try {
      renderRouter(routes, { initialUrl: "/otp?email=maya%40creatorlab.co&signupToken=t" });
      expect(screen.getByText(`Resend in 1:00`)).toBeOnTheScreen();
      expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull();
      for (let i = 0; i < RESEND_SECONDS; i++) await act(() => jest.advanceTimersByTime(1000));
      expect(screen.getByRole("button", { name: "Resend code" })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Forgot password", () => {
  it("confirms without revealing whether the account exists", async () => {
    renderRouter(routes, { initialUrl: "/forgot-password" });
    await type("Email", "maya@creatorlab.co");
    await press("Send reset link");
    expect(await screen.findByText("Check your email")).toBeOnTheScreen();
    expect(screen.getByText(/If an account exists for/)).toBeOnTheScreen();
  });
});
