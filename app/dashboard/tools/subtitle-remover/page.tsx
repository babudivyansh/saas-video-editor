import SubtitleRemoverTool from "@/app/components/SubtitleRemoverTool";

export const metadata = { title: "Subtitle Remover" };

export default function SubtitleRemoverPage() {
  return (
    <div className="min-h-full bg-surface-2">
      <SubtitleRemoverTool />
    </div>
  );
}
