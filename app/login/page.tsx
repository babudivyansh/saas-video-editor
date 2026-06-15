"use client";
import { useRouter } from "next/navigation";
import AuthForm from "@/app/components/AuthForm";

function BlurredBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100" />
      <div className="absolute inset-0 blur-sm opacity-70">
        <div className="absolute top-0 left-0 right-0 h-14 bg-white/80 border-b border-gray-200" />
        <div className="absolute top-14 left-0 w-52 bottom-0 bg-white/60 border-r border-gray-200" />
        <div className="absolute top-24 left-60 w-72 h-36 bg-indigo-600/80 rounded-xl" />
        <div className="absolute top-24 left-60 right-8 h-8 bg-indigo-700/60 rounded-lg ml-80" />
        <div className="absolute top-36 left-60 right-8 h-8 bg-blue-500/40 rounded-lg ml-80" />
        <div className="absolute top-48 left-60 right-8 h-8 bg-indigo-400/30 rounded-lg ml-80" />
        <div className="absolute bottom-32 left-60 w-48 h-28 bg-white/70 rounded-xl border border-gray-200" />
        <div className="absolute bottom-32 left-60 ml-56 w-48 h-28 bg-white/70 rounded-xl border border-gray-200" />
        <div className="absolute bottom-8 left-60 flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 opacity-70" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 backdrop-blur-sm bg-white/30" />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/dashboard");
  };

  const handleModeToggle = (mode: "login" | "register") => {
    router.push(mode === "login" ? "/login" : "/register");
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <BlurredBackground />

      <div className="relative z-10 w-full max-w-[760px] min-h-[520px] flex rounded-2xl shadow-2xl overflow-hidden bg-white">
        <AuthForm 
          initialMode="login" 
          onSuccess={handleSuccess} 
          onModeToggle={handleModeToggle}
        />

        {/* Right panel */}
        <div className="hidden sm:flex w-72 flex-shrink-0 bg-[#f0f5ff] flex-col items-center justify-center p-8 border-l border-blue-100/30">
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm w-full border border-gray-100">
            <div className="w-14 h-14 rounded-full bg-[#2563eb] flex items-center justify-center mx-auto mb-4 shadow-sm">
              <svg className="w-7 h-7 text-white" viewBox="0 0 40 40" fill="none">
                <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M22 10L28 13V27L22 30V10Z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                <circle cx="25" cy="20" r="1.5" fill="white" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed font-medium">
              Get started in seconds. Login or create an account now.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
