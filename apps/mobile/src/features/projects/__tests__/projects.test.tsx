import type { ProjectDetail } from "@clipiro/shared";
import { renderHook } from "@testing-library/react-native";
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
import { useProjectList } from "../queries";

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

/**
 * FlashList keeps a cell per item and moves it when the order changes, so the
 * tree order isn't the order on screen: sort by each cell's position.
 */
type Node = ReturnType<typeof screen.getAllByRole>[number];
function onScreenOrder(nodes: Node[]): Node[] {
  const pos = (n: Node) => {
    for (let p: Node | null = n; p; p = p.parent as Node | null) {
      const s = [p.props.style].flat(Infinity).reduce((a: Record<string, unknown>, x) => ({ ...a, ...(x ?? {}) }), {});
      if (typeof s.top === "number") return [s.top as number, (s.left as number) ?? 0];
    }
    return [0, 0];
  };
  return [...nodes].sort((a, b) => pos(a)[0]! - pos(b)[0]! || pos(a)[1]! - pos(b)[1]!);
}

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
    // Searched on the server, once typing pauses.
    fireEvent.changeText(screen.getByLabelText("Search projects"), "summit");
    expect(await screen.findByText("Results · 1")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Search projects"), "zzz");
    expect(await screen.findByText("No projects match “zzz”")).toBeOnTheScreen();
  });

  it("sorts by name", async () => {
    open("/projects");
    await screen.findByText("All projects · 14");
    press("Sort: Recent");
    fireEvent.press(screen.getByRole("radio", { name: "Name" }));
    // Sorted on the server.
    await waitFor(() => {
      const cards = onScreenOrder(screen.getAllByRole("button", { name: /\. (Ready|Draft|Rendering|Processing|Failed)\. / }));
      expect(cards[0]).toHaveProp("accessibilityLabel", expect.stringMatching(/^Behind the scenes/));
    });
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

  it("saves the picked ready clips to the gallery", async () => {
    open("/projects/videos-reels-shorts?shape=wide");
    await screen.findByText("Videos · 16:9 · 2 clips");
    press("Select all");
    press("Download 2 clips");
    expect(await screen.findByText(/^Saved \d clips? to your gallery\.$/)).toBeOnTheScreen();
    expect(MediaLibrary.Asset.create).toHaveBeenCalled();
  });

  it("deletes in one request and says which clips were still rendering", async () => {
    const server = installFakeApi({
      "GET /clips": () => [200, { clips: [clipFixture("c1", "ready"), clipFixture("c2", "rendering")], nextCursor: null, total: 2 }],
      "POST /clips/delete": () => [200, { deleted: 1, skipped: 1 }],
    });
    open("/projects/videos-reels-shorts?shape=vertical");
    await screen.findByText("Shorts & Reels · 9:16 · 2 clips");
    press("Select all");
    press("Delete 2 clips");
    await act(async () => press("Delete"));
    expect(await screen.findByText("1 clip deleted. 1 still rendering — try again when they’re done.")).toBeOnTheScreen();
    expect(server.to("POST", "/clips/delete")).toHaveLength(1);
    expect(server.to("POST", "/clips/delete")[0]!.body).toEqual({ ids: ["c1", "c2"] });
    server.restore();
  });
});

describe("Paging", () => {
  it("loads the next page from the cursor and keeps the total", async () => {
    jest.useRealTimers();
    const p = (n: number) => ({ id: `p${n}`, title: `Project ${n}`, kind: "autoclip", status: "completed", aspect: "9:16", thumbnailUrl: "", clipCount: 1, durationSec: 60, updatedAt: "2026-10-09T09:00:00.000Z" });
    const server = installFakeApi({
      "GET /projects": (_b, url) =>
        url.searchParams.get("cursor") === "p29"
          ? [200, { projects: [p(30), p(31)], nextCursor: null, total: 32 }]
          : [200, { projects: Array.from({ length: 30 }, (_, i) => p(i)), nextCursor: "p29", total: 32 }],
    });
    const { result } = renderHook(() => useProjectList({ sort: "name" }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    expect(result.current.total).toBe(32);
    await act(async () => void (await result.current.fetchNextPage()));
    expect(result.current.items).toHaveLength(32);
    expect(result.current.hasNextPage).toBe(false);
    expect(server.calls.map((c) => c.path + new URL(`http://x${c.path}`).search)).toHaveLength(2);
    server.restore();
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

function clipFixture(id: string, status: "ready" | "rendering") {
  return { id, projectId: "p1", rank: 1, title: `Clip ${id}`, score: 80, durationSec: 30, aspect: "9:16", status, thumbnailUrl: "", favorite: false, failureReason: null };
}
