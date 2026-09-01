// @vitest-environment jsdom
//
// Guards the specific bug the collapse state is shaped to avoid: reading
// localStorage during render would make the server HTML (always collapsed) and
// the first client render (possibly expanded) disagree, which React reports as
// a hydration mismatch and recovers from by throwing away the server markup.
// The preference is therefore applied in a mount effect instead — this test
// fails if anyone "simplifies" that into a lazy useState initializer.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "react";
import { QuestCard, type QuestData } from "./QuestCard";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

const data: QuestData = {
  quests: [
    { id: "join-community", title: "join-community", xp: 500, trigger: "manual", completedAt: null },
    { id: "first-clip", title: "first-clip", xp: 300, trigger: "auto", completedAt: null },
  ],
  earnedXp: 0,
  totalXp: 2800,
  remaining: 11,
  level: "Beginner",
  allComplete: false,
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

function hydrate(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  act(() => {
    hydrateRoot(container, <QuestCard questData={data} hasUser onDiscordQuest={vi.fn()} />);
  });
  return container;
}

describe("QuestCard hydration", () => {
  it("server-renders collapsed and hydrates without a mismatch", () => {
    const html = renderToString(<QuestCard questData={data} hasUser onDiscordQuest={vi.fn()} />);
    expect(html).toContain('aria-expanded="false"');

    const container = hydrate(html);

    const mismatches = errorSpy.mock.calls
      .map(c => String(c[0]))
      .filter(m => /hydrat|did not match|server (HTML|rendered)/i.test(m));
    expect(mismatches).toEqual([]);
    expect(container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("hydrates cleanly and then applies a stored expanded preference", () => {
    localStorage.setItem("clipiro:questsExpanded", "true");

    // Server has no localStorage, so it still emits the collapsed markup.
    const html = renderToString(<QuestCard questData={data} hasUser onDiscordQuest={vi.fn()} />);
    expect(html).toContain('aria-expanded="false"');

    const container = hydrate(html);

    const mismatches = errorSpy.mock.calls
      .map(c => String(c[0]))
      .filter(m => /hydrat|did not match|server (HTML|rendered)/i.test(m));
    expect(mismatches).toEqual([]);
    // The mount effect expands it after hydration, not during render.
    expect(container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")).toBe("true");
  });
});
