import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { validateDoc } from "@clipiro/shared";
import { ApiError, NetworkError, resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { EDIT_ID, bumpEditElsewhere, renderJob, resetEditMock, resetExportMock, startRender } from "@mocks/editor";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { installMockServer, MOCK_ROUTES } from "@/test/mockServer";
import { makeWrapper } from "@/test/providers";
import * as DocumentPicker from "expo-document-picker";
import { setQueueIO } from "../../assets/uploadQueue";
import { addText } from "../docOps";
import { EditorScreen } from "../EditorScreen";
import { ExportScreen } from "../ExportScreen";
import { AiToolsPanel, AudioPanel, CaptionsPanel, EffectsPanel, MediaPanel, TextPanel } from "../panels";
import { durationOf, useEditor } from "../store";

// The editor on the web's own timeline document, served by the mock API
// (mocks/editor.ts: a podcast cut into three clips with word-timed captions)
// through the real client: opening, editing, autosave with the version
// check, and the panels writing into the doc.

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;

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

  it("captions: made from the speech, laid over the clips cut from it", async () => {
    useEditor.getState().edit((d) => ({ ...d, tracks: { ...d.tracks, caption: [] } }));
    open("/editor/captions");
    press("Generate captions");
    // 1 Clip Minute per started minute of each file: the podcast (58:12) and the b-roll (0:41).
    expect(await screen.findByText(/^Uses 60 Clip Minutes/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "English" }));
    fireEvent.press(screen.getAllByRole("button", { name: "Generate captions" }).at(-1)!);
    await waitFor(() => expect(doc().tracks.caption.length).toBeGreaterThan(0));
    const words = doc().tracks.caption.flatMap((c) => c.text.split(" "));
    // Clip 1 hears 812–827 s, clip 2 840–847 s; the b-roll is silent.
    expect(words.join(" ")).toBe("nobody tells you this part about building in public you ship and then you wait");
    expect(doc().tracks.caption.every((c) => c.timelineStart < 22)).toBe(true);
    expect(validateDoc(doc())).toBeNull();
  });

  it("captions: translating rewrites every cue and stops word highlights", async () => {
    open("/editor/captions");
    press("Translate");
    fireEvent.press(await screen.findByRole("radio", { name: "Spanish" }));
    expect(await screen.findByText("Translated every caption to Spanish.")).toBeOnTheScreen();
    expect(doc().tracks.caption.map((c) => [c.text, c.highlightMode, c.words])).toEqual([
      ["[Spanish] nobody tells you this part", "none", undefined],
      ["[Spanish] and it costs you", "none", undefined],
    ]);
  });

  it("media: files from Assets go in one after another from the playhead", async () => {
    open("/editor/media");
    fireEvent.press(await screen.findByRole("checkbox", { name: /^Leg day\.mov/ }));
    fireEvent.press(screen.getByRole("checkbox", { name: /^Summit\.jpg/ }));
    expect(screen.getByText("2 selected · adds at 0:00")).toBeOnTheScreen();
    expect(screen.queryByRole("checkbox", { name: /^Upbeat drive/ })).toBeNull(); // audio lives in the Audio panel
    press("Add to timeline");
    expect(await screen.findByText("2 items added at 0:00.")).toBeOnTheScreen();
    expect(doc().tracks.video.map((c) => [c.assetId, c.timelineStart, c.duration])[0]).toEqual(["a3", 0, 134]);
    expect(doc().tracks.image[0]).toMatchObject({ assetId: "a4", timelineStart: 134 });
    expect(useEditor.getState().media.a3?.name).toBe("Leg day.mov");
    expect(validateDoc(doc())).toBeNull();
  });

  it("media: offers a retry when the library fails", async () => {
    setMockScenario("assets", "error");
    open("/editor/media");
    expect(await screen.findByText("Couldn’t load media")).toBeOnTheScreen();
  });

  it("media: a stock video is saved to Assets and added", async () => {
    open("/editor/media");
    fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.getByText("Search stock")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Search stock"), "sun");
    fireEvent.press(await screen.findByRole("checkbox", { name: /^Mountain sunrise/ }));
    press("Add to timeline");
    expect(await screen.findByText("1 item added at 0:00.")).toBeOnTheScreen();
    expect(doc().tracks.video[0]).toMatchObject({ assetId: "stock_pv1", duration: 15 });
  });

  it("media: an upload lands in Assets, then on the timeline with its real length", async () => {
    setQueueIO({ readPart: async () => "file:///cache/part", putPart: async (_p, _u, onBytes) => (onBytes(1), { status: 200, etag: '"e1"' }), fileExists: () => true, load: async () => null, save: async () => {} });
    pickDocument.mockResolvedValue({ canceled: false, assets: [{ name: "walk.mp4", size: 1024, mimeType: "video/mp4", uri: "file:///walk.mp4" }] });
    act(() => useEditor.getState().seek(30));
    open("/editor/media");
    fireEvent.press(screen.getByRole("tab", { name: "Upload" }));
    press("Choose videos, images or audio from this phone");
    await waitFor(() => expect(doc().tracks.video.some((c) => c.assetId.startsWith("up"))).toBe(true));
    // After the clip under the playhead (b-roll, 22–41 s), 12 s long as the phone measured it.
    expect(doc().tracks.video.map((c) => [c.timelineStart, c.duration]).at(-1)).toEqual([41, 12]);
    expect(await screen.findByText("Added")).toBeOnTheScreen();
  });

  it("AI tools work on every caption, or on the selected text", async () => {
    open("/editor/ai-tools");
    fireEvent.press(screen.getByRole("button", { name: "Shorten every caption" }));
    expect(await screen.findByText("Shorten: done for every caption.")).toBeOnTheScreen();
    expect(doc().tracks.caption.map((c) => c.text)).toEqual(["nobody tells you this part (shorten)", "and it costs you (shorten)"]);
    act(() => {
      const r = addText(useEditor.getState().doc, 0, { text: "um, watch this", fontFamily: "Poppins", fontSizePct: 0.05, color: "#ffffff", bold: false, bgColor: null, x: 0.5, y: 0.5, align: "center" });
      useEditor.getState().edit(() => r.doc, r.selected);
    });
    fireEvent.press(screen.getByRole("button", { name: "Remove filler words the selected text" }));
    await waitFor(() => expect(doc().tracks.text[0]!.text).toBe("watch this"));
    fireEvent.press(screen.getAllByRole("button", { name: "Soon" })[0]!);
    expect(await screen.findByText(/Coming to the app soon/)).toBeOnTheScreen();
  });

  it("audio: a voiceover is read, saved to Assets and laid at the playhead", async () => {
    act(() => useEditor.getState().seek(4));
    open("/editor/audio");
    press("Voiceover");
    fireEvent.press(await screen.findByRole("radio", { name: /^Aria/ }));
    fireEvent.changeText(screen.getByLabelText("Voiceover script"), "x".repeat(501));
    expect(screen.getByText(/^2 AI credits · 1 credit per 500 characters/)).toBeOnTheScreen();
    press("Add voiceover");
    expect(await screen.findByText("Voiceover added at 0:04.")).toBeOnTheScreen();
    expect(doc().tracks.audio[0]).toMatchObject({ assetId: "vo_1", timelineStart: 4, duration: 6 });
    expect(useEditor.getState().media.vo_1?.name).toBe("Voiceover · Aria");
  });
});


describe("Export", () => {
  beforeEach(async () => {
    jest.useRealTimers();
    resetExportMock();
    await useEditor.getState().open(EDIT_ID);
  });

  it("shows the real output for the plan", async () => {
    open("/editor/export");
    expect(await screen.findByText("No watermark on your plan")).toBeOnTheScreen();
    expect(screen.getByText("1080×1920")).toBeOnTheScreen();
    expect(screen.getByText("30 fps")).toBeOnTheScreen();
  });

  it("Free plans get 720p with a watermark", async () => {
    setMockScenario("account", "empty"); // a Free account
    open("/editor/export");
    expect(await screen.findByText("Free plan: 720p with a Clipiro watermark")).toBeOnTheScreen();
    expect(screen.getByText("720×1280")).toBeOnTheScreen();
  });

  it("saves the latest edit first, renders on the server, then saves to the gallery", async () => {
    useEditor.getState().edit((d) => ({ ...d, aspect: "1:1" }));
    open("/editor/export");
    await screen.findByText("No watermark on your plan");
    press("Export video");
    expect(await screen.findByText("Your video is ready")).toBeOnTheScreen();
    // The render used what was saved: the aspect change went up first.
    expect(useEditor.getState()).toMatchObject({ save: "saved", version: 4 });
    press("Save to gallery");
    expect(await screen.findByText("Saved to your gallery.")).toBeOnTheScreen();
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith(`file:///cache/export-${EDIT_ID}.mp4`);
    press("Share");
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/Nobody tells you this part.mp4", { mimeType: "video/mp4", dialogTitle: "Nobody tells you this part" }));
  });

  it("saves a copy to Assets, or hands off to the composer to post", async () => {
    const r = open("/editor/export");
    await screen.findByText("No watermark on your plan");
    fireEvent.press(screen.getByRole("radio", { name: "Assets" }));
    press("Export video");
    await screen.findByText("Your video is ready");
    press("Save to Assets");
    expect(await screen.findByText("Saved to Assets.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "Post to YouTube Shorts" }));
    press("Continue to post");
    await waitFor(() => expect(r.getPathname()).toBe("/composer"));
  });

  it("a failed render says why and offers to try again", async () => {
    setMockScenario("export", "error");
    open("/editor/export");
    await screen.findByText("No watermark on your plan");
    press("Export video");
    expect(await screen.findByText("The export didn’t finish")).toBeOnTheScreen();
    expect(screen.getByText(/Your credit was refunded/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Try again" })).toBeOnTheScreen();
  });

  it("says when there aren't enough credits", async () => {
    const restore = installMockServer({ ...MOCK_ROUTES, "POST /jobs": async () => { throw Object.assign(new ApiError("Exporting needs 1 AI credit and you have 0.", 402), { code: "insufficient_credits" }); } });
    try {
      open("/editor/export");
      await screen.findByText("No watermark on your plan");
      press("Export video");
      expect(await screen.findAllByText("Exporting needs 1 AI credit and you have 0.")).not.toHaveLength(0);
    } finally {
      restore();
    }
  });

  it("won't export while the latest changes can't be saved", async () => {
    const restore = installMockServer({ ...MOCK_ROUTES, "PUT /projects/:id/editor": async () => { throw new NetworkError(); } });
    try {
      useEditor.getState().edit((d) => ({ ...d, aspect: "1:1" }));
      open("/editor/export");
      await screen.findByText("No watermark on your plan");
      press("Export video");
      expect(await screen.findByText(/You’re offline/)).toBeOnTheScreen();
    } finally {
      restore();
    }
  });

  it("opened from the 'ready' notification, it loads the edit and shows the result", async () => {
    useEditor.getState().reset();
    await startRender(EDIT_ID);
    await renderJob(`exp_${EDIT_ID}`); // the render finished while the app was closed
    open(`/editor/export?projectId=${EDIT_ID}`);
    expect(await screen.findByText("Your video is ready")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Save to gallery" })).toBeOnTheScreen();
  });
});
