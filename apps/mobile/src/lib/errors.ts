import { ApiError, NetworkError, ResponseShapeError } from "@clipiro/shared";

/** A line to show for anything an API call can throw. */
export function apiErrorMessage(e: unknown): string {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message;
  if (e instanceof ResponseShapeError) return "Clipiro sent something this version of the app doesn’t understand. Update the app and try again.";
  return "Something went wrong. Please try again.";
}
