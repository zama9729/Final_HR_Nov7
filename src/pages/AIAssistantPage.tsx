import { AppLayout } from "@/components/layout/AppLayout";
import { UnifiedAssistantWorkspace } from "@/components/UnifiedAssistantWorkspace";

export default function AIAssistantPage() {
  return (
    <AppLayout>
      <div className="max-w-[1200px] mx-auto h-full">
        <UnifiedAssistantWorkspace />
      </div>
    </AppLayout>
  );
}
