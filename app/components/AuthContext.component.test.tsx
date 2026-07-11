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

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    // jsdom logs (but doesn't throw on) navigation attempts triggered by
    // signOut's `window.location.href = "/"` — nothing to configure here,
    // just documenting why that console noise is expected in this suite.
  });

  it("starts logged out when no token is stored", async () => {
    renderWithProviders();
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("loads the user when a valid token is stored", async () => {
    localStorage.setItem("token", "valid-token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: FAKE_USER }),
    }) as unknown as typeof fetch;

    renderWithProviders();

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("test@example.com"));
  });

  it("clears the token when /api/auth/me rejects it (session expiry)", async () => {
    localStorage.setItem("token", "expired-token");
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    }) as unknown as typeof fetch;

    renderWithProviders();

    // "none" is also the initial (pre-fetch) render, so wait for the actual
    // signal that the invalid token was cleared rather than this trivially-
    // true-at-t=0 text content.
    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
    expect(screen.getByTestId("user")).toHaveTextContent("none");
  });

  it("signOut calls the logout endpoint and clears local session state", async () => {
    localStorage.setItem("token", "valid-token");
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
    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
  });
});
