import DownloaderTool from "@/app/components/DownloaderTool";

export const metadata = { title: "YouTube Downloader" };

function IcYoutube() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
      <path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" />
    </svg>
  );
}

export default function YouTubeDownloaderPage() {
  return (
    <DownloaderTool
      slug="youtube-downloader"
      title="YouTube Downloader"
      formatsLine="MP4 & MP3"
      intro="Paste a YouTube link to download the video in your chosen quality, or just the audio as MP3. Videos up to 20 minutes."
      urlLabel="YouTube link"
      placeholder="https://www.youtube.com/watch?v=..."
      examples={["https://www.youtube.com/watch?v=...", "https://youtu.be/...", "https://youtube.com/shorts/..."]}
      icon={<IcYoutube />}
      iconBackground="#ff0033"
      footnote="Large videos can take a minute. Keep this tab open until the download starts."
    />
  );
}
