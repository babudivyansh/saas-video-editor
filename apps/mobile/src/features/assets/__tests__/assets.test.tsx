import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as DocumentPicker from "expo-document-picker";
import { resetAssetMocks } from "@mocks/assets";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { makeWrapper } from "@/test/providers";
import { useAutoClipDraft } from "../../create/draft";
import { AiAssetsScreen } from "../AiAssetsScreen";
import { AssetsScreen } from "../AssetsScreen";
import { AudioScreen } from "../AudioScreen";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const MB = 1024 * 1024;

const routes = {
  "projects/assets/index": AssetsScreen,
  "projects/assets/audio": AudioScreen,
  "projects/assets/ai-assets": AiAssetsScreen,
  "create/autoclip": () => null,
  "create/ai-media": () => null,
  editor: () => null,
  "you/my-voices": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetAssetMocks();
  useAutoClipDraft.getState().reset();
  pickDocument.mockReset();
});

describe("Assets", () => {
  it("shows storage against the plan and counts by type", async () => {
    open("/projects/assets");
    expect(await screen.findByText("Studio storage")).toBeOnTheScreen();
    expect(screen.getByText(/17 files · up to 5 GB each/)).toBeOnTheScreen();
    expect(await screen.findByRole("button", { name: "Podcast raw, 2 files" })).toBeOnTheScreen();
  });

  it("filters by type and opens a folder", async () => {
    open("/projects/assets");
    await screen.findByText("Studio storage");
    fireEvent.press(screen.getByRole("button", { name: "Images" }));
    expect(screen.getAllByRole("button", { name: /, image/ })).toHaveLength(2);
    fireEvent.press(await screen.findByRole("button", { name: /^B-roll, 2 files/ }));
    expect(screen.getByRole("header", { name: "B-roll" })).toBeOnTheScreen();
  });

  it("creates a folder and rejects a duplicate name", async () => {
    open("/projects/assets");
    await screen.findByText("Studio storage");
    press("New folder");
    fireEvent.changeText(screen.getByLabelText("Folder name"), "b-roll");
    press("Create folder");
    expect(await screen.findByText("You already have a folder with that name.")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Folder name"), "Thumbnails");
    press("Create folder");
    expect(await screen.findByRole("button", { name: "Thumbnails, 0 files" })).toBeOnTheScreen();
  });

  it("archives a file and restores it", async () => {
    open("/projects/assets");
    fireEvent.press(await screen.findByRole("button", { name: /^Leg day\.mov/ }));
    press(/^Archive · kept/);
    expect(await screen.findByText(/Archived\. Restore it/)).toBeOnTheScreen();
    press("Archived · 2");
    press(/^Leg day\.mov/);
    press("Restore");
    expect(await screen.findByText("Restored.")).toBeOnTheScreen();
  });

  it("sends a video to AutoClip", async () => {
    const r = open("/projects/assets");
    fireEvent.press(await screen.findByRole("button", { name: /^Founders Pod · Ep\. 42\.mp4/ }));
    press("Use for AutoClip");
    await waitFor(() => expect(r.getPathname()).toBe("/create/autoclip"));
    expect(useAutoClipDraft.getState().source).toMatchObject({ kind: "asset", assetId: "a1" });
  });

  it("refuses uploads that don't fit the plan", async () => {
    setMockScenario("create", "empty"); // Free: 250 MB per file, 0.5 GB total
    pickDocument.mockResolvedValue({ canceled: false, assets: [{ name: "huge.mp4", size: 300 * MB, mimeType: "video/mp4", uri: "file:///huge.mp4" }] });
    open("/projects/assets");
    await screen.findByText("Free storage");
    press("Upload");
    expect(await screen.findByText(/huge\.mp4: That file is bigger than your plan allows/)).toBeOnTheScreen();
  });

  it("adds an accepted upload as processing", async () => {
    pickDocument.mockResolvedValue({ canceled: false, assets: [{ name: "clip.mp4", size: 20 * MB, mimeType: "video/mp4", uri: "file:///clip.mp4" }] });
    open("/projects/assets");
    await screen.findByText("Studio storage");
    press("Upload");
    expect(await screen.findByRole("button", { name: /^clip\.mp4, video, processing/ })).toBeOnTheScreen();
  });

  it("guides an empty library and recovers from errors", async () => {
    setMockScenario("assets", "empty");
    const { unmount } = open("/projects/assets");
    expect(await screen.findByText("Your library is empty")).toBeOnTheScreen();
    unmount();
    setMockScenario("assets", "error");
    open("/projects/assets");
    expect(await screen.findByText("Couldn’t load your assets", undefined, { timeout: 4000 })).toBeOnTheScreen();
  });
});

describe("Audio", () => {
  it("lists audio and plays one track at a time", async () => {
    open("/projects/assets/audio");
    expect(await screen.findByText(/^7 audio files/)).toBeOnTheScreen();
    press("Play Intro sting — neon");
    press("Play Upbeat drive");
    expect(screen.getByRole("button", { name: "Pause Upbeat drive" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Play Intro sting — neon" })).toBeOnTheScreen();
  });
});

describe("AI Assets", () => {
  it("groups what the AI tools made", async () => {
    open("/projects/assets/ai-assets");
    expect(await screen.findByLabelText("3 Images")).toBeOnTheScreen();
    expect(screen.getByLabelText("2 Voiceovers")).toBeOnTheScreen();
    expect(screen.getByLabelText("2 Cleanup")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /made with Seedream 5\.0$/ })).toBeOnTheScreen();
  });
});
