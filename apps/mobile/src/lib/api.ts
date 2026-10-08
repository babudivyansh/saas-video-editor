import { authApi, authTokensSchema, createApiClient, userSchema, type AuthTokens, type TokenStore, type User } from "@clipiro/shared";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// The one API client the app uses. Tokens live in expo-secure-store (the
// Android Keystore), never in AsyncStorage or memory-only state.

/**
 * Where the API is. Set EXPO_PUBLIC_API_URL per build; a dev build on the
 * emulator defaults to the host machine's `next dev` (10.0.2.2 is the host's
 * localhost as the Android emulator sees it).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? "http://10.0.2.2:3000" : "https://clipiro.com")).replace(/\/$/, "");

/** Names this phone in the web's "Sessions" list, e.g. "Clipiro/1.0 (Android 15; Pixel 7)". */
export const USER_AGENT = `Clipiro/1.0 (Android ${Platform.Version}${Device.modelName ? `; ${Device.modelName}` : ""})`;

const TOKENS_KEY = "clipiro.tokens";
const USER_KEY = "clipiro.user";

async function readJson<T>(key: string, parse: (v: unknown) => T): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null; // unreadable (e.g. the Keystore was reset): treat as signed out
  }
}

async function writeJson(key: string, value: unknown) {
  if (value == null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export const tokenStore: TokenStore = {
  get: () => readJson(TOKENS_KEY, (v) => authTokensSchema.parse(v)),
  set: (tokens: AuthTokens | null) => writeJson(TOKENS_KEY, tokens),
};

/** The signed-in user, kept beside the tokens so a cold start shows the app offline. */
export const userStore = {
  get: () => readJson(USER_KEY, (v) => userSchema.parse(v)),
  set: (user: User | null) => writeJson(USER_KEY, user),
};

let onSignedOut: () => void = () => {};
/** The session store registers itself here (a refresh token was refused). */
export function setSignedOutHandler(fn: () => void) {
  onSignedOut = fn;
}

export const api = createApiClient({
  baseUrl: API_URL,
  tokens: tokenStore,
  userAgent: USER_AGENT,
  onSignedOut: () => onSignedOut(),
  // Looked up per call, so tests can swap the transport.
  fetch: (input, init) => globalThis.fetch(input, init),
});

export const auth = authApi(api);
