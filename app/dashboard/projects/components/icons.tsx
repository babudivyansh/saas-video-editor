// Line icons for the projects and clips pages (24px grid, currentColor).

type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IcPlus = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M12 5v14M5 12h14" /></svg>;
export const IcHeart = ({ className = "w-4 h-4", filled }: P & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? "currentColor" : "none"}><path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z" /></svg>
);
export const IcThumbDown = ({ className = "w-4 h-4", filled }: P & { filled?: boolean }) => (
  <svg {...base} className={className} fill={filled ? "currentColor" : "none"}><path d="M7 13V4M7 13l4 7a2 2 0 0 0 2-2v-4h5a2 2 0 0 0 2-2.3l-1.2-6A2 2 0 0 0 16.8 4H7M7 13H4V4h3" /></svg>
);
export const IcFolder = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const IcFolderPlus = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5" /></svg>;
export const IcMore = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
export const IcUpload = ({ className = "w-5 h-5" }: P) => <svg {...base} className={className}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;
export const IcSearch = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IcFilm = ({ className = "w-5 h-5" }: P) => <svg {...base} className={className}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 12h18M3 7.5h4M17 7.5h4M3 16.5h4M17 16.5h4" /></svg>;
export const IcGrid = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><rect x="4" y="4" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" /></svg>;
export const IcList = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>;
export const IcFilter = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>;
export const IcSort = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M4 6h10M4 12h7M4 18h4M17 8V20M14 17l3 3 3-3" /></svg>;
export const IcDownload = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>;
export const IcCalendar = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>;
export const IcCopy = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
export const IcXml = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M10 13l-2 2 2 2M14 13l2 2-2 2" /></svg>;
export const IcEdit = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>;
export const IcPlay = ({ className = "w-5 h-5" }: P) => <svg {...base} className={className} fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
export const IcChevronUp = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="m6 15 6-6 6 6" /></svg>;
export const IcChevronDown = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="m6 9 6 6 6-6" /></svg>;
export const IcClose = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IcCaptions = ({ className = "w-4 h-4" }: P) => <svg {...base} className={className}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3" /></svg>;
