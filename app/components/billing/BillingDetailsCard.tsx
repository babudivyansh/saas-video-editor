"use client";

// Optional billing details printed on the customer's GST tax invoices
// (lib/invoice/). Everything is optional: with nothing saved, invoices are
// addressed to the account name and email, which is valid for B2C.
//
// Validation mirrors the server (app/api/billing/details) using the same
// lib/invoice/gst helpers, so a bad GSTIN is caught before the round trip.

import { useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useToast } from "@/app/components/ui/Toast";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";
import { GST_STATES, isValidGstin, isValidPincode } from "@/lib/invoice/gst";

const inputCls = "w-full bg-panel border border-card-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-soft/50 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all";
const labelCls = "text-xs font-semibold text-ink-soft uppercase tracking-wide block mb-1.5";

interface Details {
  billingName: string;
  billingAddress: string;
  billingState: string;
  billingPincode: string;
  billingGstin: string;
}

const EMPTY: Details = { billingName: "", billingAddress: "", billingState: "", billingPincode: "", billingGstin: "" };

function validate(d: Details): string | null {
  const gstin = d.billingGstin.trim().toUpperCase();
  if (d.billingPincode.trim() && !isValidPincode(d.billingPincode)) return "PIN code must be 6 digits.";
  if (gstin && !isValidGstin(gstin)) return "That GSTIN isn't valid — check for a typo.";
  if (gstin && d.billingState && gstin.slice(0, 2) !== d.billingState) return "State doesn't match your GSTIN.";
  return null;
}

export function BillingDetailsCard() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [details, setDetails] = useState<Details>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/billing/details", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { details: Partial<Record<keyof Details, string | null>> | null } | null) => {
        const d = data?.details;
        if (d) {
          setDetails({
            billingName: d.billingName ?? "",
            billingAddress: d.billingAddress ?? "",
            billingState: d.billingState ?? "",
            billingPincode: d.billingPincode ?? "",
            billingGstin: d.billingGstin ?? "",
          });
        }
      })
      .finally(() => setLoaded(true));
  }, [token]);

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setDetails((d) => ({ ...d, [key]: e.target.value }));
    setError(null);
  };

  function onGstinChange(e: React.ChangeEvent<HTMLInputElement>) {
    const gstin = e.target.value.toUpperCase();
    // A GSTIN's first two digits are its state — fill the state in for them.
    setDetails((d) => ({
      ...d,
      billingGstin: gstin,
      billingState: isValidGstin(gstin) ? gstin.slice(0, 2) : d.billingState,
    }));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(details);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/billing/details", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(details),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Couldn't save billing details."); return; }
      showToast("Billing details saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md" className="space-y-4">
      <div id="billing-details" className="scroll-mt-24">
        <p className="text-sm font-semibold text-ink">Billing details for invoices</p>
        <p className="text-xs text-fg-subtle mt-0.5">
          Optional. Printed on your GST tax invoices — add your GSTIN to claim input tax credit. Applies to invoices issued
          after you save.
        </p>
      </div>
      <form onSubmit={save} className="space-y-4" aria-busy={!loaded}>
        <div>
          <label htmlFor="billing-name" className={labelCls}>Name or business name</label>
          <input id="billing-name" type="text" value={details.billingName} onChange={set("billingName")} maxLength={120} placeholder="Acme Media Pvt Ltd" className={inputCls} />
        </div>
        <div>
          <label htmlFor="billing-address" className={labelCls}>Address</label>
          <textarea id="billing-address" value={details.billingAddress} onChange={set("billingAddress")} maxLength={300} rows={2} placeholder="Street, area, city" className={`${inputCls} resize-none`} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="billing-state" className={labelCls}>State</label>
            <select id="billing-state" value={details.billingState} onChange={set("billingState")} className={inputCls}>
              <option value="">Select state</option>
              {GST_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="billing-pincode" className={labelCls}>PIN code</label>
            <input id="billing-pincode" type="text" inputMode="numeric" value={details.billingPincode} onChange={set("billingPincode")} maxLength={6} placeholder="201301" className={inputCls} />
          </div>
        </div>
        <div>
          <label htmlFor="billing-gstin" className={labelCls}>GSTIN (optional)</label>
          <input id="billing-gstin" type="text" value={details.billingGstin} onChange={onGstinChange} maxLength={15} placeholder="22AAAAA0000A1Z5" className={`${inputCls} font-mono uppercase`} />
        </div>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <Button type="submit" disabled={saving || !loaded}>{saving ? "Saving…" : "Save billing details"}</Button>
      </form>
    </Card>
  );
}
