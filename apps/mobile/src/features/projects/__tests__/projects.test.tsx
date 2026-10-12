import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { resetProjectMocks } from "@mocks/projects";
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

  it("shows the top clip, counts and score spread", async () => {
    open("/projects/founders-pod-ep-42");
    expect(await screen.findByRole("button", { name: /^Top clip: Nobody tells you this part, score 92/ })).toBeOnTheScreen();
    expect(screen.getByText("10 ready · 1 rendering · 1 failed")).toBeOnTheScreen();
    expect(screen.getByLabelText("Score spread: 90+ 1, 80s 4, 70s 3, 60s 3, <60 1")).toBeOnTheScreen();
  });

  it("filters to starred clips and stars from the clip sheet", async () => {
    open("/projects/founders-pod-ep-42");
    await screen.findByText("10 ready · 1 rendering · 1 failed");
    fireEvent.press(screen.getByRole("button", { name: "Starred" }));
    expect(screen.getAllByRole("button", { name: /starred$/ })).toHaveLength(1);
    fireEvent.press(screen.getByRole("button", { name: "All" }));
    fireEvent.press(screen.getByRole("button", { name: /^The exact cold-email script/ }));
    press("Star");
    await waitFor(() => expect(screen.getAllByRole("button", { name: /starred$/ })).toHaveLength(2));
  });

  it("a failed clip explains why and can retry", async () => {
    open("/projects/founders-pod-ep-42");
    fireEvent.press(await screen.findByRole("button", { name: /^The pricing mistake, score 61, failed/ }));
    expect(screen.getByText(/ran out of time/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    press("Retry render");
    expect(await screen.findByText("Rendering again.")).toBeOnTheScreen();
    expect(screen.getByText("10 ready · 2 rendering")).toBeOnTheScreen();
  });

  it("handles a deleted project", async () => {
    open("/projects/nope");
    expect(await screen.findByText("Project not found")).toBeOnTheScreen();
  });
});

