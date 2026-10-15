import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { getAssets, resetAssetMocks } from "@mocks/assets";
import { lastToolJob } from "@mocks/jobs";
import { ApiError, resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { installMockServer, MOCK_ROUTES } from "@/test/mockServer";
import { accountFixture, installFakeApi, videoAssetFixture } from "@/test/fakeApi";
import { makeWrapper } from "@/test/providers";
import { AIMediaScreen } from "../AIMediaScreen";
import { AutoClipScreen } from "../AutoClipScreen";
import { CreateHubScreen } from "../CreateHubScreen";
import { ToolScreen } from "../ToolScreen";
import { useAutoClipDraft } from "../draft";
import { setToolUploadIO } from "../toolUpload";
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
  "create/tool/[tool]": ToolScreen,
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

  it("opens the file tools on their own screen", async () => {
    const r = open("/create");
    press("Face swap, Pro");
    await waitFor(() => expect(r.getPathname()).toBe("/create/tool/face-swap"));
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
    press("See your balance");
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
  beforeEach(() => {
    jest.useRealTimers();
    resetAssetMocks();
  });

  it("opens on the tab it was asked for", async () => {
    open("/create/ai-media?tab=voiceover");
    expect(await screen.findByLabelText("Script")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Voiceover" })).toBeSelected();
  });

  it("locks models above the plan", async () => {
    setMockScenario("account", "empty"); // a Free account
    open("/create/ai-media");
    await screen.findByLabelText("10 AI credits left");
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

  it("the prompt generator rewrites the prompt", async () => {
    open("/create/ai-media");
    fireEvent.changeText(await screen.findByLabelText("Prompt"), "A lighthouse");
    press("Prompt generator");
    await waitFor(() => expect(screen.getByLabelText("Prompt").props.value).toBe("A lighthouse, golden hour light, shallow depth of field, rich colour"));
  });

  it("generates an image into the results and Assets, and stars it", async () => {
    open("/create/ai-media");
    await screen.findAllByLabelText(/^Generated image/);
    const before = screen.getAllByLabelText(/^Generated image/).length;
    fireEvent.changeText(screen.getByLabelText("Prompt"), "A lighthouse in a storm");
    press("Generate image");
    expect(await screen.findByText(/^Generating with/)).toBeOnTheScreen();
    expect(await screen.findByText("Image ready. Saved to Assets.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByLabelText(/^Generated image/).length).toBe(Math.min(6, before + 1)));
    expect(screen.getByLabelText("Generated image: A lighthouse in a storm")).toBeOnTheScreen();
    jest.useRealTimers(); // renderRouter turned fake timers on; the mock store waits on real ones
    const saved = (await getAssets()).find((a) => a.name === "A lighthouse in a storm")!;
    expect(saved).toMatchObject({ kind: "image", source: "image-generator", madeWith: "Gemini 2.5 Flash Image" });
    fireEvent.press(screen.getAllByRole("button", { name: "Add to favourites" })[0]!);
    await screen.findByRole("button", { name: "Remove from favourites" });
    // The star shows at once; the PATCH lands a moment later.
    let favorite = false;
    for (let i = 0; i < 50 && !favorite; i++) favorite = !!(await getAssets()).find((a) => a.id === saved.id)?.favorite;
    expect(favorite).toBe(true);
  });

  it("explains a failed generation, refunded", async () => {
    setMockScenario("tools", "error");
    open("/create/ai-media");
    fireEvent.changeText(await screen.findByLabelText("Prompt"), "A lighthouse in a storm");
    press("Generate image");
    expect(await screen.findByText("The model didn’t return an image. Your credits were refunded.")).toBeOnTheScreen();
  });

  it("says when there aren't enough credits", async () => {
    const restore = installMockServer({ ...MOCK_ROUTES, "POST /jobs": async () => { throw new ApiError("Insufficient credits", 402); } });
    try {
      open("/create/ai-media");
      fireEvent.changeText(await screen.findByLabelText("Prompt"), "A lighthouse in a storm");
      await screen.findByLabelText("1,171 AI credits left");
      press("Generate image");
      // Says what's short, sells nothing (docs/mobile/BILLING.md B2).
      expect(await screen.findByText("This needs 2 AI credits and you have 1171. Your plan’s credits refill each month.")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "See your credits" })).toBeOnTheScreen();
    } finally {
      restore();
    }
  });

  it("prices a voiceover by length", async () => {
    open("/create/ai-media?tab=voiceover");
    expect(await screen.findByText("1 credit")).toBeOnTheScreen();
    await act(async () => fireEvent.changeText(screen.getByLabelText("Script"), "x".repeat(501)));
    expect(screen.getByText("2 credits")).toBeOnTheScreen();
  });

  it("plays a voice's sample, then reads the script in it into Assets", async () => {
    const player = (jest.requireMock("expo-audio") as { __player: { replace: jest.Mock } }).__player;
    open("/create/ai-media?tab=voiceover");
    fireEvent.press(await screen.findByRole("button", { name: /^Voice: Brian/ }));
    fireEvent.press(screen.getByRole("radio", { name: /^Aria/ }));
    press("Play a sample of Aria");
    expect(player.replace).toHaveBeenCalledWith({ uri: "https://cdn.test/voices/aria.mp3" });
    fireEvent.changeText(screen.getByLabelText("Script"), "Nobody tells you this part.");
    press("Generate voiceover");
    expect(await screen.findByText("Voiceover ready. Saved to Assets.")).toBeOnTheScreen();
    expect(await screen.findByText("Voiceover · Aria")).toBeOnTheScreen();
    expect(screen.getByLabelText("Script").props.value).toBe("");
  });

  it("rejects audio files over 50 MB", async () => {
    pickDocument.mockResolvedValue(picked("song.wav", 60 * MB, "audio/wav"));
    open("/create/ai-media?tab=vocal");
    fireEvent.press(await screen.findByRole("button", { name: /^Choose an audio or video file/ }));
    press("From this phone");
    expect(await screen.findByText("That file is over the 50 MB limit.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Remove vocals" })).toBeDisabled();
  });

  it("uploads a file from the phone into Assets, prices it by length, then cleans it", async () => {
    setToolUploadIO({ readPart: async () => "file:///cache/part", putPart: async (_p, _u, onBytes) => (onBytes(1), { status: 200, etag: '"e1"' }), fileExists: () => true, load: async () => null, save: async () => {} });
    pickDocument.mockResolvedValue(picked("take.m4a", 2 * MB, "audio/mp4"));
    open("/create/ai-media?tab=enhance");
    fireEvent.press(await screen.findByRole("button", { name: /^Choose an audio or video file/ }));
    press("From this phone");
    // 12 s, as the phone measured it: 8 credits a minute, rounded up.
    expect(await screen.findByText("0:12 · 2 MB")).toBeOnTheScreen();
    expect(screen.getByText("2 credits")).toBeOnTheScreen();
    press("Enhance speech");
    expect(await screen.findByText("Clean audio ready. Saved to Assets.")).toBeOnTheScreen();
    jest.useRealTimers();
    const all = await getAssets();
    expect(all.find((a) => a.name === "take.m4a")).toMatchObject({ kind: "audio", durationSec: 12 });
    expect(all.find((a) => a.source === "enhance-speech")).toBeTruthy();
  });

  it("runs on a file already in Assets, and won't take one that's too long", async () => {
    open("/create/ai-media?tab=vocal");
    fireEvent.press(await screen.findByRole("button", { name: /^Choose an audio or video file/ }));
    expect(await screen.findByRole("radio", { name: "Ep. 41 — vocals removed, Longer than 5 min" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Founders Pod Ep. 42 — audio, Over 50 MB" })).toBeDisabled();
    fireEvent.press(screen.getByRole("radio", { name: /^Intro sting — neon/ }));
    expect(await screen.findByText("0:06 · 655 KB · in Assets")).toBeOnTheScreen();
    expect(screen.getByText("1 credit")).toBeOnTheScreen();
    press("Remove vocals");
    expect(await screen.findByText("Instrumental ready. Saved to Assets.")).toBeOnTheScreen();
  });
});

describe("File tools", () => {
  beforeEach(() => {
    jest.useRealTimers();
    resetAssetMocks();
  });
  const chooseFromAssets = async (name: RegExp, label = /^C/) => {
    fireEvent.press(await screen.findByRole("button", { name: label }));
    fireEvent.press(await screen.findByRole("radio", { name }));
  };

  it("background remover: a photo from the phone, uploaded to Assets, cut out for 1 credit", async () => {
    setToolUploadIO({ readPart: async () => "file:///cache/part", putPart: async (_p, _u, onBytes) => (onBytes(1), { status: 200, etag: '"e1"' }), fileExists: () => true, load: async () => null, save: async () => {} });
    pickDocument.mockResolvedValue(picked("me.png", MB, "image/png"));
    open("/create/tool/background-remover");
    fireEvent.press(await screen.findByRole("button", { name: /^Choose an image, up to 10 MB/ }));
    press("From this phone");
    expect(await screen.findByText("1 MB")).toBeOnTheScreen();
    expect(screen.getByText("1 credit")).toBeOnTheScreen();
    press("Background remover");
    expect(await screen.findByText("Background removed. Saved to Assets.")).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^Generated image: photo-no-bg-/)).toBeOnTheScreen();
    expect(lastToolJob()).toMatchObject({ type: "background-remover", assetId: expect.stringMatching(/^up/) });
  });

  it("face swap: Pro and up; puts the face onto the other photo", async () => {
    setMockScenario("account", "empty"); // a Free account
    const { unmount } = open("/create/tool/face-swap");
    expect(await screen.findByText("Face swap is on Pro and up")).toBeOnTheScreen();
    unmount();
    resetMockScenarios();
    open("/create/tool/face-swap");
    await screen.findByLabelText("1,171 AI credits left");
    await chooseFromAssets(/^Guest portrait.png/, /^Face: choose an image/);
    await chooseFromAssets(/^Summit.jpg/, /^Photo to put it on: choose an image/);
    expect(screen.getByText("2 credits")).toBeOnTheScreen();
    // Both photos chosen, but no consent yet: the button stays off.
    expect(screen.getByRole("button", { name: "Face swap" })).toBeDisabled();
    fireEvent(screen.getByRole("switch", { name: "I have permission to use both faces" }), "valueChange", true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Face swap" })).toBeEnabled());
    press("Face swap");
    expect(await screen.findByText("Face swapped. Saved to Assets.")).toBeOnTheScreen();
    expect(lastToolJob()).toMatchObject({ type: "face-swap", faceAssetId: "a6", targetAssetId: "a4", consent: true });
  });

  it("voice changer: priced by length, in the chosen voice, with its settings", async () => {
    open("/create/tool/voice-changer");
    await chooseFromAssets(/^Intro sting — neon/);
    expect(await screen.findByText("0:06 · 655 KB · in Assets")).toBeOnTheScreen();
    expect(screen.getByText("1 credit")).toBeOnTheScreen();
    fireEvent.press(await screen.findByRole("button", { name: /^Voice: Brian/ }));
    fireEvent.press(screen.getByRole("radio", { name: /^Aria/ }));
    fireEvent(screen.getByRole("switch", { name: "Remove background noise" }), "valueChange", true);
    press("Voice changer");
    expect(await screen.findByText("New voice ready. Saved to Assets.")).toBeOnTheScreen();
    expect(lastToolJob()).toMatchObject({ type: "voice-changer", assetId: "a5", voiceId: "aria", removeNoise: true, speed: 1 });
  });

  it("subtitle remover: a video from Assets, priced by its length", async () => {
    open("/create/tool/subtitle-remover");
    await chooseFromAssets(/^Intro clip.mp4/);
    expect(await screen.findByText("5 credits")).toBeOnTheScreen(); // 41 s: 1 credit per started 10 s
    press("Subtitle remover");
    expect(await screen.findByText("Captions removed. Saved to Assets.")).toBeOnTheScreen();
    expect(await screen.findByText(/^subtitle-removed-/)).toBeOnTheScreen();
  });

  it("says when a tool isn't in the app", async () => {
    open("/create/tool/youtube-downloader");
    expect(await screen.findByText("This tool isn’t in the app")).toBeOnTheScreen();
  });
});
