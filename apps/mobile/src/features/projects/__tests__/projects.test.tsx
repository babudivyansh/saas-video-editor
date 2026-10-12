import type { ProjectDetail } from "@clipiro/shared";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { getProject, resetProjectMocks } from "@mocks/projects";
import { installFakeApi } from "@/test/fakeApi";
import { makeWrapper } from "@/test/providers";
import { ClipsScreen } from "../ClipsScreen";
import { DraftsScreen } from "../DraftsScreen";
import { ProjectScreen } from "../ProjectScreen";
import { ProjectsScreen } from "../ProjectsScreen";

const routes = {
  "projects/index": ProjectsScreen,
  "projects/drafts": DraftsScreen,
  "projects/videos-reels-shorts": ClipsScreen,
  "projects/[projectId]": ProjectScreen,
  "projects/assets/index": () => null,
  editor: () => null,
  composer: () => null,
  "create/autoclip": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetProjectMocks();
});

describe("All projects", () => {
  it("lists projects with the latest draft to continue", async () => {
    open("/projects");
    expect(await screen.findByText("All projects · 14")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Continue editing Leg day vlog, 60% done/ })).toBeOnTheScreen();
  });

  it("searches by name", async () => {
    open("/projects");
    await screen.findByText("All projects · 14");
    press("Search projects");
    fireEvent.changeText(screen.getByLabelText("Search projects"), "summit");
    expect(screen.getByText("Results · 1")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Search projects"), "zzz");
    expect(screen.getByText("No projects match “zzz”")).toBeOnTheScreen();
  });

  it("sorts by name", async () => {
    open("/projects");
    await screen.findByText("All projects · 14");
    press("Sort: Recent");
    fireEvent.press(screen.getByRole("radio", { name: "Name" }));
    const cards = screen.getAllByRole("button", { name: /\. (Ready|Draft|Rendering|Processing|Failed)\. / });
    expect(cards[0]).toHaveProp("accessibilityLabel", expect.stringMatching(/^Behind the scenes/));
  });

  it("drafts resume in the editor; finished projects open their clips", async () => {
    const r = open("/projects");
    fireEvent.press(await screen.findByRole("button", { name: /^Founders Pod · Ep\. 42\. Ready/ }));
    await waitFor(() => expect(r.getPathname()).toBe("/projects/founders-pod-ep-42"));
  });

  it("renames and deletes from the long-press menu", async () => {
    open("/projects");
    fireEvent(await screen.findByRole("button", { name: /^Summit sunrise\. Ready/ }), "longPress");
    press("Rename");
    fireEvent.changeText(screen.getByLabelText("Name"), "Summit at dawn");
    press("Save");
    expect(await screen.findByText("Summit at dawn")).toBeOnTheScreen();
    fireEvent(screen.getByRole("button", { name: /^Summit at dawn\. Ready/ }), "longPress");
    press("Delete");
    press("Delete project");
    expect(await screen.findByText("All projects · 13")).toBeOnTheScreen();
    expect(screen.queryByText("Summit at dawn")).toBeNull();
  });

  it("guides a new account and recovers from errors", async () => {
    setMockScenario("projects", "empty");
    const { unmount } = open("/projects");
    expect(await screen.findByText("No projects yet")).toBeOnTheScreen();
    unmount();
    setMockScenario("projects", "error");
    open("/projects");
    expect(await screen.findByText("Couldn’t load your projects")).toBeOnTheScreen();
  });
});

describe("Drafts", () => {
  it("shows each draft's checklist progress", async () => {
    open("/projects/drafts");
    expect(await screen.findByRole("button", { name: /^Hiring your first 10, 80% done/ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Launch teaser, 20% done/ })).toBeOnTheScreen();
  });

  it("deletes the selected drafts after confirming", async () => {
    open("/projects/drafts");
    await screen.findByText("4 drafts");
    press("Select");
    fireEvent.press(screen.getByRole("checkbox", { name: /^Guest intro/ }));
    fireEvent.press(screen.getByRole("checkbox", { name: /^Launch teaser/ }));
    press("Delete 2");
    press("Delete");
    expect(await screen.findByText("2 drafts")).toBeOnTheScreen();
  });
});

describe("Clip views", () => {
  it("groups clips by shape", async () => {
    const { unmount } = open("/projects/videos-reels-shorts?shape=vertical");
    expect(await screen.findByText("Shorts & Reels · 9:16 · 14 clips")).toBeOnTheScreen();
    unmount();
    open("/projects/videos-reels-shorts?shape=wide");
    expect(await screen.findByText("Videos · 16:9 · 2 clips")).toBeOnTheScreen();
  });

  it("selects all and deletes after confirming", async () => {
    open("/projects/videos-reels-shorts?shape=square");
    await screen.findByText("Square · 1:1 · 2 clips");
    press("Select all");
    expect(screen.getByText("2 selected")).toBeOnTheScreen();
    press("Delete 2 clips");
    press("Delete");
    expect(await screen.findByText("No square clips yet")).toBeOnTheScreen();
  });
});

describe("Project detail", () => {
  // The detail screen draws a gradient per clip; with the sheet open that is slow under Jest.
  jest.setTimeout(30000);

  // The real API client over a fake server that answers from the mock fixtures.
  let server: ReturnType<typeof installFakeApi>;
  let detail: ProjectDetail;
  const clipOf = (url: URL) => detail.clips.find((c) => url.pathname.includes(c.id));
  beforeEach(async () => {
    jest.useRealTimers(); // the fixture fetcher waits on a timer
    detail = await getProject("founders-pod-ep-42");
    server = installFakeApi({
      "GET /projects/:id": (_b, url) => (url.pathname.endsWith("/founders-pod-ep-42") ? [200, detail] : [404, { error: "Project not found" }]),
      "GET /clips/:id": (_b, url) => {
        const c = clipOf(url)!;
        return [200, { ...c, projectTitle: detail.title, startSec: 0, endSec: c.durationSec, videoUrl: c.status === "ready" ? "https://cdn.test/clip.mp4" : null, breakdown: null, reasoning: "Strong hook in the first second.", hookExplanation: null }];
      },
      "PATCH /clips/:id": (b, url) => [200, { ...clipOf(url)!, ...b, projectTitle: "", startSec: 0, endSec: 1, videoUrl: null, breakdown: null, reasoning: null, hookExplanation: null }],
      "POST /clips/:id/retry": (_b, url) => [200, { ...clipOf(url)!, status: "rendering", failureReason: null, projectTitle: "", startSec: 0, endSec: 1, videoUrl: null, breakdown: null, reasoning: null, hookExplanation: null }],
      "GET /clips/:id/download": (_b, url) => [200, { url: `https://cdn.test/${url.pathname.split("/")[2]}.mp4`, fileName: "clip.mp4", expiresAt: "2026-10-09T10:00:00.000Z" }],
    });
  });
  afterEach(() => server.restore());

  it("shows the top clip, counts and score spread, ranked by score", async () => {
    open("/projects/founders-pod-ep-42");
    expect(await screen.findByRole("button", { name: /^Top clip: Nobody tells you this part, score 92/ })).toBeOnTheScreen();
    expect(screen.getByText("10 ready · 1 rendering · 1 failed")).toBeOnTheScreen();
    expect(screen.getByLabelText("Score spread: 90+ 1, 80s 4, 70s 3, 60s 3, <60 1")).toBeOnTheScreen();
    const scores = screen.getAllByRole("button", { name: /, score \d+,/ }).map((b) => Number(/score (\d+)/.exec(b.props.accessibilityLabel)![1]));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("plays a ready clip and stars it at once", async () => {
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    fireEvent.press(screen.getByRole("button", { name: /^The exact cold-email script/ }));
    expect(await screen.findByTestId("video-view")).toBeOnTheScreen();
    expect(screen.getByText("Strong hook in the first second.")).toBeOnTheScreen();
    await act(async () => press("Star"));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /starred$/ })).toHaveLength(2));
    expect(server.to("PATCH", `/clips/${detail.clips.find((c) => c.title.startsWith("The exact cold-email script"))!.id}`)[0]!.body).toEqual({ favorite: true });
  });

  it("puts the star back if the server says no", async () => {
    server.restore();
    server = installFakeApi({
      "GET /projects/:id": () => [200, detail],
      "GET /clips/:id": () => [404, { error: "Clip not found" }],
      "PATCH /clips/:id": () => [500, { error: "Something went wrong on our side. Try again." }],
    });
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    fireEvent.press(screen.getByRole("button", { name: /^The exact cold-email script/ }));
    await act(async () => press("Star"));
    expect(await screen.findByText("Something went wrong on our side. Try again.")).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByRole("button", { name: /starred$/ })).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: /starred$/ })).toHaveLength(1);
  });

  it("saves a clip to the gallery and shares one", async () => {
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    fireEvent.press(screen.getByRole("button", { name: /^The exact cold-email script/ }));
    await act(async () => press("Download"));
    expect(await screen.findByText("Saved to your gallery.")).toBeOnTheScreen();
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ["video"]);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith(expect.stringMatching(/clip-.*\.mp4$/));
    expect(MediaLibrary.Album.create).toHaveBeenCalledWith("Clipiro", expect.any(Array), true);
    await act(async () => press("Share"));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(expect.stringMatching(/\.mp4$/), expect.objectContaining({ mimeType: "video/mp4" }));
  });

  it("explains a refused gallery permission", async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: "denied" });
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    await act(async () => press(/^Saving|^Download all ready/));
    expect(await screen.findByText(/Allow it under Photos and videos/)).toBeOnTheScreen();
  });

  it("downloads every ready clip, counting as it goes", async () => {
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    await act(async () => press("Download all ready"));
    expect(await screen.findByText("Saved 10 clips to your gallery.")).toBeOnTheScreen();
    expect(server.calls.filter((c) => c.path.endsWith("/download"))).toHaveLength(10);
  });

  it("a failed clip explains why and can retry", async () => {
    open("/projects/founders-pod-ep-42");
    fireEvent.press(await screen.findByRole("button", { name: /^The pricing mistake, score 61, failed/ }));
    expect(screen.getByText(/ran out of time/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    await act(async () => press("Retry render"));
    expect(await screen.findByText("Rendering again.")).toBeOnTheScreen();
    expect(screen.getByText("10 ready · 2 rendering")).toBeOnTheScreen();
  });

  it("handles a deleted project", async () => {
    open("/projects/nope");
    expect(await screen.findByText("Project not found")).toBeOnTheScreen();
  });
});
