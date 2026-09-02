// Regression suite for the bug where an admin-assigned plan never reached the
// user's dashboard.
//
// The reported symptom was "admin panel shows the new plan, dashboard still
// shows Free". The cause was here: Save decided what to send by diffing the
// edit buffer against the row, and the row changes underneath an open editor
// when a plan is applied. The buffer went stale, the diff read as an edit, and
// Save sent `subscriptionEndsAt: null` — clearing the term the plan had just
// set while leaving `planId` alone.
//
// That leaves the account in a state nothing recovers from: the lapse cron
// skips it (it queries `subscriptionEndsAt: { not: null, lte: now }`, so NULL
// is excluded), and the plan assignment already cleared `freeCreditsRefillAt`,
// so the user gets neither subscription credits nor the free-tier drip.

import { describe, expect, it } from "vitest";
import { buildUserPatchBody, toDateInputValue, type EditableUserRow, type EditBuffer } from "./patch-body";

const row: EditableUserRow = {
  monthlyCredits: 0,
  subscriptionEndsAt: null,
  name: "Divyansh",
  email: "user@example.com",
};

const buffer = (over: Partial<EditBuffer> = {}): EditBuffer => ({
  monthlyCredits: "0",
  subscriptionEndsAt: "",
  name: "Divyansh",
  email: "user@example.com",
  ...over,
});

const touch = (...fields: string[]) => new Set(fields);

describe("buildUserPatchBody — the plan-clobber regression", () => {
  it("does not send subscriptionEndsAt when the admin never touched that field", () => {
    // The exact sequence: the row had no subscription when the editor opened,
    // then "Apply plan change" set a term and the list refetched. The buffer
    // still holds "" — but the admin only ever used the plan dropdown.
    const afterPlanApply: EditableUserRow = { ...row, subscriptionEndsAt: "2026-10-03T00:00:00.000Z" };

    const body = buildUserPatchBody(afterPlanApply, buffer({ subscriptionEndsAt: "" }), touch());

    // Against the pre-fix code this contained `subscriptionEndsAt: null`,
    // which is what silently un-did the plan.
    expect(body).not.toHaveProperty("subscriptionEndsAt");
    expect(body).toEqual({});
  });

  it("still does not send it when the admin edited a different field entirely", () => {
    const afterPlanApply: EditableUserRow = { ...row, subscriptionEndsAt: "2026-10-03T00:00:00.000Z" };

    const body = buildUserPatchBody(
      afterPlanApply,
      buffer({ name: "Divyansh Verma", subscriptionEndsAt: "" }),
      touch("name"),
    );

    expect(body).toEqual({ name: "Divyansh Verma" });
    expect(body).not.toHaveProperty("subscriptionEndsAt");
  });

  it("sends the new date when the admin genuinely edits it", () => {
    const body = buildUserPatchBody(
      row,
      buffer({ subscriptionEndsAt: "2026-12-31" }),
      touch("subscriptionEndsAt"),
    );
    expect(body).toEqual({ subscriptionEndsAt: "2026-12-31" });
  });

  it("sends null when the admin deliberately clears the date", () => {
    const withTerm: EditableUserRow = { ...row, subscriptionEndsAt: "2026-12-31T23:59:59.999Z" };

    const body = buildUserPatchBody(withTerm, buffer({ subscriptionEndsAt: "" }), touch("subscriptionEndsAt"));

    // Clearing is a real action and must still work — it is only unreachable
    // by accident now.
    expect(body).toEqual({ subscriptionEndsAt: null });
  });

  it("sends nothing when a touched field was typed back to its original value", () => {
    const withTerm: EditableUserRow = { ...row, subscriptionEndsAt: "2026-12-31T23:59:59.999Z" };

    const body = buildUserPatchBody(
      withTerm,
      buffer({ subscriptionEndsAt: "2026-12-31" }),
      touch("subscriptionEndsAt"),
    );

    expect(body).toEqual({});
  });
});

describe("buildUserPatchBody — other fields", () => {
  it("sends only the fields that were touched and changed", () => {
    const body = buildUserPatchBody(
      row,
      buffer({ monthlyCredits: "500", name: "New Name", email: "new@example.com" }),
      touch("monthlyCredits", "name", "email"),
    );
    expect(body).toEqual({ monthlyCredits: 500, name: "New Name", email: "new@example.com" });
  });

  it("lowercases and trims an edited email", () => {
    const body = buildUserPatchBody(row, buffer({ email: "  NEW@Example.COM  " }), touch("email"));
    expect(body).toEqual({ email: "new@example.com" });
  });

  it("ignores an unparseable credits value rather than sending NaN", () => {
    const body = buildUserPatchBody(row, buffer({ monthlyCredits: "abc" }), touch("monthlyCredits"));
    expect(body).toEqual({});
  });

  it("refuses to blank an email — clearing the field is not a rename to empty", () => {
    const body = buildUserPatchBody(row, buffer({ email: "   " }), touch("email"));
    expect(body).toEqual({});
  });

  it("allows clearing a name, which is legitimately nullable", () => {
    const body = buildUserPatchBody(row, buffer({ name: "" }), touch("name"));
    expect(body).toEqual({ name: "" });
  });
});

describe("toDateInputValue", () => {
  it("reduces an ISO timestamp to the date input's format", () => {
    expect(toDateInputValue("2026-12-31T23:59:59.999Z")).toBe("2026-12-31");
  });

  it("maps no subscription to an empty input", () => {
    expect(toDateInputValue(null)).toBe("");
  });
});
