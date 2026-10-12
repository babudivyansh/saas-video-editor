import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as DocumentPicker from "expo-document-picker";
import { resetAssetMocks } from "@mocks/assets";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { installMockServer, MOCK_ROUTES } from "@/test/mockServer";
import { makeWrapper } from "@/test/providers";
import { useAutoClipDraft } from "../../create/draft";
import { AiAssetsScreen } from "../AiAssetsScreen";
import { AssetsScreen } from "../AssetsScreen";
import { AudioScreen } from "../AudioScreen";
import { usePlayer } from "../AudioRow";
import { setQueueIO, useUploadQueue } from "../uploadQueue";

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

let restoreServer: () => void = () => {};
afterEach(() => {
  restoreServer();
  restoreServer = () => {};
});

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetAssetMocks();
  useAutoClipDraft.getState().reset();
  pickDocument.mockReset();
  useUploadQueue.setState({ items: [] });
  usePlayer.setState({ playing: null });
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
    // The archive count comes back from the server with the meter.
    fireEvent.press(await screen.findByRole("button", { name: "Archived · 2" }));
    fireEvent.press(await screen.findByRole("button", { name: /^Leg day\.mov/ }));
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
    setMockScenario("account", "empty"); // Free: 250 MB per file, 0.5 GB total
    pickDocument.mockResolvedValue({ canceled: false, assets: [{ name: "huge.mp4", size: 300 * MB, mimeType: "video/mp4", uri: "file:///huge.mp4" }] });
    open("/projects/assets");
    await screen.findByText("Free storage");
    press("Upload");
    expect(await screen.findByText(/huge\.mp4: That file is bigger than your plan allows/)).toBeOnTheScreen();
  });

  it("adds an accepted upload as processing", async () => {
    setQueueIO({ readPart: async () => "file:///cache/part", putPart: async (_p, _u, onBytes) => (onBytes(1), { status: 200, etag: '"e1"' }), fileExists: () => true, load: async () => null, save: async () => {} });
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

describe("Instant changes", () => {
  it("stars at once, and puts it back when the server says no", async () => {
    restoreServer();
    restoreServer = installMockServer({ ...MOCK_ROUTES, "PATCH /assets/:id": async () => [500, { error: "Something went wrong on our side. Try again." }] });
    open("/projects/assets");
    fireEvent.press(await screen.findByRole("button", { name: /^Leg day\.mov/ }));
    press("Star");
    // Shown starred straight away…
    expect(await screen.findByRole("button", { name: /^Leg day\.mov.*, starred/ })).toBeOnTheScreen();
    // …then put back with the server's reason.
    expect(await screen.findByText("Something went wrong on our side. Try again.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Leg day\.mov.*, starred/ })).toBeNull());
  });
});

describe("Audio playback", () => {
  it("plays the file's signed link and switches tracks", async () => {
    const player = (jest.requireMock("expo-audio") as { __player: { replace: jest.Mock; play: jest.Mock; pause: jest.Mock } }).__player;
    open("/projects/assets/audio");
    await screen.findByText(/^7 audio files/);
    press("Play Upbeat drive");
    expect(player.replace).toHaveBeenLastCalledWith({ uri: expect.stringMatching(/^https:\/\/cdn\.test\//) });
    expect(player.play).toHaveBeenCalled();
    press("Pause Upbeat drive");
    expect(player.pause).toHaveBeenCalled();
  });
});

describe("Upload queue", () => {
  const file = (name: string) => ({ uri: `file:///cache/${name}`, name, mimeType: "video/mp4", sizeBytes: 3 * MB });
  const io = (fail: () => boolean) => ({
    readPart: async () => "file:///cache/part",
    putPart: async (_p: string, _u: string, onBytes: (n: number) => void) => {
      if (fail()) throw new Error("Network request failed");
      onBytes(1);
      return { status: 200, etag: '"e1"' };
    },
    fileExists: () => true,
    load: async () => null,
    save: async () => {},
  });
  const settle = () => waitFor(() => expect(useUploadQueue.getState().items.every((x) => x.status !== "queued" && x.status !== "uploading")).toBe(true));

  it("uploads one file after another", async () => {
    jest.useRealTimers();
    setQueueIO(io(() => false));
    useUploadQueue.getState().add([file("a.mp4"), file("b.mp4")]);
    await settle();
    expect(useUploadQueue.getState().items.map((x) => x.status)).toEqual(["done", "done"]);
  });

  it("pauses on a lost connection and carries on with Retry", async () => {
    jest.useRealTimers();
    let offline = true;
    setQueueIO(io(() => offline));
    useUploadQueue.getState().add([file("a.mp4"), file("b.mp4")]);
    // The first pauses; the rest wait behind it.
    await waitFor(() => expect(useUploadQueue.getState().items.map((x) => x.status)).toEqual(["paused", "queued"]));
    offline = false;
    useUploadQueue.getState().retry();
    await settle();
    expect(useUploadQueue.getState().items.map((x) => x.status)).toEqual(["done", "done"]);
  });

  it("cancel drops the file and tells storage", async () => {
    jest.useRealTimers();
    setQueueIO(io(() => true));
    useUploadQueue.getState().add([file("a.mp4")]);
    await settle();
    const id = useUploadQueue.getState().items[0]!.id;
    await useUploadQueue.getState().cancel(id);
    expect(useUploadQueue.getState().items).toEqual([]);
  });
});
