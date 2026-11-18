// How AutoClip frames people in a vertical clip. Its own dependency-free
// module so client components can import the list without pulling in
// lib/reframe.ts (which builds the AWS Rekognition client at module scope).
//
//   auto    follow the scene: cuts for a conversation, a pan for one person
//   single  always one crop following the main face
//   split   two people stacked top and bottom
//   active  follow whoever is speaking
//   gaming  facecam on top, gameplay below (a stream with a webcam overlay)
export const SPEAKER_MODES = ["auto", "single", "split", "active", "gaming"] as const;
export type SpeakerMode = (typeof SPEAKER_MODES)[number];
