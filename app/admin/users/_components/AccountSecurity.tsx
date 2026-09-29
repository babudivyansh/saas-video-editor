"use client";

// Security tab of the admin user page: sign-in state, signed-in devices with
// per-device sign-out, two-factor reset, email verification, password reset,
// suspend / unsuspend, and login history.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { useAccountAction } from "./useAccountAction";

interface Session {
  sessionId: string;
  device: string;
  ip: string | null;
  country: string | null;
  createdAt: number;
  lastSeenAt: number;
}

export interface SecurityUser {
  id: string;
  email: string;
  role: string;
  suspendedAt: string | null;
  deactivatedAt: string | null;
  emailVerifiedAt: string | null;
  twoFactorEnabled: boolean;
}

type Dialog =
  | { kind: "reset_2fa" }
  | { kind: "mark_email_verified" }
  | { kind: "resend_verification" }
  | { kind: "send_password_reset" }
  | { kind: "revoke_session"; session: Session }
  | { kind: "revoke_all" }
  | { kind: "suspend" }
  | { kind: "unsuspend" };

function Row({ title, detail, children }: { title: string; detail: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <div className="text-xs text-fg-subtle mt-0.5">{detail}</div>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">{children}</div>
    </li>
  );
}

const dt = (v: string | number | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function AccountSecurity({
  user,
  loginEvents,
  headers,
}: {
  user: SecurityUser;
  loginEvents: Array<{ ip: string | null; device: string | null; country: string | null; createdAt: string }>;
  headers: () => Record<string, string>;
}) {
  const act = useAccountAction(user.id, headers);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const isAdmin = user.role === "ADMIN";

  const sessions = useQuery({
    queryKey: ["admin-user-sessions", user.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${user.id}/sessions`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load sessions");
      return ((await res.json()) as { sessions: Session[] }).sessions;
    },
  });

  const actions = `/api/admin/users/${user.id}/actions`;
  const moderate = `/api/admin/users/${user.id}/moderate`;

  return (
    <div className="space-y-5">
      <Card shadow padding="md">
        <h2 className="text-sm font-bold text-fg">Account security</h2>
        {isAdmin && <p className="text-xs text-warning mt-1">This is an admin account — demote it to change its security settings here.</p>}
        <ul className="divide-y divide-line">
          <Row
            title="Sign-in"
            detail={user.suspendedAt ? <span className="text-error">Suspended since {dt(user.suspendedAt)} — sign-in is blocked.</span> : user.deactivatedAt ? <span className="text-warning">Deactivated by the user {dt(user.deactivatedAt)} (30-day recovery window).</span> : "Allowed."}
          >
            {user.suspendedAt ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "unsuspend" })}>Unsuspend</Button>
            ) : (
              <Button size="sm" variant="danger" disabled={isAdmin} onClick={() => setDialog({ kind: "suspend" })}>Suspend</Button>
            )}
          </Row>
          <Row
            title="Two-factor authentication"
            detail={<StatusBadge tone={user.twoFactorEnabled ? "success" : "neutral"}>{user.twoFactorEnabled ? "On" : "Off"}</StatusBadge>}
          >
            {user.twoFactorEnabled && (
              <Button size="sm" variant="danger" disabled={isAdmin} onClick={() => setDialog({ kind: "reset_2fa" })}>Reset 2FA</Button>
            )}
          </Row>
          <Row
            title="Email"
            detail={
              <span className="break-all">
                {user.email} ·{" "}
                {user.emailVerifiedAt ? `verified ${dt(user.emailVerifiedAt)}` : <span className="text-warning">not verified</span>}
              </span>
            }
          >
            {!user.emailVerifiedAt && (
              <>
                <Button size="sm" variant="secondary" disabled={isAdmin} onClick={() => setDialog({ kind: "resend_verification" })}>Resend code</Button>
                <Button size="sm" variant="secondary" disabled={isAdmin} onClick={() => setDialog({ kind: "mark_email_verified" })}>Mark verified</Button>
              </>
            )}
          </Row>
          <Row title="Password" detail="Emails the same reset link the “Forgot password” form sends (valid 15 minutes).">
            <Button size="sm" variant="secondary" disabled={isAdmin} onClick={() => setDialog({ kind: "send_password_reset" })}>Send reset link</Button>
          </Row>
        </ul>
      </Card>

      <Card shadow padding="md">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h2 className="text-sm font-bold text-fg flex-1">Signed-in devices</h2>
          {(sessions.data?.length ?? 0) > 0 && (
            <Button size="sm" variant="danger" onClick={() => setDialog({ kind: "revoke_all" })}>Sign out everywhere</Button>
          )}
        </div>
        {sessions.isError ? (
          <p className="text-sm text-error">Couldn&apos;t load sessions.</p>
        ) : sessions.isLoading ? (
          <div className="h-16 bg-surface-3 rounded-xl animate-pulse" />
        ) : (sessions.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-subtle">Not signed in anywhere.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(sessions.data ?? []).map((s) => (
              <li key={s.sessionId} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-fg">{s.device || "Unknown device"}</p>
                  <p className="text-xs text-fg-subtle">
                    {s.country ?? "—"} · <span className="font-mono">{s.ip ?? "—"}</span> · signed in {dt(s.createdAt)} · last seen {dt(s.lastSeenAt)}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "revoke_session", session: s })}>Sign out</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card shadow padding="md">
        <h2 className="text-sm font-bold text-fg mb-3">Login history (latest 15)</h2>
        {loginEvents.length === 0 ? (
          <p className="text-sm text-fg-subtle">No logins recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-fg-subtle text-left">
                  <th className="font-semibold pb-2">When</th>
                  <th className="font-semibold pb-2">Device</th>
                  <th className="font-semibold pb-2">Country</th>
                  <th className="font-semibold pb-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {loginEvents.map((e, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1.5 text-fg whitespace-nowrap">{dt(e.createdAt)}</td>
                    <td className="py-1.5 text-fg-muted">{e.device ?? "—"}</td>
                    <td className="py-1.5 text-fg-muted">{e.country ?? "—"}</td>
                    <td className="py-1.5 text-fg-subtle font-mono text-xs">{e.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={dialog?.kind === "reset_2fa"}
        title="Reset two-factor authentication"
        message={`Turn off 2FA for ${user.email} and delete their recovery codes? Only do this after confirming their identity another way — this is how account takeovers through support usually happen.`}
        confirmLabel="Reset 2FA"
        danger
        confirmPhrase={user.email}
        requireReason
        onConfirm={async ({ phrase, reason }) => { await act(actions, { action: "reset_2fa", confirmPhrase: phrase, reason }, "Two-factor reset"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "mark_email_verified"}
        title="Mark email as verified"
        message={`Treat ${user.email} as verified without the user entering a code?`}
        confirmLabel="Mark verified"
        requireReason
        onConfirm={async ({ reason }) => { await act(actions, { action: "mark_email_verified", reason }, "Email marked verified"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "resend_verification"}
        title="Resend verification code"
        message={`Email a fresh verification code to ${user.email}?`}
        confirmLabel="Send"
        onConfirm={async () => { await act(actions, { action: "resend_verification" }, "Verification code sent"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "send_password_reset"}
        title="Send password reset"
        message={`Email a password-reset link to ${user.email}? Their current password keeps working until they use it.`}
        confirmLabel="Send"
        onConfirm={async () => { await act(actions, { action: "send_password_reset" }, "Reset link sent"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "revoke_session"}
        title="Sign out this device"
        message={dialog?.kind === "revoke_session" ? `Sign ${user.email} out on “${dialog.session.device || "unknown device"}”?` : ""}
        confirmLabel="Sign out"
        onConfirm={async () => {
          if (dialog?.kind === "revoke_session") await act(actions, { action: "revoke_session", sessionId: dialog.session.sessionId }, "Device signed out");
        }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "revoke_all"}
        title="Sign out everywhere"
        message={`Sign ${user.email} out of every device? They can sign straight back in.`}
        confirmLabel="Sign out everywhere"
        danger
        onConfirm={async () => { await act(moderate, { action: "revoke_sessions", confirm: true }, "Signed out everywhere"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "suspend"}
        title="Suspend account"
        message={`Block sign-in for ${user.email} and sign them out now?`}
        confirmLabel="Suspend"
        danger
        requireReason
        onConfirm={async ({ reason }) => { await act(moderate, { action: "suspend", confirm: true, reason }, "Account suspended"); }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === "unsuspend"}
        title="Unsuspend account"
        message={`Let ${user.email} sign in again?`}
        confirmLabel="Unsuspend"
        onConfirm={async () => { await act(moderate, { action: "unsuspend" }, "Account unsuspended"); }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
