import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { makeWrapper } from "@/test/providers";
import { EditorScreen } from "../EditorScreen";
import { ExportScreen } from "../ExportScreen";
import { AiToolsPanel, AudioPanel, CaptionsPanel, EffectsPanel, MediaPanel, TextPanel } from "../panels";
import { durationOf, useEditor } from "../store";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));

const routes = {
  "editor/index": EditorScreen,
  "editor/media": MediaPanel,
  "editor/captions": CaptionsPanel,
  "editor/audio": AudioPanel,
  "editor/text": TextPanel,
  "editor/effects": EffectsPanel,
  "editor/ai-tools": AiToolsPanel,
  "editor/export": ExportScreen,
  composer: () => null,
  "you/subscription": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const doc = () => useEditor.getState().doc;

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  useEditor.getState().reset();
});

describe("Timeline", () => {
  it("changes the aspect, and undo / redo it", () => {
    open("/editor");
    fireEvent.press(screen.getByRole("button", { name: "16:9" }));
    expect(doc().aspect).toBe("16:9");
    press("Undo");
    expect(doc().aspect).toBe("9:16");
    press("Redo");
    expect(doc().aspect).toBe("16:9");
  });

  it("splits the clip under the playhead and keeps the length", () => {
    open("/editor");
    const before = durationOf(doc());
    press("Split at playhead");
    expect(doc().segments).toHaveLength(4);
    expect(durationOf(doc())).toBeCloseTo(before);
  });

  it("won't split right at a clip's edge", async () => {
    useEditor.getState().seek(0.2);
    open("/editor");
    press("Split at playhead");
    expect(doc().segments).toHaveLength(3);
    expect(await screen.findByText(/away from the clip's edge/)).toBeOnTheScreen();
  });

  it("selects a clip, moves the playhead there, and deletes it", async () => {
    open("/editor");
    press("Delete selected clip");
    expect(await screen.findByText("Tap a clip on the timeline first.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: /^Clip 0:15 to 0:22/ }), { nativeEvent: { locationX: 0 } });
    expect(useEditor.getState().playhead).toBeGreaterThanOrEqual(15);
    expect(useEditor.getState().playhead).toBeLessThan(22);
    press("Delete selected clip");
    expect(doc().segments.map((s) => s.id)).toEqual(["seg1", "seg3"]);
  });

  it("never deletes the last clip", async () => {
    useEditor.getState().edit((d) => ({ ...d, segments: d.segments.slice(0, 1) }));
    useEditor.getState().select("seg1");
    open("/editor");
    press("Delete selected clip");
    expect(doc().segments).toHaveLength(1);
    expect(await screen.findByText("A project needs at least one clip.")).toBeOnTheScreen();
  });

  it("opens Filters straight from the toolbar", async () => {
    const r = open("/editor");
    press("Filters");
    await waitFor(() => expect(r.getPathname()).toBe("/editor/effects"));
    expect(screen.getByRole("tab", { name: "Filters" })).toBeSelected();
  });
});

describe("Panels", () => {
  it("switch in place and Back returns to the timeline", async () => {
    const r = open("/editor");
    press("Captions");
    await waitFor(() => expect(r.getPathname()).toBe("/editor/captions"));
    fireEvent.press(screen.getByRole("tab", { name: "Audio" }));
    await waitFor(() => expect(r.getPathname()).toBe("/editor/audio"));
    press("Back to timeline");
    await waitFor(() => expect(r.getPathname()).toBe("/editor"));
  });

  it("captions: highlight and position change the project", () => {
    open("/editor/captions");
    fireEvent.press(screen.getByRole("button", { name: "Karaoke" }));
    fireEvent.press(screen.getByRole("tab", { name: "Top" }));
    expect(doc().captions).toMatchObject({ highlight: "karaoke", position: "top" });
  });

  it("effects: picking a filter applies it", () => {
    open("/editor/effects?tab=filters");
    fireEvent.press(screen.getByRole("radio", { name: "Warm" }));
    expect(doc().look.filter).toBe("warm");
  });

  it("text: a preset adds text to the video", () => {
    open("/editor/text");
    press("Add Heading");
    expect(doc().texts).toHaveLength(1);
    expect(doc().texts[0]).toMatchObject({ preset: "Heading", text: "Big Bold Heading" });
  });

  it("media: selects items and adds them at the playhead", async () => {
    open("/editor/media");
    fireEvent.press(await screen.findByRole("checkbox", { name: /^Summit b-roll/ }));
    fireEvent.press(screen.getByRole("checkbox", { name: /^Leg day/ }));
    expect(screen.getByText("2 selected · adds at 0:14")).toBeOnTheScreen();
    press("Add to timeline");
    expect(await screen.findByText("2 items added at 0:14.")).toBeOnTheScreen();
  });

  it("media: offers a retry when the library fails", async () => {
    setMockScenario("media", "error");
    open("/editor/media");
    expect(await screen.findByText("Couldn’t load media")).toBeOnTheScreen();
  });

  it("audio: adding music replaces the music track", async () => {
    open("/editor/audio");
    press("Add music");
    fireEvent.press(await screen.findByRole("radio", { name: /^Night shift/ }));
    expect(doc().audio.music).toEqual({ title: "Night shift", volume: 30 });
  });

  it("AI tools run the real operations; clip tools say 'coming soon'", async () => {
    open("/editor/ai-tools");
    const runs = screen.getAllByRole("button", { name: "Run" });
    fireEvent.press(runs[3]!); // Shorten
    expect(await screen.findByText("Captions shortened.")).toBeOnTheScreen();
    fireEvent.press(screen.getAllByRole("button", { name: "Soon" })[0]!);
    expect(await screen.findByText(/Coming to the app soon/)).toBeOnTheScreen();
  });
});

describe("Export", () => {
  it("shows the real output for the plan", async () => {
    open("/editor/export");
    expect(await screen.findByText("No watermark on your plan")).toBeOnTheScreen();
    expect(screen.getByText("1080×1920")).toBeOnTheScreen();
    expect(screen.getByText("30 fps")).toBeOnTheScreen();
  });

  it("Free plans get 720p with a watermark", async () => {
    setMockScenario("create", "empty");
    open("/editor/export");
    expect(await screen.findByText("Free plan: 720p with a Clipiro watermark")).toBeOnTheScreen();
    expect(screen.getByText("720×1280")).toBeOnTheScreen();
  });

  it("renders, then hands off to the composer when posting", async () => {
    jest.useFakeTimers();
    try {
      const r = open("/editor/export");
      await screen.findByText("No watermark on your plan");
      fireEvent.press(screen.getByRole("radio", { name: "Post to YouTube Shorts" }));
      press("Export video");
      for (let i = 0; i < 14; i++) await act(() => jest.advanceTimersByTime(400));
      expect(screen.getByText("Your video is ready")).toBeOnTheScreen();
      press("Continue to post");
      await waitFor(() => expect(r.getPathname()).toBe("/composer"));
    } finally {
      jest.useRealTimers();
    }
  });
});
