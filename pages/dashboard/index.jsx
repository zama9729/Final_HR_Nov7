import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "@/components/Dashboard";
import Sidebar from "@/components/Layout/Sidebar";
import Topbar from "@/components/Layout/Topbar";
import { fetchDashboardSummary } from "@/lib/api";

const queryClient = new QueryClient();

export default function DashboardPage({ initialSummary }) {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-[var(--color-bg)]">
        <Sidebar />
        <div className="flex-1" style={{ marginLeft: "var(--sidebar-width)" }}>
          <Topbar />
          <Dashboard initialSummary={initialSummary} />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export async function getServerSideProps() {
  try {
    const initialSummary = await fetchDashboardSummary();
    return { props: { initialSummary } };
  } catch {
    return { props: { initialSummary: null } };
  }
}

