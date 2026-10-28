// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/app/components/AuthContext";
import LoginPage from "./page";

// Regression: a 2FA sign-in on /login (every Google + 2FA sign-in finishes
// there) landed on /dashboard with the sign-in popup open over a valid
// session. AuthProvider lives in the root layout and had read the signed-in
// marker before the sign-in set it; /login's router.push never told it.

let pathname = "/login";
const push = vi.fn((to: string) => { pathname = to; });

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/components/AuthArtPanel", () => ({ default: () => null }));

// Stands in for the 2FA code step finishing: /api/auth/2fa/verify-login has
// set the session cookie, AuthForm's finishAuth sets the readable marker.
vi.mock("@/app/components/AuthForm", () => ({
  default: ({ onSuccess }: { onSuccess?: (token: string) => void }) => (
    <button
      onClick={() => {
        document.cookie = "signed_in=1; path=/";
        onSuccess?.("cookie-session");
      }}
    >
      Verify code
    </button>
  ),
}));

function ModalProbe() {
  const { authModal, user } = useAuth();
  return (
    <>
      <div data-testid="modal">{authModal.isOpen ? "open" : "closed"}</div>
      <div data-testid="user">{user ? user.email : "none"}</div>
    </>
  );
}

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LoginPage />
        <ModalProbe />
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("/login sign-in success", () => {
  beforeEach(() => {
    pathname = "/login";
    push.mockClear();
    localStorage.clear();
    document.cookie = "signed_in=; path=/; max-age=0";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/auth/me") {
        return new Response(JSON.stringify({ user: { id: "1", email: "twofa@example.com" } }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));
  });

  it("leaves the user signed in on /dashboard instead of reopening the sign-in popup", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(tree(client));
    await waitFor(() => expect(screen.getByTestId("modal").textContent).toBe("closed"));

    await userEvent.click(screen.getByText("Verify code"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));

    // The client-side navigation: same AuthProvider, new pathname.
    await act(async () => { rerender(tree(client)); });

    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("twofa@example.com"));
    expect(screen.getByTestId("modal").textContent).toBe("closed");
  });
});
