import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as DocumentPicker from "expo-document-picker";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { makeWrapper } from "@/test/providers";
import { AIMediaScreen } from "../AIMediaScreen";
import { AutoClipScreen } from "../AutoClipScreen";
import { CreateHubScreen } from "../CreateHubScreen";
import { useAutoClipDraft } from "../draft";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const MB = 1024 * 1024;
const picked = (name: string, size: number, mimeType: string) => ({ canceled: false, assets: [{ name, size, mimeType, uri: `file:///${name}` }] });

const routes = {
  "create/index": CreateHubScreen,
  "create/autoclip": AutoClipScreen,
  "create/ai-media": AIMediaScreen,
  "you/credits": () => null,
  "projects/[projectId]": () => null,
  "home/recommended-tools": () => null,
  "projects/assets/ai-assets": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  useAutoClipDraft.getState().reset();
  pickDocument.mockReset();
});

describe("Create hub", () => {
  it("opens AutoClip on the chosen starting point", async () => {
    const r = open("/create");
    await screen.findByText("1,000 min");
    press("Paste link a video for AutoClip");
    await waitFor(() => expect(r.getPathname()).toBe("/create/autoclip"));
    expect(r.getSearchParams()).toMatchObject({ start: "link" });
    expect(await screen.findByText("Paste a link")).toBeOnTheScreen();
  });

  it("says 'coming soon' for tools without an app screen", async () => {
    open("/create");
    press("Face swap, Pro");
    expect(await screen.findByText(/Coming to the app soon/)).toBeOnTheScreen();
  });
});

describe("AutoClip", () => {
  it("can't generate until a video is chosen", async () => {
    open("/create/autoclip");
    const generate = await screen.findByRole("button", { name: "Generate clips" });
    expect(generate).toBeDisabled();
  });

  it("rejects unsupported links and accepts YouTube", async () => {
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Paste link/ }));
    fireEvent.changeText(screen.getByLabelText("Video link"), "https://tiktok.com/@a/video/1");
    press("Use this link");
    expect(await screen.findByText(/Use a YouTube, Vimeo, Loom/)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Video link"), "https://youtu.be/abc123");
    press("Use this link");
    expect(await screen.findByText("Founders Pod · Ep. 42")).toBeOnTheScreen();
    expect(screen.getByText("~59 min")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Generate clips" })).toBeEnabled();
  });

  it("starts a run and opens the project", async () => {
    useAutoClipDraft.getState().setSource({ kind: "asset", assetId: "ast_1", title: "Founders Pod · Ep. 42", durationSec: 3492 });
    const r = open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: "Generate clips" }));
    await waitFor(() => expect(r.getPathname()).toMatch(/^\/projects\//));
    expect(useAutoClipDraft.getState().source).toBeNull();
  });

  it("sends people to Credits when the video needs more minutes than they have", async () => {
    setMockScenario("create", "empty"); // Free plan, 30 minutes
    useAutoClipDraft.getState().setSource({ kind: "link", url: "https://youtu.be/x", title: "Long talk", durationSec: 59 * 60 });
    const r = open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: "Get more minutes" }));
    await waitFor(() => expect(r.getPathname()).toBe("/you/credits"));
  });

  it("checks a picked file against the plan's size limit", async () => {
    setMockScenario("create", "empty"); // Free: 250 MB
    pickDocument.mockResolvedValue(picked("talk.mp4", 300 * MB, "video/mp4"));
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Upload video/ }));
    expect(await screen.findByText(/over your Free plan's 250 MB limit/)).toBeOnTheScreen();
    expect(useAutoClipDraft.getState().source).toBeNull();
  });

  it("accepts a file within the limit", async () => {
    pickDocument.mockResolvedValue(picked("talk.mov", 300 * MB, "video/quicktime"));
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Upload video/ }));
    expect(await screen.findByText("talk.mov")).toBeOnTheScreen();
    expect(screen.getByText("1 min / video min")).toBeOnTheScreen();
  });

  it("keeps the clip count between 1 and 20", async () => {
    open("/create/autoclip");
    const stepper = await screen.findByRole("adjustable", { name: "Clips" });
    for (let i = 0; i < 15; i++) fireEvent(stepper, "accessibilityAction", { nativeEvent: { actionName: "increment" } });
    expect(useAutoClipDraft.getState().settings.clipCount).toBe(20);
    for (let i = 0; i < 25; i++) fireEvent(stepper, "accessibilityAction", { nativeEvent: { actionName: "decrement" } });
    expect(useAutoClipDraft.getState().settings.clipCount).toBe(1);
  });

  it("turns captions off", async () => {
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Captions, Clean/ }));
    fireEvent.press(screen.getByLabelText("Add captions"));
    await waitFor(() => expect(useAutoClipDraft.getState().settings.captionTemplateId).toBeNull());
    expect(screen.getByText("Captions off")).toBeOnTheScreen();
  });
});

describe("AI Media", () => {
  it("opens on the tab it was asked for", async () => {
    open("/create/ai-media?tab=voiceover");
    expect(await screen.findByLabelText("Script")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Voiceover" })).toBeSelected();
  });

  it("locks models above the plan", async () => {
    setMockScenario("create", "empty"); // Free plan
    open("/create/ai-media");
    fireEvent.press(await screen.findByTestId("model-seedream-5.0"));
    expect(await screen.findByText("Seedream 5.0 needs the Creator plan.")).toBeOnTheScreen();
    expect(screen.getByText("2 credits")).toBeOnTheScreen(); // still on the free default
  });

  it("adds a preset's style words to the prompt", async () => {
    open("/create/ai-media");
    fireEvent.changeText(await screen.findByLabelText("Prompt"), "A red bicycle.");
    press("Presets");
    fireEvent.press(screen.getByRole("radio", { name: /^Cinematic/ }));
    expect(screen.getByLabelText("Prompt").props.value).toBe("A red bicycle, cinematic lighting, anamorphic, film grain");
  });

  it("generates an image into the results", async () => {
    open("/create/ai-media");
    await screen.findAllByLabelText(/^Generated image/);
    const before = screen.getAllByLabelText(/^Generated image/).length;
    fireEvent.changeText(screen.getByLabelText("Prompt"), "A lighthouse in a storm");
    press("Generate image");
    await waitFor(() => expect(screen.getAllByLabelText(/^Generated image/).length).toBe(before + 1));
    expect(screen.getByLabelText("Generated image: A lighthouse in a storm")).toBeOnTheScreen();
  });

  it("prices a voiceover by length", async () => {
    open("/create/ai-media?tab=voiceover");
    expect(await screen.findByText("1 credit")).toBeOnTheScreen();
    await act(async () => fireEvent.changeText(screen.getByLabelText("Script"), "x".repeat(501)));
    expect(screen.getByText("2 credits")).toBeOnTheScreen();
  });

  it("rejects audio files over 50 MB", async () => {
    pickDocument.mockResolvedValue(picked("song.wav", 60 * MB, "audio/wav"));
    open("/create/ai-media?tab=vocal");
    fireEvent.press(await screen.findByRole("button", { name: /^Choose an audio or video file/ }));
    expect(await screen.findByText("That file is over the 50 MB limit.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove vocals" })).toBeDisabled();
  });
});
