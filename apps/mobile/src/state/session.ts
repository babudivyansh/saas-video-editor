import { create } from "zustand";

// Temporary signed-in flag for the navigation shell. The root layout guards
// routes on it (Stack.Protected), so flipping it is what moves the user
// between the auth flow and the tabs — and drops the other side's history.
// Phase 6 replaces this with real tokens in expo-secure-store.
type Session = {
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

export const useSession = create<Session>((set) => ({
  signedIn: false,
  signIn: () => set({ signedIn: true }),
  signOut: () => set({ signedIn: false }),
}));
