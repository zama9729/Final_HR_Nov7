import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Briefcase, CalendarRange } from "lucide-react";
import SummaryCard from "./SummaryCard";
import PayrollChart from "./PayrollChart";
import RevenueDonut from "./RevenueDonut";
import ScheduleTimeline from "./ScheduleTimeline";
import ActivityLog from "./ActivityLog";
import { fetchDashboardSummary, fetchPayroll, fetchRevenue, fetchSchedule, fetchActivity, exportDashboardCSV } from "@/lib/api";

const iconMap = {
  employees: Users,
  attendance: Building2,
  leave: CalendarRange,
  projects: Briefcase,
};

const defaultSummary = {
  totalEmployees: 0,
  totalAttendance: 0,
  leaveRequests: 0,
  totalProjects: 0,
  lastUpdated: "today",
};

export default function Dashboard({ initialSummary = defaultSummary }) {
  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: fetchDashboardSummary,
    initialData: initialSummary,
    refetchOnWindowFocus: false,
  });

  const payrollQuery = useQuery({
    queryKey: ["dashboard", "payroll", "monthly"],
    queryFn: () => fetchPayroll("monthly"),
  });

  const revenueQuery = useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: fetchRevenue,
  });

  const scheduleQuery = useQuery({
    queryKey: ["dashboard", "schedule"],
    queryFn: () =>
      fetchSchedule({
        start: new Date().toISOString().slice(0, 10),
        end: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      }),
  });

  const activityQuery = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: fetchActivity,
  });

  const summaryCards = useMemo(() => {
    const data = summaryQuery.data || initialSummary;
    return [
      {
        key: "employees",
        title: "Total Employees",
        value: data.totalEmployees?.toLocaleString(),
        trendLabel: "+4.2%",
        updatedAt: data.lastUpdated,
        gradient: "pink",
        icon: iconMap.employees,
      },
      {
        key: "attendance",
        title: "Attendance Today",
        value: data.totalAttendance?.toLocaleString(),
        trendLabel: "+2.1%",
        updatedAt: data.lastUpdated,
        gradient: "sun",
        icon: iconMap.attendance,
      },
      {
        key: "leave",
        title: "Leave Requests",
        value: data.leaveRequests?.toLocaleString(),
        trendLabel: "+1 new",
        trendVariant: "negative",
        updatedAt: data.lastUpdated,
        gradient: "blue",
        icon: iconMap.leave,
      },
      {
        key: "projects",
        title: "Active Projects",
        value: data.totalProjects?.toLocaleString(),
        trendLabel: "+3.7%",
        updatedAt: data.lastUpdated,
        gradient: "mint",
        icon: iconMap.projects,
      },
    ];
  }, [summaryQuery.data, initialSummary]);

  const handleExport = async () => {
    const blob = await exportDashboardCSV("monthly");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="min-h-screen bg-[var(--color-bg)] px-6 pb-10 pt-8 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white">
            Filters
          </button>
          <button
            onClick={handleExport}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
          >
            Export CSV
          </button>
        </div>
        <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm text-slate-500 shadow-inner">
          Good Morning, Zama!
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.key} {...card} />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <PayrollChart
          data={payrollQuery.data?.series || []}
          months={payrollQuery.data?.months || []}
        />
        <RevenueDonut data={revenueQuery.data?.categories || []} total={revenueQuery.data?.total || 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ScheduleTimeline schedule={scheduleQuery.data || []} />
        <ActivityLog items={activityQuery.data || []} />
      </div>
    </section>
  );
}

