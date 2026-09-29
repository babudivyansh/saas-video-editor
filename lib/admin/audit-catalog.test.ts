import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { describeAction, isCataloguedAction, isCataloguedPrefix } from "./audit-catalog";

// Every action the code can write must be described in the catalogue, or the
// Audit Log shows a raw key for it. Scans each audit call (auditAdminAction /
// auditEvent / social recordAudit) for the action literals — including both
// branches of a ternary — and the static prefix of template actions.
function collectActions() {
  const literals = new Set<string>();
  const prefixes = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!["node_modules", ".next"].includes(e.name)) walk(p);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.startsWith("audit-")) {
        const src = fs.readFileSync(p, "utf8");
        const re = /\b(auditAdminAction|auditEvent|recordAudit|audit)\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const region = src.slice(m.index, m.index + 300);
          for (const lit of region.matchAll(/["']([a-z_]+\.[a-z_-]+)["']/g)) literals.add(lit[1]);
          for (const tpl of region.matchAll(/`([a-z_]+\.[a-z_]*)\$\{/g)) prefixes.add(tpl[1]);
        }
      }
    }
  };
  walk(path.join(process.cwd(), "app"));
  walk(path.join(process.cwd(), "lib"));
  return { literals, prefixes };
}

describe("audit action catalogue", () => {
  const { literals, prefixes } = collectActions();

  it("finds the audit calls it is meant to police", () => {
    expect(literals.size).toBeGreaterThan(60);
    expect(literals).toContain("user.deleted");
    expect(prefixes).toContain("queue.");
  });

  it("describes every literal action the code writes", () => {
    const missing = [...literals].filter((a) => !isCataloguedAction(a));
    expect(missing).toEqual([]);
  });

  it("covers every template action family", () => {
    const missing = [...prefixes].filter((p) => !isCataloguedPrefix(p));
    expect(missing).toEqual([]);
  });

  it("expands the dynamic families used by the admin routes", () => {
    for (const a of [
      "user.reset_2fa", "user.hard_delete", "user.bulk_suspend", "content.project_deleted", "content.asset_deleted",
      "asset.moderation_remove", "storage.retention_run", "review.report_resolved", "queue.drain-waiting",
    ]) expect(isCataloguedAction(a)).toBe(true);
  });

  it("reads an unknown legacy action instead of failing", () => {
    const info = describeAction("veo3.enabled");
    expect(info.label).toBe("Enabled");
    expect(info.severity).toBe("change");
  });

  it("rates the dangerous ones as critical and expects a reason", () => {
    for (const a of ["user.hard_delete", "user.reset_2fa", "storage.retention_run", "content.project_deleted"]) {
      expect(describeAction(a)).toMatchObject({ severity: "critical", expectsReason: true });
    }
  });
});
