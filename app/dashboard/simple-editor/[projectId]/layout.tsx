export default function SimpleEditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "#0A0A0F" }}>
      {children}
    </div>
  );
}
