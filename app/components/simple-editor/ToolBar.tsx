"use client";

interface Tool {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    id: "trim",
    label: "Trim",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    id: "crop",
    label: "Crop",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.13 1L6 16a2 2 0 002 2h15"/><path d="M1 6.13L16 6a2 2 0 012 2v15"/>
      </svg>
    ),
  },
  {
    id: "text",
    label: "Text",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
      </svg>
    ),
  },
  {
    id: "volume",
    label: "Volume",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>
      </svg>
    ),
  },
  {
    id: "speed",
    label: "Speed",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    id: "rotate",
    label: "Rotate",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
      </svg>
    ),
  },
];

interface Props {
  active: string | null;
  onSelect: (id: string | null) => void;
}

export default function ToolBar({ active, onSelect }: Props) {
  return (
    <div className="flex items-center gap-1 px-4 py-2 border-t border-white/5">
      {TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => onSelect(active === tool.id ? null : tool.id)}
          aria-label={tool.label}
          className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
            active === tool.id
              ? "bg-[#7C3AED]/20 text-[#7C3AED]"
              : "text-gray-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {tool.icon}
          {tool.label}
        </button>
      ))}
    </div>
  );
}
