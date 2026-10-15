import FaceSwapTool from "@/app/components/FaceSwapTool";

export const metadata = { title: "AI Face Swap" };

export default function FaceSwapPage() {
  return (
    <div className="min-h-full bg-surface-2">
      <FaceSwapTool />
    </div>
  );
}
