import type { ImageSource } from "expo-image";

// Mock data refers to the bundled sample photos as "asset:<name>"; real API
// data is an https URL. Screens pass every image URL through here.
const ASSETS = {
  clapper: require("../../assets/images/clapper.jpg"),
  "creator-denim": require("../../assets/images/creator-denim.jpg"),
  "creator-golden": require("../../assets/images/creator-golden.jpg"),
  "creator-hat": require("../../assets/images/creator-hat.jpg"),
  "creator-smile": require("../../assets/images/creator-smile.jpg"),
  "creator-violet": require("../../assets/images/creator-violet.jpg"),
  "dj-neon": require("../../assets/images/dj-neon.jpg"),
  "founder-portrait": require("../../assets/images/founder-portrait.jpg"),
  "gym-lift": require("../../assets/images/gym-lift.jpg"),
  "podcast-mic": require("../../assets/images/podcast-mic.jpg"),
  "studio-mic": require("../../assets/images/studio-mic.jpg"),
  "travel-summit": require("../../assets/images/travel-summit.jpg"),
} as const;

export type SampleImage = keyof typeof ASSETS;

export function imageSource(url: string): ImageSource | number {
  if (url.startsWith("asset:")) return ASSETS[url.slice(6) as SampleImage] ?? { uri: "" };
  return { uri: url };
}

/** A bundled sample photo, for decorative imagery that isn't user data. */
export const sample = (name: SampleImage) => ASSETS[name];
