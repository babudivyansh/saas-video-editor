// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewsletterSignup from "./NewsletterSignup";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true })))));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe("NewsletterSignup", () => {
  it("submits a valid address and confirms double opt-in is pending", async () => {
    render(<NewsletterSignup />);

    await userEvent.type(screen.getByRole("textbox"), "reader@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/newsletter/subscribe");
    expect(JSON.parse(init.body as string)).toMatchObject({ email: "reader@example.com" });

    // The success copy must not claim they're subscribed — they aren't until
    // they click the emailed link.
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });

  it("normalizes the address before sending", async () => {
    render(<NewsletterSignup />);
    await userEvent.type(screen.getByRole("textbox"), "  MiXeD@Example.COM  ");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).email).toBe("mixed@example.com");
  });

  it("passes through the source so we can tell which surface converted", async () => {
    render(<NewsletterSignup source="blog_article" />);
    await userEvent.type(screen.getByRole("textbox"), "reader@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).source).toBe("blog_article");
  });

  // Client-side validation exists to avoid burning the 5-per-5-minutes IP rate
  // limit on obvious typos.
  it("rejects an invalid address without hitting the network", async () => {
    render(<NewsletterSignup />);
    await userEvent.type(screen.getByRole("textbox"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(fetchMock()).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("clears the error once the visitor starts correcting it", async () => {
    render(<NewsletterSignup />);
    const input = screen.getByRole("textbox");

    await userEvent.type(input, "nope");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.type(input, "@example.com");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a server-side rejection instead of a false success", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 400 }))));
    render(<NewsletterSignup />);

    await userEvent.type(screen.getByRole("textbox"), "reader@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("Check your inbox")).not.toBeInTheDocument();
  });

  it("does not report success when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<NewsletterSignup />);

    await userEvent.type(screen.getByRole("textbox"), "reader@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("submits on Enter", async () => {
    render(<NewsletterSignup />);
    await userEvent.type(screen.getByRole("textbox"), "reader@example.com{Enter}");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  // The honeypot only works if humans can't see or tab into it — including
  // screen reader users, who would otherwise be told to fill it in.
  it("hides the honeypot from humans and assistive tech but still sends it", async () => {
    const { container } = render(<NewsletterSignup />);
    const honeypot = container.querySelector('input[name="hp"]');

    expect(honeypot).not.toBeNull();
    expect(honeypot).toHaveAttribute("aria-hidden", "true");
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);

    await userEvent.type(screen.getByRole("textbox"), "reader@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Subscribe" }));
    expect(JSON.parse((fetchMock().mock.calls[0] as [string, RequestInit])[1].body as string)).toHaveProperty("hp", "");
  });
});
