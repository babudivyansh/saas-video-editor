"use client";

import React, { useState } from "react";
import Link from "next/link";
import MarketingShell from "@/app/components/marketing/MarketingShell";
import PageHero from "@/app/components/marketing/PageHero";
import { CONTAINER, SECTION_Y } from "@/app/components/marketing/styles";
import { Button } from "@/app/components/ui/Button";
import { FieldLabel, Input, Textarea } from "@/app/components/ui/Field";

const CHANNELS = [
  {
    title: "Customer Support",
    href: "mailto:support@clipiro.com",
    value: "support@clipiro.com",
    note: "For account issues and editor help.",
    tint: "bg-tint-blue text-brand",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    ),
  },
  {
    title: "General Inquiries",
    href: "mailto:hello@clipiro.com",
    value: "hello@clipiro.com",
    note: "Partnerships, affiliates, or feedback.",
    tint: "bg-tint-blue text-brand",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    ),
  },
  {
    title: "Average Response Time",
    value: "Under 24 hours",
    note: "We reply round the clock, 7 days a week.",
    tint: "bg-tint-emerald text-emerald-600",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
];

export default function ContactPage() {
  const [formData, setFormData] = useState({ name: "", email: "", subject: "support", message: "" });
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setStatus("error");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, hp: honeypot }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("success");
      setFormData({ name: "", email: "", subject: "support", message: "" });
    } catch {
      setStatus("error");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (status === "error") setStatus("idle");
  };

  return (
    <MarketingShell>
      <PageHero
        eyebrow="Get in touch"
        title="We'd love to hear from you"
        lede="Have a question about features, pricing, or need technical help? Contact our team — we answer every message."
      />

      <section>
        <div className={`${CONTAINER} ${SECTION_Y}`}>
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="space-y-5 lg:col-span-5">
              <div className="rounded-2xl border border-card-border bg-white p-6">
                <h2 className="mb-6 text-[22px] font-semibold leading-[1.2] tracking-tight text-ink">
                  Contact information
                </h2>
                <ul className="space-y-6">
                  {CHANNELS.map((c) => (
                    <li key={c.title} className="flex items-start gap-4">
                      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${c.tint}`}>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {c.icon}
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink">{c.title}</p>
                        {c.href ? (
                          <a href={c.href} className="text-[14px] text-brand hover:underline">
                            {c.value}
                          </a>
                        ) : (
                          <p className="text-[14px] text-ink-soft">{c.value}</p>
                        )}
                        <p className="mt-0.5 text-[12.5px] text-ink-soft">{c.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-card-border bg-tint-blue p-6">
                <h3 className="mb-2 text-[17px] font-semibold leading-[1.3] tracking-tight text-ink">
                  Looking for instant answers?
                </h3>
                <p className="mb-4 text-[14px] leading-[1.6] text-ink-soft">
                  Our help center covers getting started, credits and billing, Auto Clips, and the editor.
                </p>
                <Link
                  href="/help"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:text-brand-dark"
                >
                  Visit the help center
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-card-border bg-white p-6 md:p-8">
                {status === "success" ? (
                  <div className="py-12 text-center">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-tint-emerald text-emerald-600">
                      <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="mb-2 text-[22px] font-semibold tracking-tight text-ink">Message sent</h3>
                    <p className="mx-auto max-w-md text-[14px] leading-[1.6] text-ink-soft">
                      Thank you for contacting us. We have received your message and will get back to you shortly.
                    </p>
                    <div className="mt-8">
                      <Button onClick={() => setStatus("idle")} type="button" size="lg">
                        Send another message
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <h2 className="text-[22px] font-semibold leading-[1.2] tracking-tight text-ink">
                      Send us a message
                    </h2>

                    {status === "error" && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] font-medium text-red-600">
                        Please fill in all the required fields.
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <FieldLabel htmlFor="name">Your name *</FieldLabel>
                        <Input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="email">Email address *</FieldLabel>
                        <Input
                          type="email"
                          id="email"
                          name="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>

                    <div>
                      <FieldLabel htmlFor="subject">Message category</FieldLabel>
                      <select
                        id="subject"
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-card-border bg-white px-4 py-2.5 text-sm text-ink outline-none transition-all focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                      >
                        <option value="support">Technical support / account issues</option>
                        <option value="billing">Billing &amp; refund inquiry</option>
                        <option value="affiliate">Affiliate program questions</option>
                        <option value="feedback">Product feedback &amp; suggestions</option>
                      </select>
                    </div>

                    <div>
                      <FieldLabel htmlFor="message">Your message *</FieldLabel>
                      <Textarea
                        id="message"
                        name="message"
                        required
                        rows={6}
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Write your message here..."
                      />
                    </div>

                    <input
                      type="text"
                      name="hp"
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      className="absolute left-[-9999px] h-0 w-0 opacity-0"
                    />

                    <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full">
                      {status === "submitting" ? "Sending…" : "Send message"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
