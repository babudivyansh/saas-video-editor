import type { Insets } from "react-native";
import { layout } from "@/theme";

/** hitSlop that grows a smaller visual up to the 44pt minimum touch target. */
export function hitSlopFor(width: number, height: number = width): Insets | undefined {
  const x = Math.max(0, Math.ceil((layout.minTouch - width) / 2));
  const y = Math.max(0, Math.ceil((layout.minTouch - height) / 2));
  return x || y ? { top: y, bottom: y, left: x, right: x } : undefined;
}
