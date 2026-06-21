"use client";

import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";

export default function AuthModal() {
  const { authModal, closeAuthModal, refreshUser } = useAuth();
  const { feature, isFree } = authModal;

  if (!authModal.isOpen) return null;

  const handleSuccess = async (token: string) => {
    await refreshUser();
    closeAuthModal();
    // If opened from the pricing page (feature = plan name, not a free tool), go to billing
    const dest = feature && !isFree ? "/billing" : "/dashboard";
    window.location.href = dest;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={isFree ? undefined : closeAuthModal}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-[760px] min-h-[520px] flex rounded-2xl shadow-2xl overflow-hidden bg-white max-h-[90vh]">
        {/* Close Button — hidden for free tools (sign-in required) */}
        {!isFree && (
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 z-50 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            aria-label="Close authentication window"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Auth Form (Left sliding panel inside AuthForm) */}
        <div className="flex-1 overflow-y-auto max-h-[90vh]">
          <AuthForm 
            initialMode={authModal.mode} 
            onSuccess={handleSuccess}
            isModalContext={true}
          />
        </div>

        {/* Right panel (Desktop only) */}
        <div className={`hidden sm:flex w-72 flex-shrink-0 flex-col items-center justify-center p-8 border-l ${isFree ? "bg-[#f0fff4] border-green-100/30" : "bg-[#f0f5ff] border-blue-100/30"}`}>
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm w-full border border-gray-100">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm ${isFree ? "bg-[#16a34a]" : "bg-[#2563eb]"}`}>
              {isFree ? (
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="currentColor" fillOpacity="0.2" stroke="currentColor"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              ) : (
                <svg className="w-7 h-7 text-white" viewBox="0 0 40 40" fill="none">
                  <path d="M22 10H13C12.4477 10 12 10.4477 12 11V29C12 29.5523 12.4477 30 13 30H22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M22 10L28 13V27L22 30V10Z" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
                  <circle cx="25" cy="20" r="1.5" fill="white" />
                </svg>
              )}
            </div>
            {isFree && feature ? (
              <>
                <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2">
                  Free Tool
                </p>
                <p className="text-[15px] text-gray-900 font-bold leading-snug mb-2">
                  {feature}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  This tool is completely free — just sign in to get started.
                </p>
              </>
            ) : feature ? (
              <>
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-2">
                  Premium Feature
                </p>
                <p className="text-[15px] text-gray-900 font-bold leading-snug mb-2">
                  {feature}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Sign in to continue and unlock all premium tools.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                Get started in seconds. Login or create an account now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
