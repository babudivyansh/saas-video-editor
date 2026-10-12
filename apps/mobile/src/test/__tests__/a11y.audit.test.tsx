/// <reference types="node" />
// Accessibility audit (mobile Phase 14): opens every screen in the real route
// tree with the mock data and checks every control a screen reader reaches:
//  - anything pressable has a role (button, link, tab, checkbox…),
//  - every control has a name TalkBack can read (its label, or its text),
//  - nothing pressable is smaller than 44×44 by its own style, unless hitSlop
//    makes up the difference.
// Layout isn't measured under Jest, so sizes come from the styles: a control
// with no fixed size is taken to size to its content (checked on a device).
import path from "node:path";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { setMockDelay } from "@mocks/core";
import { SCREENS, SCREEN_IDS } from "@/navigation/screens";
import { useSession } from "@/state/session";

const APP = path.join(__dirname, "../../app");
const MIN = 44;
const ROLES = new Set(["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "togglebutton", "adjustable", "search", "combobox", "imagebutton"]);

type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[] };

const textOf = (n: Node | string): string => (typeof n === "string" ? n : n.children.map(textOf).join(" "));

function nameOf(n: Node): string {
  const label = (n.props.accessibilityLabel ?? n.props["aria-label"]) as string | undefined;
  return (label ?? textOf(n)).replace(/\s+/g, " ").trim();
}

function sizeProblem(n: Node): string | null {
  const s = StyleSheet.flatten(n.props.style as never) as Record<string, unknown> | undefined;
  if (!s) return null;
  const slop = n.props.hitSlop as number | { top?: number; bottom?: number; left?: number; right?: number } | undefined;
  const extra = (a: "top" | "bottom" | "left" | "right") => (typeof slop === "number" ? slop : (slop?.[a] ?? 0));
  const h = (s.minHeight ?? s.height) as number | undefined;
  const w = (s.minWidth ?? s.width) as number | undefined;
  const effH = typeof h === "number" ? h + extra("top") + extra("bottom") : null;
  const effW = typeof w === "number" ? w + extra("left") + extra("right") : null;
  if (effH != null && effH < MIN) return `height ${effH}`;
  if (effW != null && effW < MIN && effH != null) return `width ${effW}`;
  return null;
}

/** Host views that respond to touch (what Pressable / Touchable render). */
const pressable = (n: Node) => typeof n.type === "string" && typeof n.props.onClick === "function";

function audit(): string[] {
  const out: string[] = [];
  const all = (screen.UNSAFE_root as unknown as { findAll: (f: (n: Node) => boolean) => Node[] }).findAll((n) => typeof n.type === "string");
  for (const n of all) {
    const role = (n.props.accessibilityRole ?? n.props.role) as string | undefined;
    // Deliberately out of TalkBack's reach (a labelled control inside or around it speaks for it).
    const hidden =
      n.props.accessible === false ||
      n.props.accessibilityElementsHidden ||
      n.props.importantForAccessibility === "no" ||
      n.props.importantForAccessibility === "no-hide-descendants" ||
      n.props["aria-hidden"];
    const isControl = pressable(n) || (role && ROLES.has(role));
    if (!isControl) continue;
    const name = nameOf(n);
    const where = name ? `"${name.slice(0, 50)}"` : `(${role ?? "no role"}, testID ${String(n.props.testID ?? "-")})`;
    const size = pressable(n) ? sizeProblem(n) : null;
    if (size) out.push(`small (${size}): ${where}`);
    if (hidden) continue;
    if (pressable(n) && !role) out.push(`no role: ${where}`);
    if (!name) out.push(`no name: ${where}`);
  }
  return [...new Set(out)];
}

// The launch and auth screens are signed out; the rest are signed in.
const SIGNED_OUT = new Set(["Main", "E-Welcome", "E-Generate", "E-Create", "E-Grow", "E-Login", "E-Signup", "E-OTP", "E-Forgot"]);

describe("accessibility audit", () => {
  beforeEach(() => setMockDelay(0));

  it("finds every control reachable and readable on every screen", async () => {
    const report: Record<string, string[]> = {};
    for (const id of SCREEN_IDS) {
      useSession.setState({ ready: true, signedIn: !SIGNED_OUT.has(id) });
      const r = renderRouter(APP, { initialUrl: SCREENS[id].href });
      // renderRouter turns fake timers on; the mock API answers on real ones.
      jest.useRealTimers();
      // Let each screen's data load (mock delay 0; react-query settles on timers).
      await act(async () => {
        for (let i = 0; i < 6; i++) await new Promise((res) => setTimeout(res, 5));
      });
      const found = audit();
      if (found.length) report[`${id} ${SCREENS[id].href}`] = found;
      r.unmount();
    }
    if (process.env.A11Y_REPORT) console.log(JSON.stringify(report, null, 1));
    expect(report).toEqual({});
  }, 600000);
});
