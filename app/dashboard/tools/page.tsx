"use client";
import { useTranslations } from "next-intl";
import { Card, type CardTint } from "@/app/components/ui/Card";
import { ToolCard } from "@/app/components/ui/ToolCard";
import {
  ImageGenPreview,
  VoiceoverPreview,
  SpeechEnhancerPreview,
  VideoGenPreview,
  VocalRemoverPreview,
  BrainstormerPreview,
  RedditPreview,
  FakeTextsPreview,
} from "@/app/components/dashboard/toolPreviews";

function IcArrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}

// ── Top-row card icons ─────────────────────────────────────────────────────────
function IcSmile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
}
function IcYoutube() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>;
}
function IcInstagram() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>;
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ToolsPage() {
  const t = useTranslations("Tools");

  const topCards: { icon: React.ReactNode; title: string; desc: string; color: string; tint: CardTint; href: string }[] = [
    { icon: <IcSmile />, title: t("topCards.freeTools.title"), desc: t("topCards.freeTools.desc"), color: "text-warning", tint: "amber", href: "/dashboard/tools/free" },
    { icon: <IcYoutube />, title: t("topCards.youtubeDownloader.title"), desc: t("topCards.youtubeDownloader.desc"), color: "text-error", tint: "rose", href: "/dashboard/tools/youtube-downloader" },
    { icon: <IcInstagram />, title: t("topCards.instagramDownloader.title"), desc: t("topCards.instagramDownloader.desc"), color: "text-accent-pink", tint: "fuchsia", href: "/dashboard/tools/instagram-downloader" },
  ];

  const tools = [
    { title: t("items.imageGenerator.title"), desc: t("items.imageGenerator.desc"), preview: <ImageGenPreview />, badge: t("credits", { count: 1 }), href: "/dashboard/tools/image-generator" },
    { title: t("items.voiceover.title"), desc: t("items.voiceover.desc"), preview: <VoiceoverPreview />, badge: t("credits", { count: 1 }), href: "/dashboard/tools/voiceover" },
    { title: t("items.speechEnhancer.title"), desc: t("items.speechEnhancer.desc"), preview: <SpeechEnhancerPreview />, badge: t("credits", { count: 3 }), href: "/dashboard/tools/enhance-speech" },
    { title: t("items.videoGenerator.title"), desc: t("items.videoGenerator.desc"), preview: <VideoGenPreview />, badge: t("credits", { count: 20 }), href: "/dashboard/tools/video-generator" },
    { title: t("items.vocalRemover.title"), desc: t("items.vocalRemover.desc"), preview: <VocalRemoverPreview />, badge: t("credits", { count: 2 }), href: "/dashboard/tools/vocal-remover" },
    { title: t("items.brainstormer.title"), desc: t("items.brainstormer.desc"), preview: <BrainstormerPreview />, badge: t("credits", { count: 1 }), href: "/dashboard/tools/brainstormer" },
    { title: t("items.redditVideo.title"), desc: t("items.redditVideo.desc"), preview: <RedditPreview />, badge: t("credits", { count: 2 }), href: "/dashboard/create/reddit-video" },
    { title: t("items.fakeTexts.title"), desc: t("items.fakeTexts.desc"), preview: <FakeTextsPreview />, badge: t("credits", { count: 2 }), href: "/dashboard/create/text-video" },
  ];

  return (
    <>
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-6">

          {/* ── Page header ── */}
          <div className="pt-2">
            <h1 className="text-2xl font-extrabold grad-text inline-block">{t("pageTitle")}</h1>
            <p className="text-sm text-ink-soft mt-1">{t("pageSubtitle")}</p>
          </div>

          {/* ── Top row cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {topCards.map((c, i) => (
              <Card key={i} tint={c.tint} href={c.href} className="flex items-center gap-3 px-5 py-3.5">
                <div className={`w-9 h-9 rounded-xl bg-panel shadow-sm flex items-center justify-center flex-shrink-0 ${c.color}`}>
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink font-bold text-sm leading-tight">{c.title}</p>
                  <p className="text-ink-soft text-xs mt-0.5 truncate">{c.desc}</p>
                </div>
                <span className="text-ink-soft/40 flex-shrink-0"><IcArrow /></span>
              </Card>
            ))}
          </div>

          {/* ── Tools grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {tools.map((tool, i) => (
              <ToolCard key={i} size="md" cta={t("getStarted")} {...tool} />
            ))}
          </div>
        </div>
    </>
  );
}
