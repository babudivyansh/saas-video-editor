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
    delete() {}
    static async downloadFileAsync(url, dest) {
      return { uri: dest.uri, exists: true };
    }
  }
  return { File, Paths: { document: { uri: "file:///doc" }, cache: { uri: "file:///cache" } } };
});

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));

// expo-notifications (native). Tests set the permission answers they need.
jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: "undetermined", canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted", canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[test-phone]" })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// expo-video, expo-media-library, expo-sharing (native).
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  const player = () => ({ play: jest.fn(), pause: jest.fn(), replace: jest.fn(), currentTime: 0, playbackRate: 1, volume: 1, loop: false, timeUpdateEventInterval: 0 });
  return { useVideoPlayer: jest.fn((_src, setup) => { const ref = require("react").useRef(null); if (!ref.current) { ref.current = player(); setup?.(ref.current); } return ref.current; }), VideoView: (props) => require("react").createElement(View, { testID: "video-view", ...props }) };
});
jest.mock("expo-media-library", () => {
  const album = { add: jest.fn(async () => {}) };
  return {
    requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
    Asset: { create: jest.fn(async (uri) => ({ id: `content://media/${uri}` })) },
    Album: { get: jest.fn(async () => null), create: jest.fn(async () => album) },
  };
});
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn(async () => {}) }));

// FlashList measures native views; in Jest every list is 400x900 and each
// item 100x100 (from its own jestSetup, which in 2.0.2 also swaps FlashList
// for an export that no longer exists — so only the measuring is mocked).
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => {
  const actual = jest.requireActual("@shopify/flash-list/dist/recyclerview/utils/measureLayout");
  const size = (w, h) => () => ({ x: 0, y: 0, width: w, height: h });
  return { ...actual, measureParentSize: jest.fn(size(400, 900)), measureFirstChildLayout: jest.fn(size(400, 900)), measureItemLayout: jest.fn(size(100, 100)) };
});

// expo-audio (native): one fake player that remembers what it was told.
jest.mock("expo-audio", () => {
  const player = { source: null, playing: false, listeners: [], replace: jest.fn((s) => (player.source = s)), play: jest.fn(() => (player.playing = true)), pause: jest.fn(() => (player.playing = false)), addListener: jest.fn((_e, fn) => player.listeners.push(fn)) };
  return { __player: player, createAudioPlayer: jest.fn(() => player) };
});
