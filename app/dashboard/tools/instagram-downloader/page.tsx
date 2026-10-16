import DownloaderTool from "@/app/components/DownloaderTool";

export const metadata = { title: "Instagram Downloader" };

function IcInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

// Instagram's own brand gradient, for the platform mark only.
const IG_GRADIENT = "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)";

export default function InstagramDownloaderPage() {
  return (
    <DownloaderTool
      slug="instagram-downloader"
      title="Instagram Downloader"
      formatsLine="Reels, posts & IGTV"
      intro="Paste a link to a public Instagram reel, post or IGTV video to download it, or just the audio as MP3."
      urlLabel="Instagram link"
      placeholder="https://www.instagram.com/reel/..."
      examples={["https://www.instagram.com/reel/...", "https://www.instagram.com/p/...", "https://www.instagram.com/tv/..."]}
      icon={<IcInstagram />}
      iconBackground={IG_GRADIENT}
      authorPrefix="@"
      footnote="Only public posts and reels can be downloaded. Keep this tab open until the download starts."
    />
  );
}
