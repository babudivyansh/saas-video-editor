// Native Google sign-in (Android Credential Manager) via
// react-native-nitro-google-signin. Google hands the app an ID token for our
// *web* client ID; the server checks it (/api/mobile/v1/auth/google).
// Needs a development build: the module isn't in Expo Go, so it's loaded on
// first use and a missing module reads as "not available in this build".

/** Read per call (Expo inlines EXPO_PUBLIC_* at build time; tests set it). */
const webClientId = () => process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

/** Sign-in couldn't start or failed; `message` is ready to show. */
export class GoogleSignInFailed extends Error {}

type Lib = typeof import("react-native-nitro-google-signin");
let lib: Lib | null = null;
let configured = false;

function load(): Lib {
  if (!webClientId()) throw new GoogleSignInFailed("Google sign-in isn’t set up yet. Use your email for now.");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lib ??= require("react-native-nitro-google-signin") as Lib;
  } catch {
    throw new GoogleSignInFailed("Google sign-in needs the full Clipiro app build.");
  }
  if (!configured) {
    lib.GoogleOneTapSignIn.configure({ webClientId: webClientId() });
    configured = true;
  }
  return lib;
}

/**
 * Shows Google's account picker and returns the ID token, or null if the
 * user backed out. Tries the quiet one-tap path first (accounts already used
 * with Clipiro), then the full picker.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  const { GoogleOneTapSignIn, isErrorWithCode, statusCodes } = load();
  try {
    await GoogleOneTapSignIn.checkPlayServices();
    let res = await GoogleOneTapSignIn.signIn();
    if (res.type === "noSavedCredentialFound") res = await GoogleOneTapSignIn.createAccount();
    if (res.type !== "success" || !res.data) return null;
    return res.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new GoogleSignInFailed("Google sign-in needs Google Play services. Update them and try again.");
      if (e.code === statusCodes.DEVELOPER_ERROR) throw new GoogleSignInFailed("Google sign-in isn’t set up for this build yet. Use your email for now.");
    }
    throw new GoogleSignInFailed("Google sign-in didn’t work. Try again, or use your email.");
  }
}

/** Forget the Google account choice, so the next sign-in shows the picker. Never throws. */
export async function googleSignOut() {
  if (!configured || !lib) return;
  await lib.GoogleOneTapSignIn.signOut().catch(() => {});
}
