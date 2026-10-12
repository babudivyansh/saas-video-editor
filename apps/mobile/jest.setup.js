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
