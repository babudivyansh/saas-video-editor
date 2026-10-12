import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { resetAnalyticsMocks } from "@mocks/analytics";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { makeWrapper } from "@/test/providers";
import { AnalyticsOverviewScreen, AudienceScreen, CompetitorsScreen } from "../analytics";
import { ReportsScreen } from "../ReportsScreen";

const routes = {
  "social/insights/account-analytics/index": AnalyticsOverviewScreen,
  "social/insights/account-analytics/audience": AudienceScreen,
  "social/insights/account-analytics/competitors": CompetitorsScreen,
  "social/insights/account-analytics/reports": ReportsScreen,
  "social/insights/content-performance": () => null,
  "social/insights/platform-analytics": () => null,
  "social/index": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetAnalyticsMocks();
});

describe("Analytics overview", () => {
  it("shows accounts with their health and generates the weekly summary", async () => {
    open("/social/insights/account-analytics");
    expect(await screen.findByRole("button", { name: "Instagram, 5.6k followers, needs reconnecting" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "YouTube, 12.4k followers, healthy" })).toBeOnTheScreen();
    press("Generate · 5 cr");
    expect(await screen.findByText(/Views rose 18%/)).toBeOnTheScreen();
  });

  it("says no credits were charged when the summary fails", async () => {
    open("/social/insights/account-analytics");
    await screen.findByText("Weekly summary");
    setMockScenario("summary", "error");
    press("Generate · 5 cr");
    expect(await screen.findByText(/No credits were charged/)).toBeOnTheScreen();
  });

  it("asks to connect an account when none is linked", async () => {
    setMockScenario("social", "empty");
    open("/social/insights/account-analytics");
    expect(await screen.findByText("Connect an account first")).toBeOnTheScreen();
  });
});

describe("Audience", () => {
  it("shows the gender split, age and the best time online", async () => {
    open("/social/insights/account-analytics/audience");
    expect(await screen.findByLabelText("Women 58%, men 40%, other 2%")).toBeOnTheScreen();
    expect(screen.getByText(/^Best: Mon 8 PM/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "YouTube" }));
    expect(await screen.findByLabelText("Women 47%, men 52%, other 1%")).toBeOnTheScreen();
  });
});

describe("Competitors", () => {
  it("compares you with tracked accounts", async () => {
    open("/social/insights/account-analytics/competitors");
    expect(await screen.findByLabelText("You @maya.okafor: 5.6k followers, 6.8% engagement, 4.2 posts a week")).toBeOnTheScreen();
    expect(screen.getByText("Tracked · 2 of 3")).toBeOnTheScreen();
    expect(screen.getByText(/Build Pod leads on engagement at 7\.4%/)).toBeOnTheScreen();
  });

  it("rejects a duplicate, adds a new handle, then hides Add at the cap", async () => {
    open("/social/insights/account-analytics/competitors");
    fireEvent.press(await screen.findByRole("button", { name: "Add competitor" }));
    fireEvent.changeText(screen.getByLabelText("Public handle"), "@riatalks");
    press("Start tracking");
    expect(await screen.findByText("You already track that account.")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Public handle"), "creatorlab");
    press("Start tracking");
    expect(await screen.findByText("Tracked · 3 of 3")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Add competitor" })).toBeNull();
  });

  it("stops tracking after confirming", async () => {
    open("/social/insights/account-analytics/competitors");
    fireEvent.press(await screen.findByRole("button", { name: "Stop tracking Build Pod" }));
    press("Stop tracking");
    expect(await screen.findByText("Tracked · 1 of 3")).toBeOnTheScreen();
  });
});

describe("Reports", () => {
  it("validates and creates a scheduled report", async () => {
    open("/social/insights/account-analytics/reports");
    fireEvent.press(await screen.findByRole("button", { name: "New report" }));
    press("Generate report");
    expect(await screen.findByText("Name the report")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Name"), "Sponsor recap");
    fireEvent.press(screen.getByRole("tab", { name: "Monthly" }));
    press("Save and schedule");
    expect(await screen.findByText(/emailed monthly/)).toBeOnTheScreen();
    expect(screen.getAllByText("Sponsor recap").length).toBeGreaterThan(0);
  });

  it("creates a share link and revokes it", async () => {
    open("/social/insights/account-analytics/reports");
    await screen.findByText("Sponsor view · all accounts");
    fireEvent.press(screen.getByRole("link", { name: "New link" }));
    fireEvent.changeText(screen.getByLabelText("Name"), "Agency view");
    press("Create link");
    expect(await screen.findByText("Agency view")).toBeOnTheScreen();
    press("Revoke Agency view");
    press("Revoke link");
    await waitFor(() => expect(screen.queryByText("Agency view")).toBeNull());
  });
});
