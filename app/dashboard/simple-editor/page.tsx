"use client";

// The Simple Video Editor uses browser-only APIs (createObjectURL, Canvas, MediaRecorder)
// so it must be loaded client-side only.
import dynamic from "next/dynamic";

const SimpleVideoEditor = dynamic(
  () => import("@/app/components/simple-editor/SimpleVideoEditor"),
  { ssr: false, loading: () => (
    <div className="h-screen bg-[#0A0A0F] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-[#7C3AED]/30 border-t-[#7C3AED] animate-spin" />
    </div>
  )},
);

export default function SimpleEditorPage() {
  return <SimpleVideoEditor />;
}
