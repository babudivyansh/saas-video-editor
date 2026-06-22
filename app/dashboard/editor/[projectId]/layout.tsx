// Full-screen editor layout — strips the shared SiteNavbar/ToolsSidebar
// so the editor canvas has the entire viewport.
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#0d0d0f" }}>
      {children}
    </div>
  );
}
