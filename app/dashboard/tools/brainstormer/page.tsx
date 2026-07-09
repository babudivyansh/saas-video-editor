import BrainstormerTool from "@/app/components/BrainstormerTool";

export const metadata = { title: "AI Brainstormer – Clipiro" };

export default function BrainstormerPage() {
  return (
    <div className="min-h-full bg-slate-50">
      <BrainstormerTool />
    </div>
  );
}
