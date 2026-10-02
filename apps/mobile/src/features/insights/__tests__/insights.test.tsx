import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { makeWrapper } from "@/test/providers";
import { useRange } from "../queries";
import { ContentScreen, InsightsOverviewScreen, PlatformsScreen } from "../screens";

const routes = {
  "social/insights/index": InsightsOverviewScreen,
  "social/insights/content-performance": ContentScreen,
  "social/insights/platform-analytics": PlatformsScreen,
  "social/insights/account-analytics/index": () => null,
  "social/index": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  useRange.setState({ range: 30 });
});

describe("Insights", () => {
  it("shows the period's totals and changes the period", async () => {
    open("/social/insights");
    expect(await screen.findByLabelText("Total views: 412k, up 18%")).toBeOnTheScreen();
    press("Period: last 30 days. Change");
    fireEvent.press(screen.getByRole("radio", { name: "Last 7 days" }));
    expect(await screen.findByLabelText("Total views: 96.1k, up 18%")).toBeOnTheScreen();
    expect(useRange.getState().range).toBe(7);
  });

  it("asks to connect an account when none is linked", async () => {
    setMockScenario("social", "empty");
    const r = open("/social/insights");
    expect(await screen.findByText("Connect an account to see insights")).toBeOnTheScreen();
    press("Connect an account");
    await waitFor(() => expect(r.getPathname()).toBe("/social"));
  });

  it("offers a retry when insights fail", async () => {
    setMockScenario("insights", "error");
    open("/social/insights");
    expect(await screen.findByText("Couldn’t load insights")).toBeOnTheScreen();
  });

  it("switches tabs in place", async () => {
    const r = open("/social/insights");
    await screen.findByLabelText(/^Total views/);
    fireEvent.press(screen.getByRole("tab", { name: "Content" }));
    await waitFor(() => expect(r.getPathname()).toBe("/social/insights/content-performance"));
  });
});

describe("Content", () => {
  it("ranks posts by the chosen metric", async () => {
    open("/social/insights/content-performance");
    await screen.findByLabelText("Best time: 6 PM");
    const first = () => screen.getAllByLabelText(/^\d\. /)[0];
    expect(first()).toHaveProp("accessibilityLabel", expect.stringMatching(/^1\. Nobody tells you this part/));
    fireEvent.press(screen.getByRole("button", { name: "Comments" }));
    expect(first()).toHaveProp("accessibilityLabel", expect.stringMatching(/^1\. Nobody tells you this part/));
    // The most-shared post is fourth by views.
    fireEvent.press(screen.getByRole("button", { name: "Shares" }));
    expect(first()).toHaveProp("accessibilityLabel", expect.stringMatching(/^1\. One more rep/));
  });

  it("exports a CSV", async () => {
    open("/social/insights/content-performance");
    await screen.findByLabelText("Best time: 6 PM");
    fireEvent.press(screen.getByRole("link", { name: "Export CSV" }));
    expect(await screen.findByText(/\.csv saved/)).toBeOnTheScreen();
  });
});

describe("Platforms", () => {
  it("switches platform and flags an account that needs reconnecting", async () => {
    open("/social/insights/platform-analytics");
    expect(await screen.findByLabelText("Followers: 12.4k, up 5.4%")).toBeOnTheScreen();
    expect(screen.queryByText(/needs reconnecting/)).toBeNull();
    fireEvent.press(screen.getByRole("radio", { name: "Instagram" }));
    expect(await screen.findByLabelText("Followers: 5.6k, up 3.3%")).toBeOnTheScreen();
    expect(screen.getByText(/Instagram needs reconnecting/)).toBeOnTheScreen();
  });

  it("shows audience age and top countries", async () => {
    open("/social/insights/platform-analytics");
    expect(await screen.findByLabelText("18–24: 38%")).toBeOnTheScreen();
    expect(screen.getByLabelText("India: 41%")).toBeOnTheScreen();
  });
});
