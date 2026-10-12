import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { openTappedPushes, registerForPush, usePush } from "@/lib/push";
import { installFakeApi } from "@/test/fakeApi";
import { makeWrapper } from "@/test/providers";
import { RunScreen } from "../RunScreen";

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: null, easConfig: null } }));
jest.mock("expo-device", () => ({ isDevice: true, modelName: "Pixel 7" }));

// The run screen polling a job to its end, and push: registering this phone
// with its switches, asking at the right moment, and opening tapped pushes.

const N = Notifications as jest.Mocked<typeof Notifications>;
const job = (over: Record<string, unknown>) => ({ id: "run_p1", type: "autoclip", status: "running", stage: "analyzing", progress: 40, error: null, createdAt: "2026-10-09T09:00:00.000Z", result: null, ...over });

let server: ReturnType<typeof installFakeApi>;
let answers: unknown[];
const routes = { "create/run/[jobId]": RunScreen, "create/autoclip": () => null, "projects/[projectId]": () => null, "you/credits": () => null };
const open = () => renderRouter(routes, { initialUrl: "/create/run/run_p1", wrapper: makeWrapper() });

beforeEach(() => {
  jest.clearAllMocks();
  answers = [];
  server = installFakeApi({
    "GET /jobs/run_p1": () => [200, answers.length > 1 ? answers.shift() : answers[0]],
    "POST /devices": () => [200, { ok: true }],
  });
  usePush.setState({ prefs: { renderFinished: true, postPublished: true }, permission: "undetermined" });
  (Constants as { expoConfig: unknown }).expoConfig = { version: "1.0.0", extra: { eas: { projectId: "eas-project-1" } } };
});
afterEach(() => server.restore());

describe("run screen", () => {
  it("shows the stage and progress, then the clips when it's done", async () => {
    jest.useFakeTimers();
    try {
      answers = [job({}), job({ stage: "rendering", progress: 80 }), job({ status: "done", stage: null, progress: 100, result: { assetId: null, url: null, projectId: "p1", clipCount: 8 } })];
      const r = open();
      expect(await screen.findByText("Finding the best moments")).toBeOnTheScreen();
      expect(screen.getByText("40%")).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(4000));
      expect(await screen.findByText("Rendering your clips")).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(4000));
      expect(await screen.findByText("8 clips ready")).toBeOnTheScreen();
      // Done: it stops asking.
      const polls = server.to("GET", "/jobs/run_p1").length;
      await act(async () => jest.advanceTimersByTime(20000));
      expect(server.to("GET", "/jobs/run_p1")).toHaveLength(polls);
      fireEvent.press(screen.getByRole("button", { name: "View clips" }));
      await waitFor(() => expect(r.getPathname()).toBe("/projects/p1"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("explains a failed run, with the refund, and offers to try again", async () => {
    answers = [job({ status: "failed", stage: null, error: "We couldn't read this video. Anything you were charged has been refunded." })];
    const r = open();
    expect(await screen.findByText("This run didn’t finish")).toBeOnTheScreen();
    expect(screen.getByText(/has been refunded/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(r.getPathname()).toBe("/create/autoclip"));
  });

  it("says when the run doesn't exist", async () => {
    server.restore();
    server = installFakeApi({ "GET /jobs/run_p1": () => [404, { error: "Job not found" }] });
    open();
    expect(await screen.findByText("Couldn’t find this run")).toBeOnTheScreen();
  });

  it("offers notifications while it runs, and registers the phone when allowed", async () => {
    answers = [job({})];
    open();
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Turn on notifications" })));
    expect(N.requestPermissionsAsync).toHaveBeenCalled();
    await waitFor(() => expect(server.to("POST", "/devices")).toHaveLength(1));
    expect(server.to("POST", "/devices")[0]!.body).toMatchObject({ token: "ExponentPushToken[test-phone]", provider: "expo", appVersion: "1.0.0", prefs: { renderFinished: true, postPublished: true } });
    expect(await screen.findByText(/We’ll send a notification/)).toBeOnTheScreen();
  });

  it("points to Android settings after a 'no'", async () => {
    N.getPermissionsAsync.mockResolvedValueOnce({ status: "denied", canAskAgain: false } as never);
    answers = [job({})];
    open();
    await act(async () => void (await registerForPush({ ask: true })));
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Turn on in Android settings" })).toBeOnTheScreen();
  });
});

describe("push", () => {
  it("does nothing in a build without an EAS project", async () => {
    (Constants as { expoConfig: unknown }).expoConfig = { version: "1.0.0", extra: {} };
    expect(await registerForPush({ ask: true })).toBe("unavailable");
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(server.calls).toHaveLength(0);
  });

  it("never asks on its own, but registers once allowed", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true } as never);
    expect(await registerForPush({ ask: false })).toBe("granted");
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(server.to("POST", "/devices")).toHaveLength(1);
    N.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true } as never);
  });

  it("keeps the switches on the phone and tells the server", async () => {
    N.getPermissionsAsync.mockResolvedValue({ status: "granted", canAskAgain: true } as never);
    await usePush.getState().setPrefs({ renderFinished: false });
    expect(JSON.parse((await SecureStore.getItemAsync("clipiro.pushPrefs"))!)).toEqual({ renderFinished: false, postPublished: true });
    expect(server.to("POST", "/devices")[0]!.body.prefs).toEqual({ renderFinished: false, postPublished: true });
    N.getPermissionsAsync.mockResolvedValue({ status: "undetermined", canAskAgain: true } as never);
  });

  it("opens the screen a tapped push points at", async () => {
    const r = renderRouter({ index: () => null, "projects/[projectId]": () => null }, { initialUrl: "/" });
    N.getLastNotificationResponse.mockReturnValueOnce({ notification: { request: { content: { data: { href: "/projects/p42" } } } } } as never);
    let stop = () => {};
    act(() => {
      stop = openTappedPushes();
    });
    await waitFor(() => expect(r.getPathname()).toBe("/projects/p42"));
    expect(N.clearLastNotificationResponse).toHaveBeenCalled();
    // A push for something the app has no screen for opens nothing new.
    const listener = N.addNotificationResponseReceivedListener.mock.calls[0]![0];
    act(() => listener({ notification: { request: { content: { data: { href: null } } } } } as never));
    expect(r.getPathname()).toBe("/projects/p42");
    stop();
  });
});
