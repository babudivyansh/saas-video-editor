"use client";
import ToolsSidebar, { ToolsTopbar } from "@/app/components/ToolsSidebar";
import AudioBalancerTool from "@/app/components/AudioBalancerTool";
import { useAuth } from "@/app/components/AuthContext";

export default function AudioBalancerPage() {
  const { user, openAuthModal } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white">
        <ToolsTopbar />
        <div className="relative">
          <AudioBalancerTool />
          {!user && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-lg px-8 py-8 flex flex-col items-center text-center max-w-sm mx-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-blue-600">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </div>
                <h3 className="text-[17px] font-bold text-gray-900 leading-tight">Sign in to use this tool</h3>
                <p className="text-sm text-gray-500 mt-2">Create a free account to start balancing audio files.</p>
                <button
                  onClick={() => openAuthModal("login")}
                  className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuthModal("register")}
                  className="mt-2 w-full border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  Create Free Account
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
