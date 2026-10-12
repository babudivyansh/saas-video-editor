import { tokensOf, type MobileSession, type User } from "@clipiro/shared";
import { create } from "zustand";
import { auth, setSignedOutHandler, tokenStore, userStore } from "@/lib/api";
import { googleSignOut } from "@/lib/google";

// Who is signed in. The root layout guards routes on `signedIn`
// (Stack.Protected), so flipping it moves the user between the auth flow and
// the tabs and drops the other side's history. The tokens themselves live in
// secure storage (src/lib/api.ts); this mirrors whether there are any.
type Session = {
  /** False until hydrate() has read secure storage (the splash stays up). */
  ready: boolean;
  signedIn: boolean;
  user: User | null;
  hydrate: () => Promise<void>;
  /** Keep a session the API just issued. */
  signIn: (session: MobileSession) => Promise<void>;
  /** End this device's session on the server (best effort) and forget it here. */
  signOut: () => Promise<void>;
};

export const useSession = create<Session>((set, get) => ({
  ready: false,
  signedIn: false,
  user: null,

  hydrate: async () => {
    if (get().ready) return; // once per launch
    const [tokens, user] = await Promise.all([tokenStore.get(), userStore.get()]);
    // No network here: an expired access token is refreshed on the first call,
    // so a signed-in user opens straight into the app, offline too.
    set({ ready: true, signedIn: !!tokens, user: tokens ? user : null });
  },

  signIn: async (session) => {
    await tokenStore.set(tokensOf(session));
    await userStore.set(session.user);
    set({ signedIn: true, user: session.user });
  },

  signOut: async () => {
    set({ signedIn: false, user: null }); // the screens swap at once
    const tokens = await tokenStore.get();
    await Promise.all([tokenStore.set(null), userStore.set(null)]).catch(() => {});
    // The server revokes the refresh token and this phone's push tokens. If
    // that fails (offline), the refresh token simply expires unused.
    await Promise.all([tokens ? auth.logout(tokens).catch(() => {}) : null, googleSignOut()]);
  },
}));

// The API client refused a refresh: the session is over everywhere.
setSignedOutHandler(() => {
  userStore.set(null).catch(() => {});
  useSession.setState({ signedIn: false, user: null });
});
