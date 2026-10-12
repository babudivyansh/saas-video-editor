/// <reference types="node" />
// States audit (mobile Phase 14): every signed-in screen, opened in the real
// route tree,
//  - offline (every request fails to connect): it must not crash, and once
//    the retries are done it must say something (an error, "Try again"), not
//    sit on a skeleton or a blank;
//  - with an empty account: it must not crash, and must show its empty state.
// Screens with nothing to load (Settings' static rows, Legal…) pass by
// rendering at all.
import path from "node:path";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { resetMockScenarios, setMockDelay, setMockScenario, type MockScenario } from "@mocks/core";
import { SCREENS, SCREEN_IDS } from "@/navigation/screens";
import { useSession } from "@/state/session";
import { installMockServer } from "../mockServer";

const APP = path.join(__dirname, "../../app");
const SIGNED_OUT = new Set(["Main", "E-Welcome", "E-Generate", "E-Create", "E-Grow", "E-Login", "E-Signup", "E-OTP", "E-Forgot"]);
const SCREENS_IN = SCREEN_IDS.filter((id) => !SIGNED_OUT.has(id));
/**
 * Screens that load nothing as opened here, so there's no failure to report:
 * static pages, the Create hub (its tiles work offline; only the balance
 * pill waits), and the editor panels opened with no project (they say "Add
 * media"; an edit is opened with ?projectId, covered in editor.test.tsx).
 */
const NOTHING_TO_LOAD = new Set(["BN-Help", "BN-Legal", "BN-CreateHub", "BN-Editor", "BN-EdMedia", "BN-EdCaptions", "BN-EdAudio", "BN-EdText", "BN-EdEffects", "BN-EdAI", "BN-EdExport"]);
/** Every mock data area (core.ts scenarios), for the empty account. */
const AREAS = ["home", "tools", "assistant", "projects", "project", "clips", "assets", "folders", "account", "activity", "voices", "brandKit", "notifications", "settings", "posts", "insights", "analytics", "competitors", "reports", "summary", "accounts", "audience", "content", "platform", "subscription"];

/** Lets retries and their back-off run (fake timers: renderRouter turns them on). */
async function settle() {
  for (let i = 0; i < 12; i++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
}

const text = () => {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === "string") out.push(n);
    else if (n && typeof n === "object" && "children" in n) for (const c of (n as { children: unknown[] }).children) walk(c);
  };
  walk(screen.UNSAFE_root);
  return out.join(" ");
};

describe("states audit", () => {
  beforeEach(() => {
    setMockDelay(0);
    resetMockScenarios();
  });

  it("says something useful offline on every screen", async () => {
    const report: string[] = [];
    const offline = installMockServer({}); // no routes…
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("Network request failed"); // …and no connection
    }) as typeof fetch;
    try {
      for (const id of SCREENS_IN) {
        useSession.setState({ ready: true, signedIn: true });
        let r: ReturnType<typeof renderRouter> | null = null;
        try {
          r = renderRouter(APP, { initialUrl: SCREENS[id].href });
          await settle();
          const t = text();
          const said = /connection|couldn’t|couldn't|try again|offline|went wrong/i.test(t);
          if (!said && !NOTHING_TO_LOAD.has(id)) report.push(`${id} ${SCREENS[id].href}: nothing about the failure (${t.replace(/\s+/g, " ").slice(0, 80)}…)`);
        } catch (e) {
          report.push(`${id} ${SCREENS[id].href}: crashed: ${(e as Error).message.slice(0, 120)}`);
        } finally {
          r?.unmount();
        }
      }
    } finally {
      globalThis.fetch = realFetch;
      offline();
    }
    if (process.env.STATES_REPORT) console.log(report.join("\n"));
    expect(report).toEqual([]);
  }, 600000);

  it("renders an empty account on every screen without crashing", async () => {
    for (const a of AREAS) setMockScenario(a, "empty" as MockScenario);
    const report: string[] = [];
    for (const id of SCREENS_IN) {
      useSession.setState({ ready: true, signedIn: true });
      let r: ReturnType<typeof renderRouter> | null = null;
      try {
        r = renderRouter(APP, { initialUrl: SCREENS[id].href });
        await settle();
        if (!text().trim()) report.push(`${id}: blank`);
      } catch (e) {
        report.push(`${id} ${SCREENS[id].href}: crashed: ${(e as Error).message.slice(0, 120)}`);
      } finally {
        r?.unmount();
      }
    }
    if (process.env.STATES_REPORT) console.log(report.join("\n"));
    expect(report).toEqual([]);
  }, 600000);
});
