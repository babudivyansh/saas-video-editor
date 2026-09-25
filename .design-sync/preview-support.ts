// Preview-card support, merged into the synced bundle via cfg.extraEntries.
//
// Modal, Dropdown, ContextMenu and Toast animate in with framer-motion. The
// design-sync capture screenshots at network-idle, and framer-motion starts
// its entrance on a variable delay (measured 0.7–2.2s), so the same card was
// captured sometimes settled and sometimes still at opacity 0 — a race, not a
// bug in the components. Previews call this at module scope so cards render
// the settled state users see a moment after opening.
//
// It must live INSIDE the bundle: a preview importing framer-motion itself
// would get a second copy whose config never reaches the components' copy.
// Lower-case + dunder so the converter never lists it as a component, and no
// design ever calls it — real designs keep their real animations.
import { MotionGlobalConfig } from "framer-motion";

export function __dsSettleMotion() {
  MotionGlobalConfig.skipAnimations = true;
}
