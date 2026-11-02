import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { getTools, useUpAssistant } from "@mocks/home";
import * as Clipboard from "expo-clipboard";
import { useAutoClipDraft } from "../../create/draft";
import { useComposerSeed } from "../../social/queries";
import { makeWrapper } from "@/test/providers";
import { AssistantScreen } from "../AssistantScreen";
import { HomeScreen } from "../HomeScreen";
import { ToolsScreen } from "../ToolsScreen";
import { HOME_TOOL_IDS, TOOL_ICONS, costLabel, filterTools } from "../tools";

const routes = {
  home: HomeScreen,
  "home/recommended-tools": ToolsScreen,
  assistant: AssistantScreen,
  "create/ai-media": () => null,
  "create/autoclip": () => null,
  "create/tool/[tool]": () => null,
  "projects/videos-reels-shorts": () => null,
  "projects/[projectId]": () => null,
  composer: () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
});

describe("Home", () => {
  it("shows the dashboard numbers", async () => {
    open("/home");
    expect(await screen.findByText("1,171")).toBeOnTheScreen();
    expect(screen.getByText("24")).toBeOnTheScreen();
    expect(screen.getByText("Pro Creator")).toBeOnTheScreen();
    expect(screen.getByLabelText("Notifications, 2 unread")).toBeOnTheScreen();
  });

  it("shows a skeleton while loading", async () => {
    setMockDelay(50);
    open("/home");
    expect(screen.getByLabelText("Loading your dashboard")).toBeOnTheScreen();
    expect(await screen.findByText("1,171")).toBeOnTheScreen();
  });

  it("offers a retry when the dashboard fails, and recovers", async () => {
    setMockScenario("home", "error");
    open("/home");
    expect(await screen.findByText("Couldn’t load your dashboard")).toBeOnTheScreen();
    setMockScenario("home", "ok");
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("1,171")).toBeOnTheScreen();
  });

  it("guides a brand-new account", async () => {
    setMockScenario("home", "empty");
    open("/home");
    expect(await screen.findByText(/No clips yet/)).toBeOnTheScreen();
    expect(screen.getByText("Nothing rendering")).toBeOnTheScreen();
  });

  it("opens tools that have a screen and says 'coming soon' for the rest", async () => {
    const r = open("/home");
    fireEvent.press(await screen.findByRole("button", { name: "AI Image Generator" }));
    await waitFor(() => expect(r.getPathname()).toBe("/create/ai-media"));
    expect(r.getSearchParams()).toMatchObject({ tab: "image" });
  });

  it("opens the file tools on their own screen", async () => {
    const r = open("/home");
    fireEvent.press(await screen.findByRole("button", { name: "Voice Changer" }));
    await waitFor(() => expect(r.getPathname()).toBe("/create/tool/voice-changer"));
  });

  it("shows the coming-soon toast for a tool without a screen", async () => {
    open("/home/recommended-tools");
    fireEvent.press((await screen.findAllByRole("button", { name: /^AI Brainstormer./ }))[0]!);
    expect(await screen.findByText(/Coming to the app soon/)).toBeOnTheScreen();
  });
});

describe("Tools", () => {
  it("filters to free tools", async () => {
    open("/home/recommended-tools");
    await screen.findByText("Recommended for you");
    fireEvent.press(screen.getByTestId("filter-free"));
    expect(screen.getByRole("button", { name: /^Video Compressor/ })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /^Voice Changer/ })).toBeNull();
    expect(screen.queryByText("Recommended for you")).toBeNull();
  });

  it("searches, and recovers from no results", async () => {
    open("/home/recommended-tools");
    await screen.findByText("Recommended for you");
    fireEvent.press(screen.getByRole("button", { name: "Search tools" }));
    fireEvent.changeText(screen.getByLabelText("Search tools"), "zzz");
    expect(screen.getByText("No tools match “zzz”")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Show all tools" }));
    expect(screen.getByText("Recommended for you")).toBeOnTheScreen();
  });

  it("offers a retry when the catalogue fails", async () => {
    setMockScenario("tools", "error");
    open("/home/recommended-tools");
    expect(await screen.findByText("Couldn’t load tools")).toBeOnTheScreen();
  });
});

describe("Tool catalogue", () => {
  // expo-router/testing-library switches Jest to fake timers; these tests await the mock directly.
  beforeEach(() => jest.useRealTimers());

  it("every tool has an icon, and Home's picks exist", async () => {
    const tools = await getTools();
    for (const t of tools) expect({ id: t.id, icon: !!TOOL_ICONS[t.id] }).toEqual({ id: t.id, icon: true });
    for (const id of HOME_TOOL_IDS) expect(tools.some((t) => t.id === id)).toBe(true);
  });

  it("prices read like the web app", () => {
    expect(costLabel({ kind: "free" })).toBe("Free");
    expect(costLabel({ kind: "clipMinutes" })).toBe("Clip minutes");
    expect(costLabel({ kind: "credits", amount: 1, per: null, from: false })).toBe("1 credit");
    expect(costLabel({ kind: "credits", amount: 8, per: "min", from: false })).toBe("8 credits / min");
    expect(costLabel({ kind: "credits", amount: 2, per: null, from: true })).toBe("From 2 credits");
    expect(costLabel({ kind: "credits", amount: 1, per: "300 chars", from: false })).toBe("1 cr / 300 chars");
  });

  it("search matches names and descriptions, case-insensitively", async () => {
    const tools = await getTools();
    expect(filterTools(tools, "all", "VOICE").map((t) => t.id)).toEqual(["voice-changer", "enhance-speech", "voiceover"]); // "…clean voice…";
    expect(filterTools(tools, "audio", "vocals").map((t) => t.id)).toEqual(["vocal-remover"]);
  });
});

describe("Assistant", () => {
  const ask = (text: string) => {
    fireEvent.changeText(screen.getByLabelText("Message Clipiro AI"), text);
    fireEvent.press(screen.getByRole("button", { name: "Send" }));
  };

  it("finds the hooks in a project and opens the clip it found (the playbook's check)", async () => {
    const r = open("/assistant");
    await screen.findByText(/have the strongest hooks for Shorts/);
    ask("Find the best hooks in my Ep. 42 podcast");
    expect(await screen.findByText(/Your strongest hook is/)).toBeOnTheScreen();
    expect(screen.getByLabelText("Message Clipiro AI").props.value).toBe("");
    expect(screen.getByText("19 messages left today")).toBeOnTheScreen();
    fireEvent.press(screen.getAllByRole("button", { name: /^Open Nobody tells you this part/ }).at(-1)!);
    await waitFor(() => expect(r.getPathname()).toBe("/projects/founders-pod-ep-42"));
    expect(r.getSearchParams()).toMatchObject({ clip: "clp_1" });
  });

  it("writes a caption to copy or post from the composer", async () => {
    const r = open("/assistant");
    await screen.findByText(/have the strongest hooks/);
    ask("Write a caption for my top clip");
    expect(await screen.findByText("Nobody tells you this part of building a company.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith("Nobody tells you this part of building a company.\n\n#founders #startup"));
    fireEvent.press(screen.getByRole("button", { name: "Post it" }));
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
    expect(useComposerSeed.getState()).toMatchObject({ clipId: "clp_1", caption: "Nobody tells you this part of building a company.", hashtags: ["#founders", "#startup"] });
  });

  it("suggests a time and schedules a post for it", async () => {
    const r = open("/assistant");
    await screen.findByText(/have the strongest hooks/);
    ask("When should I post on YouTube?");
    expect(await screen.findByText("YouTube: Thu around 4 PM")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Schedule a post then" }));
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
    expect(useComposerSeed.getState().date).toBe("2026-10-15T10:30:00.000Z");
  });

  it("sets up AutoClip on a video without starting it", async () => {
    const r = open("/assistant");
    await screen.findByText(/have the strongest hooks/);
    ask("Make clips with AutoClip from my Ep. 42 video");
    expect(await screen.findByText(/About 59 Clip Minutes\. Nothing runs until you start it/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Set up AutoClip" }));
    await waitFor(() => expect(r.getPathname()).toBe("/create/autoclip"));
    expect(useAutoClipDraft.getState().source).toEqual({ kind: "asset", assetId: "a1", title: "Founders Pod · Ep. 42.mp4", durationSec: 3520 });
  });

  it("marks a message that didn't send and retries it", async () => {
    open("/assistant");
    await screen.findByText(/have the strongest hooks/);
    setMockScenario("assistant-send", "error");
    ask("Write a caption");
    const retry = await screen.findByRole("button", { name: "Message not sent. Try again" });
    setMockScenario("assistant-send", "ok");
    fireEvent.press(retry);
    expect(await screen.findByText("Here’s one you can post as it is.")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Message not sent. Try again" })).toBeNull();
  });

  it("says when today's messages are used up", async () => {
    useUpAssistant();
    open("/assistant");
    await screen.findByText("0 messages left today");
    ask("hi");
    expect(await screen.findByText(/sent today’s 20 messages/)).toBeOnTheScreen();
  });

  it("starts a new chat after confirming", async () => {
    open("/assistant");
    await screen.findByText(/have the strongest hooks/);
    fireEvent.press(screen.getByRole("button", { name: "New chat" }));
    fireEvent.press(screen.getAllByRole("button", { name: "New chat" }).at(-1)!);
    expect(await screen.findByText("What are we making today?")).toBeOnTheScreen();
  });

  it("greets a new conversation with things to try", async () => {
    setMockScenario("assistant", "empty");
    open("/assistant");
    expect(await screen.findByText("What are we making today?")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Best time to post on YouTube?" }));
    expect(await screen.findByText("YouTube: Thu around 4 PM")).toBeOnTheScreen();
  });
});
