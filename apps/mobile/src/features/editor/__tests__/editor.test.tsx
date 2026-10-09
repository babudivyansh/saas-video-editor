import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { validateDoc } from "@clipiro/shared";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { EDIT_ID, bumpEditElsewhere, resetEditMock } from "@mocks/editor";
import { installMockServer, MOCK_ROUTES } from "@/test/mockServer";
import { makeWrapper } from "@/test/providers";
import { EditorScreen } from "../EditorScreen";
import { ExportScreen } from "../ExportScreen";
import { AiToolsPanel, AudioPanel, CaptionsPanel, EffectsPanel, MediaPanel, TextPanel } from "../panels";
import { durationOf, useEditor } from "../store";

// The editor on the web's own timeline document, served by the mock API
// (mocks/editor.ts: a podcast cut into three clips with word-timed captions)
// through the real client: opening, editing, autosave with the version
// check, and the panels writing into the doc.

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
  "projects/drafts": () => null,
  composer: () => null,
  "you/subscription": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const openEdit = async () => {
  const r = open(`/editor?projectId=${EDIT_ID}`);
  await screen.findByText("Nobody tells you this part");
  return r;
};
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const doc = () => useEditor.getState().doc;
const videoIds = () => doc().tracks.video.map((c) => [c.id, c.timelineStart, c.duration]);

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetEditMock();
  useEditor.getState().reset();
});

describe("Opening", () => {
  it("opens the edit with its clips and length", async () => {
    await openEdit();
    expect(screen.getByText("Saved")).toBeOnTheScreen();
    expect(durationOf(doc())).toBe(41);
    expect(screen.getByRole("button", { name: /^Video clip, 0:15 to 0:22/ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Caption clip, nobody tells you this part/ })).toBeOnTheScreen();
  });

  it("says when the edit is gone, or none was asked for", async () => {
    const { unmount } = open("/editor?projectId=nope");
    expect(await screen.findByText("This edit is gone")).toBeOnTheScreen();
    unmount();
    open("/editor");
    expect(await screen.findByText("No edit open")).toBeOnTheScreen();
  });
});

describe("Timeline", () => {
  it("changes the aspect, undoes and redoes it, and saves it", async () => {
    await openEdit();
    fireEvent.press(screen.getByRole("button", { name: "16:9" }));
    expect(doc().aspect).toBe("16:9");
    press("Undo");
    expect(doc().aspect).toBe("9:16");
    press("Redo");
    expect(doc().aspect).toBe("16:9");
    // Autosaved against the version it was read at (3); the server's is now 4.
    await waitFor(() => expect(useEditor.getState()).toMatchObject({ save: "saved", version: 4 }), { timeout: 10000 });
  });

  it("splits the clip under the playhead, keeping the length and the source in sync", async () => {
    await openEdit();
    act(() => useEditor.getState().seek(5));
    press("Split at playhead");
    expect(doc().tracks.video.map((c) => [c.timelineStart, c.duration, c.srcIn])).toEqual([[0, 5, 812], [5, 10, 817], [15, 7, 840], [22, 19, 0]]);
    expect(durationOf(doc())).toBe(41);
    expect(validateDoc(doc())).toBeNull();
  });

  it("won't split right at a clip's edge", async () => {
    await openEdit();
    act(() => useEditor.getState().seek(0.1));
    press("Split at playhead");
    expect(doc().tracks.video).toHaveLength(3);
    expect(await screen.findByText(/away from its edges/)).toBeOnTheScreen();
  });

  it("selects a clip on the timeline and deletes it, closing the gap", async () => {
    await openEdit();
    press("Delete selected clip");
    expect(await screen.findByText("Tap a clip on the timeline first.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: /^Video clip, 0:15 to 0:22/ }));
    expect(useEditor.getState().selected).toEqual({ track: "video", id: "v2" });
    press("Delete selected clip");
    expect(videoIds()).toEqual([["v1", 0, 15], ["v3", 15, 19]]);
  });

  it("duplicates and reorders the selected clip", async () => {
    await openEdit();
    fireEvent.press(screen.getByRole("button", { name: /^Video clip, 0:15 to 0:22/ }));
    press("Duplicate clip");
    expect(videoIds().map(([, s, d]) => [s, d])).toEqual([[0, 15], [15, 7], [22, 7], [29, 19]]);
    const copy = useEditor.getState().selected!.id;
    press("Move clip earlier");
    expect(doc().tracks.video.findIndex((c) => c.id === copy)).toBe(1);
    expect(validateDoc(doc())).toBeNull();
  });

  it("stops autosave and offers a reload when the edit changed elsewhere", async () => {
    await openEdit();
    bumpEditElsewhere();
    fireEvent.press(screen.getByRole("button", { name: "1:1" }));
    expect(await screen.findByText(/changed somewhere else/, undefined, { timeout: 10000 })).toBeOnTheScreen();
    expect(useEditor.getState().save).toBe("conflict");
    press("Reload");
    await waitFor(() => expect(useEditor.getState()).toMatchObject({ save: "saved", version: 4 }));
    expect(doc().aspect).toBe("9:16");
  });

  it("keeps the edit when offline, and saves it once back", async () => {
    await openEdit();
    const restore = installMockServer({ ...MOCK_ROUTES, "PUT /projects/:id/editor": async () => { throw new TypeError("Network request failed"); } });
    fireEvent.press(screen.getByRole("button", { name: "1:1" }));
    expect(await screen.findByText("Offline · will save", undefined, { timeout: 10000 })).toBeOnTheScreen();
    restore();
    void useEditor.getState().flush();
    await waitFor(() => expect(useEditor.getState()).toMatchObject({ save: "saved", version: 4 }), { timeout: 10000 });
    expect(doc().aspect).toBe("1:1");
  });

  it("opens Filters straight from the toolbar", async () => {
    const r = await openEdit();
    press("Filters");
    await waitFor(() => expect(r.getPathname()).toBe("/editor/effects"));
    expect(screen.getByRole("tab", { name: "Filters" })).toBeSelected();
  });
});

describe("Panels", () => {
  beforeEach(async () => {
    jest.useRealTimers();
    await useEditor.getState().open(EDIT_ID);
  });

  it("switch in place and Back returns to the timeline", async () => {
    const r = open(`/editor/captions`);
    fireEvent.press(screen.getByRole("tab", { name: "Audio" }));
    await waitFor(() => expect(r.getPathname()).toBe("/editor/audio"));
    press("Back to timeline");
    await waitFor(() => expect(r.getPathname()).toBe("/editor"));
  });

  it("captions: highlight and position restyle every cue", () => {
    open("/editor/captions");
    fireEvent.press(screen.getByRole("button", { name: "Karaoke" }));
    fireEvent.press(screen.getByRole("tab", { name: "Top" }));
    expect(doc().tracks.caption.map((c) => [c.highlightMode, c.y])).toEqual([
      ["karaoke", 0.15],
      ["karaoke", 0.15],
    ]);
  });

  it("captions: an edit without captions offers to generate them", () => {
    useEditor.getState().edit((d) => ({ ...d, tracks: { ...d.tracks, caption: [] } }));
    open("/editor/captions");
    expect(screen.getByText("No captions yet")).toBeOnTheScreen();
  });

  it("effects: a filter goes on the clip under the playhead, or on all", async () => {
    open("/editor/effects?tab=filters");
    fireEvent.press(screen.getByRole("radio", { name: "Warm" }));
    expect(doc().tracks.video.map((c) => c.filter ?? "none")).toEqual(["warm", "none", "none"]);
    press("Apply to all");
    expect(doc().tracks.video.every((c) => c.filter === "warm")).toBe(true);
  });

  it("text: a preset adds text at the playhead, and the panel then edits it", () => {
    open("/editor/text");
    press("Add Heading");
    expect(doc().tracks.text).toHaveLength(1);
    expect(doc().tracks.text[0]).toMatchObject({ text: "Big Bold Heading", timelineStart: 0, fontFamily: "Anton", align: "center" });
    fireEvent.changeText(screen.getByLabelText("Text on screen"), "Watch till the end");
    expect(doc().tracks.text[0]!.text).toBe("Watch till the end");
    expect(validateDoc(doc())).toBeNull();
  });

  it("audio: music from Assets goes on the audio track, with its own volume", async () => {
    open("/editor/audio");
    press("Add music");
    fireEvent.press(await screen.findByRole("radio", { name: /^Upbeat drive/ }));
    expect(doc().tracks.audio).toHaveLength(1);
    expect(doc().tracks.audio[0]).toMatchObject({ timelineStart: 0, volume: 0.3 });
    expect(screen.getByLabelText(/^Upbeat drive.* volume/)).toBeOnTheScreen();
    expect(validateDoc(doc())).toBeNull();
  });

  it("media: selects items and adds them at the playhead", async () => {
    open("/editor/media");
    fireEvent.press(await screen.findByRole("checkbox", { name: /^Summit b-roll/ }));
    fireEvent.press(screen.getByRole("checkbox", { name: /^Leg day/ }));
    expect(screen.getByText("2 selected · adds at 0:00")).toBeOnTheScreen();
    press("Add to timeline");
    expect(await screen.findByText("2 items added at 0:00.")).toBeOnTheScreen();
  });

  it("media: offers a retry when the library fails", async () => {
    setMockScenario("media", "error");
    open("/editor/media");
    expect(await screen.findByText("Couldn’t load media")).toBeOnTheScreen();
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
