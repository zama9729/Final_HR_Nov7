import { PayrollTopNavBar } from "./TopNavBar";

interface PayrollLayoutProps {
  children: React.ReactNode;
}

export function PayrollLayout({ children }: PayrollLayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <PayrollTopNavBar />
      {/* Spacer to account for fixed header */}
      <div className="h-16"></div>
      <main className="flex-1 p-2 lg:p-3 bg-muted/30 overflow-auto scroll-smooth">
        <div className="max-w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

