import { AppLayout } from "@/components/layout/AppLayout";
import EnhancedOrgChart from "@/components/org-chart/EnhancedOrgChart";

export default function OrgChartPage() {
  return (
    <AppLayout>
      <div className="space-y-6 px-3 py-6 sm:px-6 lg:px-10">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Organization structure</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Organization Chart</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Interactive view of your organization's reporting structure
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_25px_70px_rgba(15,23,42,0.15)] dark:shadow-[0_25px_70px_rgba(2,8,20,0.45)] overflow-hidden">
          <EnhancedOrgChart />
        </div>
      </div>
    </AppLayout>
  );
}
