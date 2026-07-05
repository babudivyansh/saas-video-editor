// No in-app messaging/notifications system exists yet — an honest empty state
// rather than inventing a fake feed. If a cheap real signal is added later
// (e.g. "plan expires soon", "payment received" derived from existing fields),
// it belongs here.

function IcMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </svg>
  );
}

export default function MessagePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Message</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-4 py-24">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
          <IcMessage />
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-700">No messages yet</p>
          <p className="text-sm text-gray-400 mt-1">Account notifications will show up here.</p>
        </div>
      </div>
    </div>
  );
}
