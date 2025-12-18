import React, { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import AdvancedOrgChart from "@/components/org-chart/AdvancedOrgChart";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";
import { api } from "@/lib/api";

class OrgChartErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    console.error("[OrgChart] rendering error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-sm text-red-600">
          There was a problem rendering the organization chart. Please refresh the page or contact your admin.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function OrgChartPage() {
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const data = await api.getOrgStructure();
      const blob = new Blob([JSON.stringify(data ?? [], null, 2)], {
        type: "application/json;charset=utf-8;",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `org-chart-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export org chart", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#F9FBFF] px-3 py-6 sm:px-6 lg:px-10">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#2E3A59]">Organization Chart</h1>
            <p className="text-sm text-slate-600 mt-1">
              Manage your organization&apos;s workforce.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees by name or email…"
                className="pl-9 rounded-full bg-white shadow-sm border-slate-200"
              />
            </div>
            <Button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#FF4B4B] px-4 py-2 text-sm font-medium text-white shadow-sm transition-transform duration-150 ease-in-out hover:scale-105 hover:bg-[#ff3030] sm:mt-0"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export"}
            </Button>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/60 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] overflow-hidden">
          <OrgChartErrorBoundary>
            <AdvancedOrgChart searchQuery={search} />
          </OrgChartErrorBoundary>
        </div>
      </div>
    </AppLayout>
  );
}
