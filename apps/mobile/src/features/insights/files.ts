import type { SocialAccount } from "@clipiro/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { social } from "@/lib/api";

// Insights files on the phone: an account's posts as CSV (the web's own
// export), and finished reports (a short-lived signed link). Each is saved in
// the app cache and handed to Android's share sheet (Drive, email, Files…).

/** Exports one account's posts as CSV and opens the share sheet; resolves with the row count. */
export async function shareAccountCsv(account: Pick<SocialAccount, "id">): Promise<{ filename: string; rows: number }> {
  const { filename, csv, rows } = await social.exportCsv(account.id);
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: filename });
  return { filename, rows };
}

const MIME: Record<string, string> = { pdf: "application/pdf", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

/** Downloads a finished report and opens the share sheet. */
export async function shareReport(fileId: string): Promise<void> {
  const { url, filename } = await social.reportDownload(fileId);
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file);
  await Sharing.shareAsync(saved.uri, { mimeType: MIME[filename.split(".").pop() ?? ""] ?? "application/octet-stream", dialogTitle: filename });
}
