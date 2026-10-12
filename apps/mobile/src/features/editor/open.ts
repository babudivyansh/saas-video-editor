import type { EditorCreateRequest } from "@clipiro/shared";
import { router } from "expo-router";
import { editor } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";

// The ways into the editor: open an existing edit, or start one (from a
// clip, a file in Assets, or blank) and open it.

export function openEdit(projectId: string) {
  router.push({ pathname: "/editor", params: { projectId } });
}

/** Creates the edit on the server, then opens it. Returns the error line on failure (for a toast). */
export async function startEdit(req: EditorCreateRequest): Promise<string | null> {
  try {
    const { projectId } = await editor.create(req);
    openEdit(projectId);
    return null;
  } catch (e) {
    return apiErrorMessage(e);
  }
}
