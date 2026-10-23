// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./AuthContext";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const FAKE_USER = {
  id: "1",
  email: "test@example.com",
  phone: null,
  credits: 10,
  createdAt: new Date().toISOString(),
  role: "USER",
  firstName: "Test",
  lastName: "User",
  name: "Test User",
  avatarUrl: null,
  gender: null,
  intendedUse: null,
  subscriptionEndsAt: null,
  nextRefillAt: null,
  monthlyCredits: 0,
  plan: null,
};

function Harness() {
  const { user, isLoading, signOut } = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="user">{user ? user.email : "none"}</div>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// The session itself is an httpOnly cookie the page can't see; these tests
// drive the readable "signed_in" marker that sits beside it
// (lib/client-session.ts).
const signIn = () => { document.cookie = "signed_in=1; path=/"; };
const hasMarker = () => document.cookie.split(";").some((c) => c.trim() === "signed_in=1");

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = "signed_in=; path=/; max-age=0";
    vi.restoreAllMocks();
    // jsdom logs (but doesn't throw on) navigation attempts triggered by
    // signOut's `window.location.href = "/"` — nothing to configure here,
    // just documenting why that console noise is expected in this suite.
  });

  it("starts logged out when there is no session", async () => {
    renderWithProviders();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("loads the user when a session exists, with no token in the page", async () => {
    signIn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: FAKE_USER }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"));
    // Whatever goes in the header, it is not a JWT: the cookie authenticates.
    const auth = (fetchMock.mock.calls[0][1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;
    expect(auth?.Authorization ?? "").not.toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("moves a session from before the change off localStorage", async () => {
    localStorage.setItem("token", "legacy.jwt.value");
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: FAKE_USER }) }) as unknown as typeof fetch;

    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"));
    expect(localStorage.getItem("token")).toBeNull();
    expect(hasMarker()).toBe(true);
  });

  it("signs out locally when /api/auth/me rejects the session (expiry)", async () => {
    signIn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      // The status matters: only 401/403 is a verdict on the session.
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    }) as unknown as typeof fetch;

    renderWithProviders();

    await waitFor(() => expect(hasMarker()).toBe(false));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("KEEPS the session when /api/auth/me fails with a server error", async () => {
    // A 5xx says nothing about whether the session is valid, so signing the
    // user out over one is wrong — and it was inconsistent too, since being
    // offline (a thrown fetch) already left it in place.
    signIn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    }) as unknown as typeof fetch;

    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(hasMarker()).toBe(true);
  });

  it("signOut calls the logout endpoint and clears local session state", async () => {
    signIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ user: FAKE_USER }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithProviders();
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"));

    await userEvent.click(screen.getByText("Sign out"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/logout",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => expect(hasMarker()).toBe(false));
  });
});
