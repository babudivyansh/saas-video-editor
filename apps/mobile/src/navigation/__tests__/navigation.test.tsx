/// <reference types="node" />
// Node APIs are used only by tests (to read the route tree from disk).
import path from "node:path";
import { act, fireEvent, renderRouter, screen, testRouter, waitFor } from "expo-router/testing-library";
import { useSession } from "@/state/session";
import { setMockDelay } from "@mocks/auth";
import { SAMPLE_PROJECT_ID } from "../screens";

// Renders the real src/app tree, so these exercise the actual layouts:
// the auth flow, the tab navigator with our TabBar, and the editor modal.
const APP = path.join(__dirname, "../../app");

const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

/** Route names in the app's root stack = what Android back can return to. */
type NavState = { routes: { name: string; state?: NavState }[] };
const rootHistory = (r: ReturnType<typeof renderRouter>) =>
  ((r.getRouterState() as NavState | undefined)?.routes[0]?.state?.routes ?? []).map((x) => x.name);

// Tests that start inside the app need a signed-in session (protected routes).
const signedIn = (v: boolean) => useSession.setState({ signedIn: v });

describe("navigation", () => {
  beforeEach(() => signedIn(true));

  it("runs splash → onboarding → login → OTP → Home, and Home has no way back to auth", async () => {
    signedIn(false);
    setMockDelay(0);
    const r = renderRouter(APP, { initialUrl: "/" });
    await fireEvent.press(screen.getByRole("button", { name: "Clipiro. Continue" }));
    expect(r.getPathname()).toBe("/onboarding/welcome");
    await press("Skip");
    expect(r.getPathname()).toBe("/login");
    // An unverified account is sent to verify its email first.
    await fireEvent.changeText(screen.getByLabelText("Email"), "unverified@creatorlab.co");
    await fireEvent.changeText(screen.getByLabelText("Password"), "clipiro2026");
    await press("Log in");
    await waitFor(() => expect(r.getPathname()).toBe("/otp"));
    await fireEvent.changeText(screen.getByTestId("otp-input"), "482193"); // auto-submits at 6 digits
    await waitFor(() => expect(r.getPathname()).toBe("/home"));
    // OTP → Home reset the history: nothing behind the tabs for back to reach.
    expect(rootHistory(r)).toEqual(["(tabs)"]);
  }, 30000);

  it("switches tabs with the floating tab bar and keeps each tab's history", async () => {
    const r = renderRouter(APP, { initialUrl: "/projects" });
    await press("Drafts");
    expect(r.getPathname()).toBe("/projects/drafts");

    await act(() => fireEvent.press(screen.getByRole("tab", { name: "You" })));
    expect(r.getPathname()).toBe("/you");

    // Back to Projects: still on Drafts.
    await act(() => fireEvent.press(screen.getByRole("tab", { name: "Projects" })));
    expect(r.getPathname()).toBe("/projects/drafts");

    // Pressing the active tab again pops its stack to the root (the stack
    // does this on the next animation frame).
    await act(() => fireEvent.press(screen.getByRole("tab", { name: "Projects" })));
    await waitFor(() => expect(r.getPathname()).toBe("/projects"));
  });

  it("Android back on another tab's root returns to Home", async () => {
    const r = renderRouter(APP, { initialUrl: "/home" });
    await act(() => fireEvent.press(screen.getByRole("tab", { name: "Social" })));
    expect(r.getPathname()).toBe("/social");
    await act(() => testRouter.back());
    expect(r.getPathname()).toBe("/home");
  });

  it("opens a project detail with its id", async () => {
    const r = renderRouter(APP, { initialUrl: "/projects" });
    await press("Founders Pod · Ep. 42");
    expect(r.getPathname()).toBe(`/projects/${SAMPLE_PROJECT_ID}`);
    expect(screen.getByText(new RegExp(`project ${SAMPLE_PROJECT_ID}`))).toBeOnTheScreen();
  });

  it("opens the editor over the tabs, a panel over the editor, and backs out step by step", async () => {
    const r = renderRouter(APP, { initialUrl: "/home" });
    await press("Open the editor");
    expect(r.getPathname()).toBe("/editor");
    await press("Captions");
    expect(r.getPathname()).toBe("/editor/captions");
    // Switching panels replaces the panel instead of stacking another one.
    await act(() => fireEvent.press(screen.getByRole("tab", { name: "Audio" })));
    await waitFor(() => expect(r.getPathname()).toBe("/editor/audio"));
    await press("Back to timeline");
    expect(r.getPathname()).toBe("/editor");
    await press("Close editor");
    expect(r.getPathname()).toBe("/home");
  });

  it("sends a cross-tab link to the tab that owns the screen", async () => {
    const r = renderRouter(APP, { initialUrl: "/you" });
    await press("My Assets");
    expect(r.getPathname()).toBe("/projects/assets");
    expect(screen.getByRole("tab", { name: "Projects" })).toBeSelected();
  });

  it("logs out to the splash screen", async () => {
    const r = renderRouter(APP, { initialUrl: "/you" });
    await press("Log out");
    await waitFor(() => expect(r.getPathname()).toBe("/"));
    expect(rootHistory(r)).toEqual(["index"]);
  });
});