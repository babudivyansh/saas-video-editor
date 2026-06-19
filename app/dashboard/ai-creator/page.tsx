import { Suspense } from "react";
import AICreatorWizard from "@/app/components/AICreatorWizard";

export default function AICreatorPage() {
  return (
    <Suspense>
      <AICreatorWizard />
    </Suspense>
  );
}
