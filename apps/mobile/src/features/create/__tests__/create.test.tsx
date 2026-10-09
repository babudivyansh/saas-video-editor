import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { accountFixture, installFakeApi, videoAssetFixture } from "@/test/fakeApi";
import { makeWrapper } from "@/test/providers";
import { AIMediaScreen } from "../AIMediaScreen";
import { AutoClipScreen } from "../AutoClipScreen";
import { CreateHubScreen } from "../CreateHubScreen";
import { useAutoClipDraft } from "../draft";
import { setUploadIO, useAutoClipUpload } from "../uploadStore";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;
const pickImage = ImagePicker.launchImageLibraryAsync as jest.Mock;
const MB = 1024 * 1024;
const picked = (name: string, size: number, mimeType: string) => ({ canceled: false, assets: [{ name, size, mimeType, uri: `file:///${name}` }] });

const routes = {
  "create/index": CreateHubScreen,
  "create/autoclip": AutoClipScreen,
  "create/ai-media": AIMediaScreen,
  "you/credits": () => null,
  "projects/[projectId]": () => null,
  "create/run/[jobId]": () => null,
  "home/recommended-tools": () => null,
  "projects/assets/ai-assets": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  useAutoClipDraft.getState().reset();
  useAutoClipUpload.getState().clear();
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
  // The real API client over a fake server: the account (plan + balances),
  // the videos in Assets, and POST /jobs.
  let server: ReturnType<typeof installFakeApi>;
  let jobAnswer: (b: Record<string, unknown>) => [number, unknown];
  const serve = (account = accountFixture()) => {
    server = installFakeApi({
      "GET /me": () => [200, account],
      "GET /assets": () => [200, { assets: [videoAssetFixture()], nextCursor: null, total: 1 }],
      "POST /jobs": (b) => jobAnswer(b),
      "POST /uploads": () => [200, { key: "k", uploadId: "u", partSizeBytes: 10 * MB, parts: [{ partNumber: 1, url: "https://s3.test/up?partNumber=1" }] }],
      "POST /uploads/complete": () => [200, videoAssetFixture({ id: "ast_up", name: "talk.mov", durationSec: null })],
    });
  };
  beforeEach(() => {
    jobAnswer = () => [202, { jobId: "run_p1" }];
    serve();
  });
  afterEach(() => server.restore());

  it("can't generate until a video is chosen", async () => {
    open("/create/autoclip");
    const generate = await screen.findByRole("button", { name: "Generate clips" });
    expect(generate).toBeDisabled();
  });

  it("rejects unsupported links and starts from a YouTube one", async () => {
    const r = open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Paste link/ }));
    fireEvent.changeText(screen.getByLabelText("Video link"), "https://tiktok.com/@a/video/1");
    press("Use this link");
    expect(await screen.findByText(/Use a YouTube, Vimeo, Loom/)).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Video link"), "https://youtu.be/abc123");
    press("Use this link");
    // The server measures a link when the run starts.
    expect(await screen.findByText("Length unknown · youtu.be")).toBeOnTheScreen();
    await act(async () => press("Generate clips"));
    await waitFor(() => expect(r.getPathname()).toBe("/create/run/run_p1"));
    expect(server.to("POST", "/jobs")[0]!.body).toMatchObject({ type: "autoclip", source: { kind: "link", url: "https://youtu.be/abc123" }, allowCreditOverflow: false });
  });

  it("starts a run from Assets and opens the project", async () => {
    const r = open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: "From Assets. 1 video" }));
    fireEvent.press(screen.getByRole("button", { name: /^Founders Pod · Ep. 42/ }));
    expect(screen.getByText("~59 min")).toBeOnTheScreen();
    await act(async () => press("Generate clips"));
    await waitFor(() => expect(r.getPathname()).toBe("/create/run/run_p1"));
    expect(server.to("POST", "/jobs")[0]!.body).toMatchObject({ source: { kind: "asset", assetId: "ast_1" }, settings: { clipCount: 8, aspectRatio: "9:16" } });
    expect(useAutoClipDraft.getState().source).toBeNull();
  });

  it("offers to pay a known minutes shortfall in AI credits before sending anything", async () => {
    server.restore();
    serve(accountFixture({ tier: "free", minutes: 30 }));
    useAutoClipDraft.getState().setSource({ kind: "asset", assetId: "ast_1", title: "Long talk", durationSec: 59 * 60 });
    const r = open("/create/autoclip");
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Generate clips" })));
    expect(await screen.findByText("This video needs 59 Clip Minutes and you have 30.")).toBeOnTheScreen();
    expect(server.to("POST", "/jobs")).toHaveLength(0);
    // 29 minutes short, 3 minutes per credit.
    await act(async () => press("Use 10 AI credits for the rest"));
    await waitFor(() => expect(r.getPathname()).toBe("/create/run/run_p1"));
    expect(server.to("POST", "/jobs")[0]!.body).toMatchObject({ allowCreditOverflow: true });
  });

  it("shows the server's refusal for a link it measured, and can go get minutes", async () => {
    jobAnswer = () => [402, { error: "This video needs 45 Clip Minutes and you have 30.", code: "insufficient_minutes", required: 45, balance: 30, overflowCredits: 5 }];
    useAutoClipDraft.getState().setSource({ kind: "link", url: "https://youtu.be/x", title: null, durationSec: null });
    const r = open("/create/autoclip");
    await act(async () => fireEvent.press(await screen.findByRole("button", { name: "Generate clips" })));
    expect(await screen.findByText("This video needs 45 Clip Minutes and you have 30.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Use 5 AI credits for the rest" })).toBeOnTheScreen();
    press("Get more minutes");
    await waitFor(() => expect(r.getPathname()).toBe("/you/credits"));
  });

  it("checks a picked file against the plan's size limit", async () => {
    server.restore();
    serve(accountFixture({ tier: "free", minutes: 30 })); // Free: 250 MB
    pickDocument.mockResolvedValue(picked("talk.mp4", 300 * MB, "video/mp4"));
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Upload video/ }));
    await act(async () => fireEvent.press(screen.getByRole("radio", { name: /^Files/ })));
    expect(await screen.findByText(/over your Free plan's 250 MB limit/)).toBeOnTheScreen();
    expect(useAutoClipDraft.getState().source).toBeNull();
  });

  it("checks a gallery video's length against the plan", async () => {
    server.restore();
    serve(accountFixture({ tier: "free", minutes: 30 })); // Free: 30 min
    pickImage.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/long.mp4", fileName: "long.mp4", fileSize: 50 * MB, mimeType: "video/mp4", duration: 45 * 60 * 1000, width: 1080, height: 1920 }] });
    open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Upload video/ }));
    await act(async () => fireEvent.press(screen.getByRole("radio", { name: /^Gallery/ })));
    expect(await screen.findByText(/over your Free plan's 30 min limit/)).toBeOnTheScreen();
  });

  it("uploads a picked file, then starts the run from it", async () => {
    setUploadIO({
      readPart: async () => "file:///cache/part",
      putPart: async (_p, _u, onBytes) => (onBytes(1), { status: 200, etag: '"e1"' }),
      fileExists: () => true,
      load: async () => null,
      save: async () => {},
    });
    pickDocument.mockResolvedValue(picked("talk.mov", 3 * MB, "video/quicktime"));
    const r = open("/create/autoclip");
    fireEvent.press(await screen.findByRole("button", { name: /^Upload video/ }));
    await act(async () => fireEvent.press(screen.getByRole("radio", { name: /^Files/ })));
    expect(await screen.findByText("talk.mov")).toBeOnTheScreen();
    expect(screen.getByText("1 min / video min")).toBeOnTheScreen();
    await act(async () => press("Generate clips"));
    await waitFor(() => expect(r.getPathname()).toBe("/create/run/run_p1"));
    expect(server.to("POST", "/uploads")[0]!.body).toEqual({ name: "talk.mov", mimeType: "video/quicktime", sizeBytes: 3 * MB });
    expect(server.to("POST", "/jobs")[0]!.body).toMatchObject({ source: { kind: "asset", assetId: "ast_up" } });
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

  it("says when AutoClip can't load", async () => {
    server.restore();
    server = installFakeApi({});
    open("/create/autoclip");
    expect(await screen.findByText("Couldn’t load AutoClip")).toBeOnTheScreen();
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
