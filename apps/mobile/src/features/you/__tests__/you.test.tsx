import * as DocumentPicker from "expo-document-picker";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Linking } from "react-native";
import { resetAccountMocks } from "@mocks/account";
import { resetMockScenarios, setMockDelay, setMockScenario } from "@mocks/core";
import { useSession } from "@/state/session";
import { makeWrapper } from "@/test/providers";
import { BrandKitScreen } from "../BrandKitScreen";
import { CreditsScreen, SubscriptionScreen } from "../BillingScreens";
import { NotificationsScreen } from "../NotificationsScreen";
import { ProfileScreen } from "../ProfileScreen";
import { SettingsScreen } from "../SettingsScreen";
import { HelpScreen, LegalScreen } from "../SupportScreens";
import { VoicesScreen } from "../VoicesScreen";

jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock;

/** The You tab's screens plus stubs for where they link to. */
const routes = {
  "you/index": ProfileScreen,
  "you/my-voices": VoicesScreen,
  "you/brand-kit": BrandKitScreen,
  "you/credits": CreditsScreen,
  "you/subscription": SubscriptionScreen,
  "you/notifications": NotificationsScreen,
  "you/settings": SettingsScreen,
  "you/help-support": HelpScreen,
  "you/legal": LegalScreen,
  "create/ai-media": () => null,
  "projects/assets/index": () => null,
  "projects/[id]": () => null,
  "social/index": () => null,
  "social/scheduled-posts": () => null,
  "social/insights/index": () => null,
};
const open = (url: string) => renderRouter(routes, { initialUrl: url, wrapper: makeWrapper() });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
let openURL: jest.SpyInstance;

beforeEach(() => {
  setMockDelay(0);
  resetMockScenarios();
  resetAccountMocks();
  pickDocument.mockReset();
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  useSession.setState({ signedIn: true });
});
afterEach(() => openURL.mockRestore());

describe("You", () => {
  it("shows plan, level and balances, and links to the rest of the tab", async () => {
    const r = open("/you");
    expect(await screen.findByText("Maya Okafor")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Plan: Studio, Yearly. Manage" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Level Pro Creator, 1,450 of 2,600 XP")).toBeOnTheScreen();
    expect(screen.getByLabelText("1,171 ai credits")).toBeOnTheScreen();
    press(/^Notifications, 2 unread/);
    await waitFor(() => expect(r.getPathname()).toBe("/you/notifications"));
  });

  it("renames the account", async () => {
    open("/you");
    fireEvent.press(await screen.findByRole("button", { name: "Edit name" }));
    fireEvent.changeText(screen.getByLabelText("Name"), "Maya O.");
    press("Save");
    expect(await screen.findByText("Maya O.")).toBeOnTheScreen();
  });

  it("logs out after confirming", async () => {
    open("/you");
    fireEvent.press(await screen.findByRole("button", { name: "Log out" }));
    expect(screen.getByText("Log out?")).toBeOnTheScreen();
    fireEvent.press(screen.getAllByRole("button", { name: "Log out" }).at(-1)!);
    expect(useSession.getState().signedIn).toBe(false);
  });

  it("says when the account can't load", async () => {
    setMockScenario("account", "error");
    open("/you");
    expect(await screen.findByText("Couldn’t load your account")).toBeOnTheScreen();
  });
});

describe("My Voices", () => {
  it("lists the real catalogue and opens voiceover with the chosen voice", async () => {
    const r = open("/you/my-voices");
    expect(await screen.findByText("Voice library · 22 narrators")).toBeOnTheScreen();
    press("Use George");
    await waitFor(() => expect(r.getPathname()).toBe("/create/ai-media"));
    expect(r.getSearchParams()).toEqual({ tab: "voiceover", voice: "george" });
  });

  it("clones an uploaded sample only with consent, up to the cap", async () => {
    pickDocument.mockResolvedValue({ canceled: false, assets: [{ name: "me.m4a", uri: "file:///me.m4a" }] });
    open("/you/my-voices");
    expect(await screen.findByText("1 of 3 cloned voices")).toBeOnTheScreen();
    for (const name of ["Calm", "Hype"]) {
      await act(async () => press("Upload"));
      fireEvent.changeText(await screen.findByLabelText("Voice name"), name);
      expect(screen.getByRole("button", { name: "Clone voice" })).toBeDisabled();
      fireEvent.press(screen.getByRole("checkbox", { name: /permission to clone it/ }));
      press("Clone voice");
      expect(await screen.findByText(name)).toBeOnTheScreen();
    }
    expect(await screen.findByText(/used all 3 voice slots/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("renames and deletes a cloned voice", async () => {
    open("/you/my-voices");
    fireEvent.press(await screen.findByRole("button", { name: "Rename Maya — natural" }));
    fireEvent.changeText(screen.getByLabelText("Voice name"), "Maya — warm");
    press("Save");
    expect(await screen.findByText("Maya — warm")).toBeOnTheScreen();
    press("Rename Maya — warm");
    press("Delete voice");
    press("Delete");
    expect(await screen.findByText("0 of 3 cloned voices")).toBeOnTheScreen();
  });
});

describe("Brand Kit", () => {
  it("refuses a colour that isn't hex, then saves one", async () => {
    open("/you/brand-kit");
    fireEvent.press(await screen.findByRole("button", { name: /^Highlight colour #20d68a/ }));
    fireEvent.changeText(screen.getByLabelText("Hex"), "green");
    press("Save colour");
    expect(screen.getByText("Use a hex colour like #20d68a")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("radio", { name: "#facc15" }));
    press("Save colour");
    expect(await screen.findByRole("button", { name: /^Highlight colour #facc15/ })).toBeOnTheScreen();
  });

  it("marks watermark and intro/outro as coming soon, and offers to create a kit", async () => {
    open("/you/brand-kit");
    expect(await screen.findAllByText("Coming soon")).toHaveLength(2);
    setMockScenario("brandKit", "empty");
    open("/you/brand-kit");
    expect(await screen.findByText("No brand kit yet")).toBeOnTheScreen();
  });
});

describe("Credits and Subscription", () => {
  it("lists the web's packs and recent activity", async () => {
    open("/you/credits");
    expect(await screen.findByLabelText("Studio pack, 640 credits, $101.99, best value")).toBeOnTheScreen();
    expect(screen.getByLabelText("100 minutes, $11.99")).toBeOnTheScreen();
    expect(await screen.findByLabelText(/^AutoClip · Ep. 42, .+, minus 59 minutes$/)).toBeOnTheScreen();
    expect(screen.getByText(/coming soon/)).toBeOnTheScreen();
  });

  it("prices yearly per month and cancels at the end of the period", async () => {
    open("/you/subscription");
    expect(await screen.findByLabelText(/^Studio, current plan\. \$39\.50 a month/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByLabelText(/^Studio, current plan\. \$59 a month/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Pro, most popular\. \$29 a month/)).toBeOnTheScreen();
    press("Cancel subscription");
    fireEvent.press(screen.getAllByRole("button", { name: "Cancel subscription" }).at(-1)!);
    expect(await screen.findByText("Ends on Mar 14, 2027 · then you move to Free")).toBeOnTheScreen();
    press("Keep my plan");
    expect(await screen.findByText("Renews on Mar 14, 2027")).toBeOnTheScreen();
  });
});

describe("Notifications", () => {
  it("filters, marks all read and opens a notification", async () => {
    const r = open("/you/notifications");
    expect(await screen.findByText("12 clips are ready")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Social" }));
    expect(screen.queryByText("12 clips are ready")).toBeNull();
    expect(screen.getByText("Posted to YouTube Shorts")).toBeOnTheScreen();
    press("Mark all read");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull());
    press(/^Posted to YouTube Shorts/);
    await waitFor(() => expect(r.getPathname()).toBe("/social/scheduled-posts"));
  });
});

describe("Settings", () => {
  it("saves a toggle and a language", async () => {
    open("/you/settings");
    const toggle = await screen.findByRole("switch", { name: "Product news" });
    fireEvent(toggle, "valueChange", true);
    press("Language");
    fireEvent.press(screen.getByRole("radio", { name: "Español" }));
    expect(await screen.findByText("Español")).toBeOnTheScreen();
    expect(screen.getByRole("switch", { name: "Product news" })).toBeChecked();
  });

  it("opens security pages on the web", async () => {
    open("/you/settings");
    fireEvent.press(await screen.findByRole("button", { name: "API keys, opens clipiro.com" }));
    expect(openURL).toHaveBeenCalledWith("https://clipiro.com/dashboard?settings=api-keys");
  });

  it("deletes the account only with the right password", async () => {
    open("/you/settings");
    fireEvent.press(await screen.findByRole("button", { name: "Delete account" }));
    fireEvent.changeText(screen.getByLabelText("Password"), "wrong-password");
    fireEvent.press(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);
    expect(await screen.findByText("That password is incorrect")).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText("Password"), "clipiro2026");
    fireEvent.press(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);
    await waitFor(() => expect(useSession.getState().signedIn).toBe(false));
  });
});

describe("Help and Legal", () => {
  it("filters questions by topic and search", async () => {
    open("/you/help-support");
    expect(screen.getByText(/Credits pay for AI tools/)).toBeOnTheScreen();
    press("Billing questions");
    expect(screen.queryByRole("button", { name: "What is a credit?" })).toBeNull();
    press("Do you offer refunds?");
    expect(screen.getByText(/within 3 days of a purchase/)).toBeOnTheScreen();
    press("Billing questions");
    fireEvent.changeText(screen.getByLabelText("Search help articles"), "commercial");
    expect(screen.getByRole("button", { name: "Can I use clips commercially?" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Can I cancel anytime?" })).toBeNull();
  });

  it("opens policies on clipiro.com", async () => {
    open("/you/legal");
    press(/^Refund Policy/);
    expect(openURL).toHaveBeenCalledWith("https://clipiro.com/refund");
  });
});
