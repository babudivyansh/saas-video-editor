import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { getTools } from "@mocks/home";
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
  "projects/videos-reels-shorts": () => null,
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

  it("shows the coming-soon toast for a tool without a screen", async () => {
    open("/home");
    fireEvent.press(await screen.findByRole("button", { name: "Voice Changer" }));
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
    expect(costLabel({ kind: "credits", amount: 1, per: "500 chars", from: false })).toBe("1 cr / 500 chars");
  });

  it("search matches names and descriptions, case-insensitively", async () => {
    const tools = await getTools();
    expect(filterTools(tools, "all", "VOICE").map((t) => t.id)).toEqual(["voice-changer", "enhance-speech", "voiceover"]); // "…clean voice…";
    expect(filterTools(tools, "audio", "vocals").map((t) => t.id)).toEqual(["vocal-remover"]);
  });
});

describe("Assistant", () => {
  it("shows the conversation and sends a message", async () => {
    open("/assistant");
    expect(await screen.findByText(/I found 12 moments/)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Message Clipiro AI"), "Write a hook");
    fireEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/first pass at “Write a hook”/)).toBeOnTheScreen();
    expect(screen.getByLabelText("Message Clipiro AI").props.value).toBe("");
  });

  it("marks a failed message and retries it", async () => {
    open("/assistant");
    await screen.findByText(/I found 12 moments/);
    setMockScenario("assistant-send", "error");
    fireEvent.press(screen.getByRole("button", { name: "Write 3 hooks for my next Short" }));
    const retry = await screen.findByRole("button", { name: "Message not sent. Try again" });
    setMockScenario("assistant-send", "ok");
    fireEvent.press(retry);
    expect(await screen.findByText(/first pass at “Write 3 hooks/)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Message not sent. Try again" })).toBeNull();
  });

  it("greets a new conversation", async () => {
    setMockScenario("assistant", "empty");
    open("/assistant");
    expect(await screen.findByText("What are we making today?")).toBeOnTheScreen();
  });
});
