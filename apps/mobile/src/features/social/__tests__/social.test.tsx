import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { resetProjectMocks } from "@mocks/projects";
import { lastCreateRequest, resetSocialMocks } from "@mocks/social";
import { resetInsightsMocks } from "@mocks/insights";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
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
const signIn = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetSocialMocks();
  resetProjectMocks();
  resetInsightsMocks();
  useComposerSeed.getState().seed({});
});

describe("Accounts", () => {
  it("shows healthy and expired accounts", async () => {
    open("/social");
    expect(await screen.findByText("Token expired")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reconnect Instagram" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Sync YouTube now" })).toBeOnTheScreen();
  });

  it("connects YouTube through Google's sign-in, then shows it", async () => {
    signIn.mockResolvedValueOnce({ type: "success", url: "clipiro://social?connected=youtube" });
    open("/social");
    fireEvent.press(await screen.findByRole("button", { name: "Connect YouTube" }));
    expect(screen.getByText(/Google asks you to let Clipiro read your channel’s stats/)).toBeOnTheScreen();
    press("Continue to Google");
    expect(await screen.findByText("YouTube connected. The first numbers arrive in a minute.")).toBeOnTheScreen();
    expect(signIn).toHaveBeenCalledWith("https://signin.test/youtube?state=s", "clipiro://social");
  });

  it("says why a connect didn't happen, and says nothing when it's closed", async () => {
    signIn.mockResolvedValueOnce({ type: "success", url: "clipiro://social?error=access_denied" });
    open("/social");
    fireEvent.press(await screen.findByRole("button", { name: "Reconnect Instagram" }));
    press("Continue to Meta");
    expect(await screen.findByText("You didn’t give Clipiro access to Instagram, so nothing was connected.")).toBeOnTheScreen();
    signIn.mockResolvedValueOnce({ type: "cancel" });
    press("Continue to Meta");
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Continue to Meta" })).toBeOnTheScreen(); // still offered
  });

  it("reads a connect that came back through the app link", async () => {
    open("/social?connected=instagram");
    expect(await screen.findByText("Instagram connected. The first numbers arrive in a minute.")).toBeOnTheScreen();
  });

  it("disconnects an account after confirming", async () => {
    open("/social");
    fireEvent.press(await screen.findByRole("button", { name: "Disconnect Facebook" }));
    press("Disconnect");
    expect(await screen.findByText("Facebook disconnected.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Disconnect Facebook" })).toBeNull());
  });

  it("asks a Free account to upgrade", async () => {
    setMockScenario("subscription", "empty");
    open("/social");
    expect(await screen.findByText("Insights are on paid plans")).toBeOnTheScreen();
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

  it("asks a Free account to upgrade", async () => {
    setMockScenario("subscription", "empty");
    open("/social/content-calendar");
    expect(await screen.findByText("Insights are on paid plans")).toBeOnTheScreen();
  });
});

describe("Scheduled", () => {
  it("counts by status and retries a failed post", async () => {
    open("/social/scheduled-posts");
    expect(await screen.findByLabelText("5 scheduled")).toBeOnTheScreen();
    expect(screen.getByLabelText("1 failed")).toBeOnTheScreen();
    press("Retry Why we ignored investors");
    expect(await screen.findByLabelText("0 failed")).toBeOnTheScreen();
    expect(await screen.findByText("Posting now")).toBeOnTheScreen();
    expect(screen.getByText("Posting to YouTube again.")).toBeOnTheScreen();
  });

  it("deletes a scheduled post after confirming", async () => {
    open("/social/scheduled-posts");
    fireEvent.press(await screen.findByRole("button", { name: "Edit Hiring your first 10" }));
    press("Delete scheduled post");
    press("Delete");
    expect(await screen.findByLabelText("4 scheduled")).toBeOnTheScreen();
  });

  it("opens a scheduled post in the composer to edit it", async () => {
    const r = open("/social/scheduled-posts");
    fireEvent.press(await screen.findByRole("button", { name: "Edit Hiring your first 10" }));
    press("Edit post");
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
    expect(useComposerSeed.getState().editId).toBe("p6");
  });

  it("helps post an Instagram post yourself: share with the caption copied, then link it", async () => {
    open("/social/scheduled-posts");
    expect(await screen.findByRole("header", { name: "Your turn" })).toBeOnTheScreen();
    press("Post it Ship before you're ready");
    press("Share to Instagram");
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Ship it.\n\n#startup");
    expect(await screen.findByText("Caption copied. Paste it in Instagram.")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Post link"), "not a link");
    press("Save link");
    expect(await screen.findByText("Paste the post's link")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Post link"), "https://www.instagram.com/reel/abc/");
    press("Save link");
    expect(await screen.findByText("Linked. Its numbers show up in Insights after the next sync.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByRole("header", { name: "Your turn" })).toBeNull());
  });

  it("opens the post a notification points at", async () => {
    open("/social/scheduled-posts?post=p5");
    expect(await screen.findByRole("button", { name: "Retry now" })).toBeOnTheScreen();
    expect(screen.getAllByText("Reconnect your YouTube account to allow uploads, then retry this post.").length).toBeGreaterThan(0);
  });

  it("asks a Free account to upgrade", async () => {
    setMockScenario("subscription", "empty");
    open("/social/scheduled-posts");
    expect(await screen.findByText("Insights are on paid plans")).toBeOnTheScreen();
  });
});

describe("Composer", () => {
  // Buttons stay disabled until the ready clips have loaded.
  const ready = () => screen.findByRole("button", { name: "Change video" });

  it("writes a caption with AI and schedules the post", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Write with AI" }));
    fireEvent.press(await screen.findByRole("radio", { name: /^Most founders/ }));
    expect(screen.getByLabelText("Caption").props.value).toMatch(/^Most founders/);
    expect(screen.getByRole("button", { name: "Remove #founders" })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("tab", { name: "Schedule" }));
    press("Schedule post");
    expect(await screen.findByText(/^Scheduled for /)).toBeOnTheScreen();
    expect(lastCreateRequest()).toMatchObject({ accountIds: ["acc_yt"], privacy: "public", hashtags: expect.arrayContaining(["#founders"]) });
    expect(lastCreateRequest()!.when).not.toBe("now");
  });

  it("posts now to YouTube, and to Facebook as your turn", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("checkbox", { name: "Facebook, Maya Creates, you post it" }));
    expect(screen.getByText(/Clipiro can’t post to Instagram or Facebook for you yet/)).toBeOnTheScreen();
    press("Post now");
    expect(await screen.findByText("Posting to YouTube. Your turn on Facebook: it’s in Scheduled.")).toBeOnTheScreen();
    expect(lastCreateRequest()).toMatchObject({ accountIds: ["acc_yt", "acc_fb"], when: "now" });
  });

  it("won't pick an account that needs reconnecting", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("checkbox", { name: "Instagram, maya.okafor, needs reconnecting" }));
    expect(await screen.findByText("Reconnect Instagram on the Accounts tab first.")).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Instagram, maya.okafor, needs reconnecting" })).not.toBeChecked();
  });

  it("holds Instagram and Facebook to 2,200 characters", async () => {
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("checkbox", { name: "Facebook, Maya Creates, you post it" }));
    fireEvent.changeText(screen.getByLabelText("Caption"), "x".repeat(2201));
    press("Post now");
    expect(await screen.findByText("Keep the caption under 2,200 characters for Instagram and Facebook")).toBeOnTheScreen();
    expect(lastCreateRequest()).toBeNull();
  });

  it("refuses a time too soon", async () => {
    useComposerSeed.getState().seed({ date: new Date(Date.now() - 3600_000).toISOString() });
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Schedule post" }));
    expect(await screen.findByText("Pick a time at least 5 minutes from now")).toBeOnTheScreen();
  });

  it("posts an Assets video, and says when YouTube won't make it a Short", async () => {
    useComposerSeed.getState().seed({ assetId: "a1" });
    open("/composer");
    expect(await screen.findByText("Founders Pod · Ep. 42")).toBeOnTheScreen();
    press("Post now");
    expect(await screen.findByText(/YouTube will post this as a regular video/)).toBeOnTheScreen();
    expect(lastCreateRequest()!.source).toEqual({ assetId: "a1" });
  });

  it("edits a scheduled post in place", async () => {
    useComposerSeed.getState().seed({ editId: "p6" });
    open("/composer");
    expect(await screen.findByText("Edit post")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByLabelText("Caption").props.value).toBe("Hiring is the job."));
    fireEvent.changeText(screen.getByLabelText("Caption"), "Hiring is the whole job.");
    press("Save changes");
    expect(await screen.findByText(/^Changes saved\./)).toBeOnTheScreen();
  });

  it("asks a Free account to upgrade", async () => {
    setMockScenario("subscription", "empty");
    open("/composer");
    expect(await screen.findByText("Insights are on paid plans")).toBeOnTheScreen();
  });

  it("says when AI captions fail", async () => {
    setMockScenario("captions", "error");
    open("/composer");
    await ready();
    fireEvent.press(screen.getByRole("button", { name: "Write with AI" }));
    expect(await screen.findByText(/No connection/)).toBeOnTheScreen();
  });
});
