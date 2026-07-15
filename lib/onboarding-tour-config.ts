export interface TourStep {
  id: string;
  /** CSS selector for the target element — matched against a data-tour attribute. */
  selector: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "nav-home",
    selector: '[data-tour="nav-home"]',
    title: "Your dashboard home",
    body: "Quests, quick starts, and your recent projects all live here.",
  },
  {
    id: "nav-create",
    selector: '[data-tour="nav-create"]',
    title: "Every tool, one place",
    body: "Browse all of Clipiro's AI tools from the Create tab.",
  },
  {
    id: "create-menu",
    selector: '[data-tour="create-menu"]',
    title: "Jump straight in",
    body: "Or use the Create menu to start a specific tool without leaving this page.",
  },
  {
    id: "plan-chip",
    selector: '[data-tour="plan-chip"]',
    title: "Your plan",
    body: "See your current plan here — click anytime to upgrade.",
  },
  {
    id: "credits-pill",
    selector: '[data-tour="credits-pill"]',
    title: "Credits",
    body: "Credits power every generation. Keep an eye on your balance here.",
  },
  {
    id: "account-menu",
    selector: '[data-tour="account-menu"]',
    title: "Your account",
    body: "Profile, billing, and settings are one click away.",
  },
];
