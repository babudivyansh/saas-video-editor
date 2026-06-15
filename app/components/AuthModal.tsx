"use client";

import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";

export default function AuthModal() {
  const { authModal, closeAuthModal, refreshUser } = useAuth();

  if (!authModal.isOpen) return null;

  const handleSuccess = async (token: string) => {
    // Refresh user state in AuthContext
    await refreshUser();
    closeAuthModal();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={closeAuthModal}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-[760px] min-h-[520px] flex rounded-2xl shadow-2xl overflow-hidden bg-white max-h-[90vh]">
        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 z-50 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          aria-label="Close authentication window"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Auth Form (Left sliding panel inside AuthForm) */}
        <div className="flex-1 overflow-y-auto max-h-[90vh]">
          <AuthForm 
            initialMode={authModal.mode} 
            onSuccess={handleSuccess}
            isModalContext={true}
          />
        </div>

        {/* Right panel (Desktop only) */}
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
    </div>
  );
}
