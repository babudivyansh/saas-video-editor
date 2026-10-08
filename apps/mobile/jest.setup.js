// The root layout waits for the Geist fonts before rendering anything.
// Fonts never load under Jest, so report them as loaded.
jest.mock("@expo-google-fonts/geist", () => ({
  useFonts: () => [true, null],
  Geist_400Regular: 1,
  Geist_500Medium: 1,
  Geist_600SemiBold: 1,
  Geist_700Bold: 1,
  Geist_800ExtraBold: 1,
}));
jest.mock("@expo-google-fonts/geist-mono", () => ({
  GeistMono_400Regular: 1,
  GeistMono_500Medium: 1,
  GeistMono_600SemiBold: 1,
}));

// The Android Keystore, as an in-memory map (src/lib/api.ts keeps the tokens there).
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

// Native Google sign-in (a Nitro module: not in Jest). Tests set what the picker returns.
jest.mock("react-native-nitro-google-signin", () => ({
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(async () => {}),
    signIn: jest.fn(async () => ({ type: "noSavedCredentialFound", data: null })),
    createAccount: jest.fn(async () => ({ type: "cancelled", data: null })),
    signOut: jest.fn(async () => {}),
  },
  statusCodes: { SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED", PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE", DEVELOPER_ERROR: "DEVELOPER_ERROR" },
  isErrorWithCode: (e) => !!e && typeof e === "object" && "code" in e,
}));

// expo-file-system (native). Upload tests swap the whole file layer
// (setUploadIO); this only lets modules that import it load.
jest.mock("expo-file-system", () => {
  class File {
    constructor(...parts) {
      this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
      this.exists = false;
      this.size = 0;
    }
  }
  return { File, Paths: { document: { uri: "file:///doc" }, cache: { uri: "file:///cache" } } };
});

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
