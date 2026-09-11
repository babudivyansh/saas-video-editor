// Goal constants, shared by the API route and the settings UI.
//
// In their own module rather than exported from the route: importing a route
// into a page drags its handlers, rate limiters and everything they import into
// the page's bundle, for the sake of one number.

/**
 * Active goals per user.
 *
 * The UI shows the limit before you reach it and disables the form at it — a
 * form that only discovers the cap on submit is a form that wastes the typing.
 */
export const MAX_GOALS = 20;

/** How much history a goal's pace and projection are measured over. */
export const PROGRESS_WINDOW_DAYS = 90;
