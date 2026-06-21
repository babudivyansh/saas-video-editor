"use client";

import ToolsSidebar from "@/app/components/ToolsSidebar";

export default function AssetsPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="assets" />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Assets</h1>
              <p className="text-sm text-gray-500">Your uploaded videos, images, and audio files</p>
            </div>
          </div>
        </div>

        {/* Coming Soon */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Assets Library</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              A central place for all your uploaded videos, images, and audio files. Access your media from any tool without re-uploading.
            </p>
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-50 text-purple-600 text-sm font-semibold">
              ✦ Coming Soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
