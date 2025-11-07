import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { AIAssistant } from "@/components/AIAssistant";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
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
