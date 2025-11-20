import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { AIAssistant } from "@/components/AIAssistant";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { status, shouldGate } = useOrgSetup();
  const navigate = useNavigate();
  const showSetupBanner = shouldGate && status && !status.isCompleted;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          {showSetupBanner && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">Finish organization setup</p>
                <p className="text-sm text-amber-800">Complete the guided wizard to unlock the dashboard.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/setup")}>
                Resume setup
              </Button>
            </div>
          )}
          <main className="flex-1 p-2 lg:p-3 bg-muted/30 overflow-auto">
            <div className="max-w-full">
              {children}
            </div>
          </main>
        </div>
        <AIAssistant />
      </div>
    </SidebarProvider>
  );
}
