"use client";

import React, { useState } from "react";
import Link from "next/link";
import SiteNavbar from "@/app/components/SiteNavbar";
import SiteFooter from "@/app/components/SiteFooter";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "support",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setStatus("error");
      return;
    }
    
    setStatus("submitting");
    // Simulate API request
    setTimeout(() => {
      setStatus("success");
      setFormData({
        name: "",
        email: "",
        subject: "support",
        message: "",
      });
    }, 1500);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (status === "error") setStatus("idle");
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <SiteNavbar solid />

      <main className="relative py-20 overflow-hidden">
        {/* Background blobs */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[10%] right-[10%] w-[35vw] h-[35vw] rounded-full bg-[#335CFF]/[0.03] blur-3xl" />
          <div className="absolute bottom-[20%] left-[5%] w-[30vw] h-[30vw] rounded-full bg-[#335CFF]/[0.02] blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-4 md:px-12 lg:px-[120px]">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#335CFF]/10 px-4.5 py-1.5 text-xs font-bold uppercase tracking-wider text-[#335CFF]">
              Get in Touch
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl">
              We&apos;d love to hear from you
            </h1>
            <p className="mt-4 text-lg text-gray-500 leading-relaxed">
              Have a question about features, pricing, or need technical help? Contact our team.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            {/* Contact Details Column */}
            <div className="lg:col-span-5 space-y-8">
              <div className="rounded-[24px] border border-gray-150 bg-white p-8 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Contact Information</h2>
                
                <div className="space-y-6">
                  {/* Email support */}
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-[#335CFF]/10 flex items-center justify-center flex-shrink-0 text-[#335CFF]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Customer Support</p>
                      <a href="mailto:support@clipiro.ai" className="text-sm text-[#335CFF] hover:underline">
                        support@clipiro.ai
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">For account issues and editor help.</p>
                    </div>
                  </div>

                  {/* Email hello */}
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-[#335CFF]/10 flex items-center justify-center flex-shrink-0 text-[#335CFF]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">General Inquiries</p>
                      <a href="mailto:hello@clipiro.com" className="text-sm text-[#335CFF] hover:underline">
                        hello@clipiro.com
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">Partnerships, affiliates, or feedback.</p>
                    </div>
                  </div>

                  {/* Guaranteed reply */}
                  <div className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">Average Response Time</p>
                      <p className="text-sm text-gray-600">Under 24 hours</p>
                      <p className="text-xs text-gray-400 mt-0.5">We reply round the clock, 7 days a week.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* FAQ Redirect Quick Card */}
              <div className="rounded-[24px] border border-[#E8EDFF] bg-[#E8EDFF]/20 p-8">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Looking for instant answers?</h3>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  We might have already answered your question in our FAQ. Check it out on the homepage.
                </p>
                <Link
                  href="/#faq"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[#335CFF] hover:text-[#2348d8] transition-colors"
                >
                  Go to FAQ section
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Interactive Form Column */}
            <div className="lg:col-span-7">
              <div className="rounded-[24px] border border-gray-150 bg-white p-8 shadow-sm">
                {status === "success" ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-600 mb-6 animate-pulse">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                      Thank you for contacting us. We have received your message and will get back to you shortly.
                    </p>
                    <button
                      onClick={() => setStatus("idle")}
                      className="mt-8 inline-flex items-center justify-center rounded-full bg-[#335CFF] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[#2348d8] cursor-pointer"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Send us a Message</h2>
                    
                    {status === "error" && (
                      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium">
                        Please fill in all the required fields.
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-bold text-gray-700 mb-2">
                          Your Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          required
                          value={formData.name}
                          onChange={handleChange}
                          placeholder="John Doe"
                          className="w-full rounded-xl border border-gray-250 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#335CFF] focus:ring-1 focus:ring-[#335CFF]"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          required
                          value={formData.email}
                          onChange={handleChange}
                          placeholder="john@example.com"
                          className="w-full rounded-xl border border-gray-250 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#335CFF] focus:ring-1 focus:ring-[#335CFF]"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="subject" className="block text-sm font-bold text-gray-700 mb-2">
                        Message Category
                      </label>
                      <select
                        id="subject"
                        name="subject"
                        value={formData.subject}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-gray-250 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#335CFF] focus:ring-1 focus:ring-[#335CFF]"
                      >
                        <option value="support">Technical Support / Account issues</option>
                        <option value="billing">Billing & Refund inquiry</option>
                        <option value="affiliate">Affiliate Program questions</option>
                        <option value="feedback">Product Feedback & Suggestions</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-bold text-gray-700 mb-2">
                        Your Message <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        required
                        rows={6}
                        value={formData.message}
                        onChange={handleChange}
                        placeholder="Write your message here..."
                        className="w-full rounded-xl border border-gray-250 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#335CFF] focus:ring-1 focus:ring-[#335CFF] resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={status === "submitting"}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#335CFF] px-8 py-4 text-base font-bold text-white shadow-lg shadow-[#335CFF]/20 transition-all hover:bg-[#2348d8] disabled:bg-gray-400 hover:scale-[1.01] cursor-pointer"
                    >
                      {status === "submitting" ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Sending...
                        </>
                      ) : (
                        "Send Message"
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
