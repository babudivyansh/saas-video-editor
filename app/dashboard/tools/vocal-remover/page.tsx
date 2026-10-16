import VocalRemoverTool from "@/app/components/VocalRemoverTool";

export const metadata = { title: "AI Vocal Remover" };

export default function VocalRemoverPage() {
  return (
    <div className="min-h-full bg-surface-2">
      <VocalRemoverTool />
    </div>
  );
}
