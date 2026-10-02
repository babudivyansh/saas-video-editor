import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { resetProjectMocks } from "@mocks/projects";
import { resetSocialMocks } from "@mocks/social";
import { makeWrapper } from "@/test/providers";
import { ComposerScreen } from "../ComposerScreen";
import { useComposerSeed } from "../queries";
import { AccountsScreen, CalendarScreen, ScheduledScreen } from "../StudioScreens";

const routes = {
  "social/index": AccountsScreen,
  "social/content-calendar": CalendarScreen,
  "social/scheduled-posts": ScheduledScreen,
  composer: ComposerScreen,
  "social/insights/index": () => null,
  "social/insights/platform-analytics": () => null,
  "create/autoclip": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetSocialMocks();
  resetProjectMocks();
  useComposerSeed.getState().seed({});
});

describe("Accounts", () => {
  it("shows healthy and expired accounts", async () => {
    open("/social");
    expect(await screen.findByText("Token expired")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reconnect Instagram" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sync YouTube now" })).toBeOnTheScreen();
  });

  it("explains that connecting comes with in-app sign-in", async () => {
    open("/social");
    fireEvent.press(await screen.findByRole("button", { name: "Connect YouTube" }));
    expect(screen.getByText(/Connecting opens Google to sign in/)).toBeOnTheScreen();
  });

  it("opens the composer from New post", async () => {
    const r = open("/social");
    await screen.findByText("Token expired");
    press("New post");
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
  });
});

describe("Calendar", () => {
  it("lists the selected day's posts and adds one on that day", async () => {
    const r = open("/social/content-calendar");
    expect(await screen.findByText(/· 2 posts$/)).toBeOnTheScreen();
    press("Add a post on this day");
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
    expect(new Date(useComposerSeed.getState().date!).getHours()).toBe(18);
  });
});

describe("Scheduled", () => {
  it("counts by status and retries a failed post", async () => {
    open("/social/scheduled-posts");
    expect(await screen.findByLabelText("5 scheduled")).toBeOnTheScreen();
    expect(screen.getByLabelText("1 failed")).toBeOnTheScreen();
    press("Retry Why we ignored investors");
    expect(await screen.findByLabelText("0 failed")).toBeOnTheScreen();
    expect(screen.getByLabelText("6 scheduled")).toBeOnTheScreen();
  });

  it("deletes a scheduled post after confirming", async () => {
    open("/social/scheduled-posts");
    fireEvent.press(await screen.findByRole("button", { name: "Edit Hiring your first 10" }));
    press("Delete scheduled post");
    press("Delete");
    expect(await screen.findByLabelText("4 scheduled")).toBeOnTheScreen();
  });
});

describe("Composer", () => {
  // Buttons stay disabled until the ready clips have loaded.
  const ready = () => screen.findByRole("button", { name: "Change clip" });

  it("writes a caption with AI and schedules the post", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Write with AI" }));
    fireEvent.press(await screen.findByRole("radio", { name: /^Most founders/ }));
    expect(screen.getByLabelText("Caption").props.value).toMatch(/^Most founders/);
    expect(screen.getByRole("button", { name: "Remove #founders" })).toBeOnTheScreen();
    press("Schedule post");
    expect(await screen.findByText(/^Scheduled for /)).toBeOnTheScreen();
  });

  it("keeps Reels and Facebook as coming soon", async () => {
    open("/composer");
    expect(await screen.findByRole("checkbox", { name: "Reels, coming soon" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Facebook, coming soon" })).toBeDisabled();
  });

  it("refuses a time in the past", async () => {
    useComposerSeed.getState().seed({ date: new Date(Date.now() - 3600_000).toISOString() });
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Schedule post" }));
    expect(await screen.findByText("Pick a time in the future")).toBeOnTheScreen();
  });

  it("posts now", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("tab", { name: "Now" }));
    press("Post now");
    expect(await screen.findByText("Posting to YouTube Shorts.")).toBeOnTheScreen();
  });

  it("says when AI captions fail", async () => {
    setMockScenario("captions", "error");
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Write with AI" }));
    expect(await screen.findByText(/No connection/)).toBeOnTheScreen();
  });
});
