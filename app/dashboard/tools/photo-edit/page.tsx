import { Suspense } from "react";
import PhotoEditTool from "@/app/components/PhotoEditTool";

export const metadata = { title: "AI Photo Editor" };

// Suspense: the workspace reads ?asset= (the Library's "Edit with AI").
export default function PhotoEditPage() {
  return (
    <Suspense>
      <PhotoEditTool />
    </Suspense>
  );
}
