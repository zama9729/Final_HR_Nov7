import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CalendarIcon,
  TrendingUp,
  Users,
  MapPin,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { format, parseISO, isWeekend } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";

/* =========================
   Types
========================= */

interface OverviewData {
  total_employees: number;
  today_present: number;
  today_present_percent: number;
  on_time_percent: number;
  wfo_percent: number;
  wfh_percent: number;
  pending_approvals: number;
}

interface HistogramData {
  date: string;
  present: number;
  absent: number;
  late: number;
  wfo: number;
  wfh: number;
}

interface PendingApproval {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  submitted_at: string | null;
  total_hours: number;
  employee: {
    employee_id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  manager_first_name: string | null;
  manager_last_name: string | null;
  manager_email: string | null;
}

interface DepartmentPresence {
  group: string;
  averagePercentage: number;
}

/* =========================
   Tooltip
========================= */

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg p-3 shadow text-sm">
      <p className="font-semibold mb-2">
        {format(parseISO(label), "MMM dd, yyyy")}
      </p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/* =========================
   Component
========================= */

export default function AttendanceAnalytics() {
  const { toast } = useToast();
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [histogram, setHistogram] = useState<HistogramData[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  );
  const [departmentPresence, setDepartmentPresence] = useState<
    DepartmentPresence[]
  >([]);

  const [selectedPeriod, setSelectedPeriod] = useState("30");
  const [activeTab, setActiveTab] = useState<
    "timeline" | "trends" | "departments" | "approvals"
  >("timeline");
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
  });

  const allowedRoles = ["admin", "hr", "ceo", "director"];
  const canView = userRole ? allowedRoles.includes(userRole) : false;

  /* =========================
     Fetch Data
  ========================= */

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [dateRange, canView]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const from = format(dateRange.from, "yyyy-MM-dd");
      const to = format(dateRange.to, "yyyy-MM-dd");

      const [overviewRes, histogramRes, approvalsRes] = await Promise.all([
        api.getAttendanceOverview({ from, to }),
        api.getAttendanceHistogram({ from, to }),
        api.getPendingTimesheetApprovals({ from, to }),
      ]);

      setOverview(overviewRes);
      setHistogram(histogramRes.histogram || []);
      setPendingApprovals(approvalsRes.pending || []);

      try {
        const heatmapRes = await api.getAttendanceHeatmap({
          from,
          to,
          group_by: "department",
        } as any);

        const rows = Object.entries(
          (heatmapRes as any)?.heatmap || {}
        )
          .map(([group, days]: any) => {
            const values = Object.values(days || {});
            const total = values.reduce(
              (s: number, d: any) => s + (d.percentage || 0),
              0
            );
            const avg = values.length ? Number(total) / Number(values.length) : 0;
            return { group, averagePercentage: Math.round(avg) };
          })
          .filter((row) => {
            const groupName = row.group?.toLowerCase() || "";
            // Exclude "Executive" and "Unassigned" departments
            return (
              groupName !== "executive" &&
              groupName !== "unassigned" &&
              groupName.trim() !== ""
            );
          });

        rows.sort((a, b) => b.averagePercentage - a.averagePercentage);
        setDepartmentPresence(rows.slice(0, 4));
      } catch {
        setDepartmentPresence([]);
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message || "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Controls / Actions
  ========================= */

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    const today = new Date();
    const from = new Date(today);

    if (period === "7") {
      from.setDate(today.getDate() - 7);
    } else if (period === "15") {
      from.setDate(today.getDate() - 15);
    } else if (period === "30") {
      from.setDate(today.getDate() - 30);
    } else {
      // custom – do not change dateRange, user will pick
      return;
    }

    setDateRange({ from, to: today });
  };

  const exportCSV = () => {
    if (!histogram.length) return;

    const headers = ["Date", "Present", "Absent", "Late", "WFO", "WFH"];
    const rows = histogram.map((h) => [
      h.date,
      h.present,
      h.absent,
      h.late,
      h.wfo,
      h.wfh,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-analytics-${format(
      dateRange.from,
      "yyyy-MM-dd",
    )}-${format(dateRange.to, "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  /* =========================
     Derived Metrics
  ========================= */

  // Weekday-only view (ignore Saturdays/Sundays)
  const weekdayHistogram = useMemo(
    () =>
      histogram.filter((d) => {
        try {
          const dow = parseISO(d.date).getDay();
          return dow !== 0 && dow !== 6;
        } catch {
          return true;
        }
      }),
    [histogram]
  );

  const stats = useMemo(() => {
    if (!weekdayHistogram.length) return null;
    const days = weekdayHistogram.length;
    const sumPresent = weekdayHistogram.reduce(
      (s, h) => s + (h.present || 0),
      0
    );
    const sumAbsent = weekdayHistogram.reduce(
      (s, h) => s + (h.absent || 0),
      0
    );
    const sumLate = weekdayHistogram.reduce(
      (s, h) => s + (h.late || 0),
      0
    );
    const totalWFO = weekdayHistogram.reduce(
      (s, h) => s + (h.wfo || 0),
      0
    );
    const totalWFH = weekdayHistogram.reduce(
      (s, h) => s + (h.wfh || 0),
      0
    );
    const maxPresent = Math.max(...weekdayHistogram.map((h) => h.present || 0));
    const minPresent = Math.min(...weekdayHistogram.map((h) => h.present || 0));

    return {
      avgPresent: Math.round(sumPresent / days),
      avgAbsent: Math.round(sumAbsent / days),
      avgLate: Math.round(sumLate / days),
      totalWFO,
      totalWFH,
      maxPresent,
      minPresent,
    };
  }, [histogram]);

  // Calculate actual number of weekdays in the selected date range
  const totalWeekdays = useMemo(() => {
    let count = 0;
    const current = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sunday (0) and Saturday (6)
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }, [dateRange]);
  
  // Calculate days with WFO/WFH activity (actual calendar days, not employee-days)
  const wfoDays = useMemo(
    () => weekdayHistogram.filter((h) => (h.wfo || 0) > 0).length,
    [weekdayHistogram]
  );
  const wfhDays = useMemo(
    () => weekdayHistogram.filter((h) => (h.wfh || 0) > 0).length,
    [weekdayHistogram]
  );
  
  // Calculate employee-days for percentage calculation
  const wfoEmployeeDays = useMemo(
    () => weekdayHistogram.reduce((s, h) => s + (h.wfo || 0), 0),
    [weekdayHistogram]
  );
  const wfhEmployeeDays = useMemo(
    () => weekdayHistogram.reduce((s, h) => s + (h.wfh || 0), 0),
    [weekdayHistogram]
  );
  
  const totalEmployeeDays = wfoEmployeeDays + wfhEmployeeDays;
  const wfoPercentage = totalEmployeeDays > 0 
    ? Math.round((wfoEmployeeDays / totalEmployeeDays) * 100) 
    : 0;
  const wfhPercentage = totalEmployeeDays > 0 
    ? Math.round((wfhEmployeeDays / totalEmployeeDays) * 100) 
    : 0;

  const wfoWfhRatioData = [
    { name: "WFO", value: wfoEmployeeDays },
    { name: "WFH", value: wfhEmployeeDays },
  ].filter((d) => d.value > 0);

  const weekdayPresence = useMemo(() => {
    const byDay: Record<string, { p: number; t: number }> = {};
    weekdayHistogram.forEach((d) => {
      const day = format(parseISO(d.date), "EEEE");
      byDay[day] ??= { p: 0, t: 0 };
      byDay[day].p += d.present || 0;
      byDay[day].t += (d.present || 0) + (d.absent || 0);
    });
    return Object.entries(byDay)
      .map(([k, v]) => ({
        label: k,
        percentage: v.t ? Math.round((v.p / v.t) * 100) : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [weekdayHistogram]);

  // For timeline: percentage lines per day
  const timelineSeries = useMemo(() => {
    // Aggregate by month for smoother, month-wise histogram (counts)
    const byMonth: Record<string, { present: number; absent: number; late: number }> =
      {};

    weekdayHistogram.forEach((d) => {
      const monthKey = format(parseISO(d.date), "yyyy-MM");
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { present: 0, absent: 0, late: 0 };
      }
      byMonth[monthKey].present += d.present || 0;
      byMonth[monthKey].absent += d.absent || 0;
      byMonth[monthKey].late += d.late || 0;
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .map(([monthKey, v]) => ({
        month: monthKey,
        present: v.present,
        absent: v.absent,
        late: v.late,
      }));
  }, [weekdayHistogram]);

  // Top-3 days by absences / lateness based on histogram
  const topAbsentDays = useMemo(
    () =>
      [...weekdayHistogram]
        .filter((d) => (d.absent || 0) > 0)
        .sort((a, b) => (b.absent || 0) - (a.absent || 0))
        .slice(0, 3),
    [weekdayHistogram]
  );

  const topLateDays = useMemo(
    () =>
      [...weekdayHistogram]
        .filter((d) => (d.late || 0) > 0)
        .sort((a, b) => (b.late || 0) - (a.late || 0))
        .slice(0, 3),
    [weekdayHistogram]
  );

  const aiInsights = useMemo(() => {
    const insights: { title: string; body: string }[] = [];

    if (weekdayHistogram.length) {
      const avgPresencePct =
        weekdayHistogram.reduce((sum, d) => {
          const total = (d.present || 0) + (d.absent || 0);
          if (!total) return sum;
          return sum + (d.present / total) * 100;
        }, 0) / weekdayHistogram.length;

      insights.push({
        title: "📈 Attendance health",
        body: `Average presence is around ${avgPresencePct.toFixed(
          0,
        )}% for the selected period.`,
      });
    }

    if (weekdayPresence.length) {
      const top = weekdayPresence[0];
      insights.push({
        title: "🏅 Strongest weekday",
        body: `${top.label} has the highest presence at about ${top.percentage}% in this range.`,
      });
    }

    if (wfoEmployeeDays + wfhEmployeeDays > 0) {
      const pct = Math.round((wfoEmployeeDays / (wfoEmployeeDays + wfhEmployeeDays)) * 100);
      insights.push({
        title: "🏢 Work pattern",
        body:
          pct > 70
            ? "Office-first attendance trend (most workdays are from office)."
            : pct < 40
            ? "Remote-heavy culture (most workdays are from home)."
            : "Balanced hybrid pattern between WFO and WFH.",
      });
    }

    const worstAbsent = [...weekdayHistogram].sort(
      (a, b) => (b.absent || 0) - (a.absent || 0)
    )[0];
    if (worstAbsent && worstAbsent.absent > 0) {
      insights.push({
        title: "⚠️ Peak out of office day",
        body: `${format(parseISO(worstAbsent.date), "dd MMM yyyy")} had ${
          worstAbsent.absent
        } employees out of office.`,
      });
    }

    return insights.slice(0, 4);
  }, [departmentPresence, wfoEmployeeDays, wfhEmployeeDays, weekdayPresence, weekdayHistogram]);

  /* =========================
     Guard
  ========================= */

  if (!canView) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Analytics</CardTitle>
              <CardDescription>Access restricted</CardDescription>
            </CardHeader>
            <CardContent>
              Only HR, Directors and Executives can view this page.
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  /* =========================
     Render
  ========================= */

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#F9FAFB] px-4 py-6 space-y-6">
        {/* Main header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-slate-900">
              <TrendingUp className="h-7 w-7 text-primary" />
              Attendance Analytics
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Real-time workforce insights and attendance metrics.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[170px] rounded-full bg-white border-slate-200 shadow-sm text-xs">
                <SelectValue placeholder="Last 30 days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="15">Last 15 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>

            {selectedPeriod === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[260px] justify-start text-left font-normal rounded-full border-slate-200 bg-white shadow-sm text-xs"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from && dateRange.to ? (
                      `${format(dateRange.from, "MMM dd")} - ${format(
                        dateRange.to,
                        "MMM dd, yyyy",
                      )}`
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      if (range?.from && range?.to) {
                        setDateRange({ from: range.from, to: range.to });
                      }
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}

            <Button
              onClick={exportCSV}
              disabled={!histogram.length}
              className="inline-flex items-center gap-1 rounded-full bg-[#FF4B4B] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#ff3030] hover:shadow-md transition-transform duration-150 ease-in-out hover:scale-105"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* 7 KPI summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {/* 1. Total Employees */}
              <KpiCard
                title="TOTAL EMPLOYEES"
                value={overview?.total_employees ?? 0}
                subtitle="Active workforce"
                trendLabel="Stable"
                trendIcon="neutral"
              />

              {/* 2. Today Present */}
              <KpiCard
                title="TODAY PRESENT"
                value={overview?.today_present ?? 0}
                subtitle={`${overview?.today_present_percent ?? 0}% of total`}
                trendLabel="vs last period"
                trendIcon="up"
              />

              {/* 3. On-Time % */}
              <KpiCard
                title="ON-TIME %"
                value={`${overview?.on_time_percent ?? 0}%`}
                subtitle="Employees arriving on time"
                trendLabel="Healthy"
                trendIcon="up"
              />

              {/* 4. Avg Daily Present */}
              <KpiCard
                title="AVG DAILY PRESENT"
                value={stats?.avgPresent ?? 0}
                subtitle={stats ? `Range ${stats.minPresent}–${stats.maxPresent}` : ""}
                trendLabel="Last period"
                trendIcon="up"
              />

              {/* 5. Avg Daily Absent */}
              <KpiCard
                title="AVG DAILY ABSENT"
                value={stats?.avgAbsent ?? 0}
                subtitle="Average absentees / day"
                trendLabel="Watch"
                trendIcon="down-negative"
              />

              {/* 6. Avg Daily Late */}
              <KpiCard
                title="AVG DAILY LATE"
                value={stats?.avgLate ?? 0}
                subtitle="Average late arrivals"
                trendLabel="Last 30 days"
                trendIcon="down-neutral"
              />

              {/* 7. WFO/WFH Ratio */}
              <KpiCard
                title="WFO / WFH RATIO"
                value={`${overview?.wfo_percent ?? 0}% / ${
                  overview?.wfh_percent ?? 0
                }%`}
                subtitle={`${wfoDays + wfhDays} active days`}
                trendLabel="Location mix"
                trendIcon="neutral"
              />
            </div>

            {/* Tabs strip */}
            <div className="mt-4 mb-2 flex flex-wrap gap-2 text-xs">
              <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
                <TabsList className="bg-transparent p-0 gap-1 h-auto">
                  <TabsTrigger
                    value="timeline"
                    className="rounded-full bg-white px-3 py-1 data-[state=active]:bg-[#2F80ED] data-[state=active]:text-white text-slate-600 text-xs"
                  >
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger
                    value="trends"
                    className="rounded-full bg-white px-3 py-1 text-slate-500 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                  >
                    Trends
                  </TabsTrigger>
                  <TabsTrigger
                    value="departments"
                    className="rounded-full bg-white px-3 py-1 text-slate-500 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                  >
                    Departments
                  </TabsTrigger>
                  <TabsTrigger
                    value="approvals"
                    className="rounded-full bg-white px-3 py-1 text-slate-500 data-[state=active]:bg-slate-800 data-[state=active]:text-white"
                  >
                    Approvals
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Middle 3-column charts – shown on Timeline + Trends */}
            {(activeTab === "timeline" || activeTab === "trends") && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Attendance Overview */}
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Attendance Overview
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Present, absent and late for each day in the selected range.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {weekdayHistogram.length ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={weekdayHistogram}
                          margin={{ top: 10, right: 16, left: 0, bottom: 24 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => format(parseISO(v), "MMM d")}
                          />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="present" name="Present" stackId="a" fill="#10b981" />
                          <Bar dataKey="absent" name="Absent" stackId="a" fill="#ef4444" />
                          <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-xs text-slate-500">
                      No attendance data for this range.
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-emerald-600 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Attendance is{" "}
                    {stats && stats.avgPresent > 0
                      ? "stable over the selected period."
                      : "awaiting enough data to analyze."}
                  </p>
                </CardContent>
              </Card>

              {/* Department-wise Presence */}
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Department-wise Presence
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Top departments by average presence rate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  {departmentPresence.length ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={departmentPresence}
                          layout="vertical"
                          margin={{ top: 10, right: 24, left: 40, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                          <YAxis
                            dataKey="group"
                            type="category"
                            tick={{ fontSize: 11 }}
                            width={80}
                          />
                          <Tooltip
                            formatter={(v: any) => [`${v}%`, "Presence rate"]}
                          />
                          <Bar dataKey="averagePercentage" radius={[0, 8, 8, 0]}>
                            {departmentPresence.map((_, i) => (
                              <Cell
                                key={i}
                                fill={["#3b82f6", "#10b981", "#6366f1", "#f97316"][i] || "#3b82f6"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

            {/* WFO vs WFH Donut */}
            <Card className="rounded-2xl border-slate-200 shadow-sm flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  WFO vs WFH Trend
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Distribution of workdays by work location.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1 flex-1 flex flex-col items-center justify-center py-4">
                {wfoWfhRatioData.length ? (
                  <div className="flex flex-col items-center gap-4 w-full">
                    <div className="relative h-48 w-48 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={wfoWfhRatioData}
                            dataKey="value"
                            innerRadius={65}
                            outerRadius={85}
                            paddingAngle={3}
                            startAngle={90}
                            endAngle={-270}
                          >
                            {wfoWfhRatioData.map((entry, idx) => (
                              <Cell
                                key={entry.name}
                                fill={idx === 0 ? "#3b82f6" : "#8b5cf6"}
                              />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center label */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="text-2xl font-bold text-slate-900">
                          {wfoPercentage}%
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          WFO
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#3b82f6]" />
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{wfoPercentage}%</span>
                          <span className="text-slate-500">{wfoDays} of {totalWeekdays} days</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-[#8b5cf6]" />
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900">{wfhPercentage}%</span>
                          <span className="text-slate-500">{wfhDays} of {totalWeekdays} days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] text-slate-400">
                    No work location data for this period.
                  </div>
                )}
              </CardContent>
            </Card>
              </div>
            )}

            {/* Lower section: mini cards + timeline + AI insights (Timeline tab only) */}
            {activeTab === "timeline" && (
              <div className="grid grid-cols-1 xl:grid-cols-[2.1fr_0.9fr] gap-4">
              <div className="space-y-4">
                {/* 4 mini insight cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Top 3 departments */}
                  <Card className="rounded-2xl border-slate-200 shadow-sm h-[130px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Top 3 Departments with Highest Attendance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px] space-y-1.5">
                      {departmentPresence.slice(0, 3).map((d, idx) => (
                        <div
                          key={d.group}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
                        >
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <span className="text-[10px] font-semibold text-slate-500">
                              #{idx + 1}
                            </span>
                            {d.group}
                          </span>
                          <span className="font-semibold text-emerald-600">
                            {d.averagePercentage}%
                          </span>
                        </div>
                      ))}
                      {!departmentPresence.length && (
                        <p className="text-slate-500">
                          Rankings will appear once department attendance is available.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Best performing department */}
                  <Card className="rounded-2xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Best Performing Department
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px] space-y-1.5">
                      {departmentPresence[0] && (
                        <>
                          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-2 py-1.5">
                            <span className="font-medium text-emerald-900">
                              {departmentPresence[0].group}
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {departmentPresence[0].averagePercentage}% on-time
                            </span>
                          </div>
                          <p className="text-slate-500">
                            Consistent presence compared to other departments in this range.
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Out of office count – based on days with highest absences */}
                  <Card className="rounded-2xl border-slate-200 shadow-sm h-[130px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Out of Office Count (Last 30 Days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px] text-slate-500 space-y-1.5">
                      {topAbsentDays.length ? (
                        topAbsentDays.map((d) => (
                          <div
                            key={d.date}
                            className="flex items-center justify-between rounded-lg bg-red-50 px-2 py-1"
                          >
                            <span className="text-slate-700">
                              {format(parseISO(d.date), "dd MMM yyyy")}
                            </span>
                            <span className="font-semibold text-red-600">
                              {d.absent} out of office
                            </span>
                          </div>
                        ))
                      ) : (
                        <p>No out of office records in this range.</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Frequent late arrivals – based on days with highest lateness */}
                  <Card className="rounded-2xl border-slate-200 shadow-sm h-[130px]">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Frequent Late Arrivals
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px] text-slate-500 space-y-1.5">
                      {topLateDays.length ? (
                        topLateDays.map((d) => (
                          <div
                            key={d.date}
                            className="flex items-center justify-between rounded-lg bg-amber-50 px-2 py-1"
                          >
                            <span className="text-slate-700">
                              {format(parseISO(d.date), "dd MMM yyyy")}
                            </span>
                            <span className="font-semibold text-amber-600">
                              {d.late} late
                            </span>
                          </div>
                        ))
                      ) : (
                        <p>No late arrivals recorded in this range.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Timeline visualization – percentage lines */}
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      Attendance Timeline
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Percentage of employees present, absent and late over time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {timelineSeries.length ? (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={timelineSeries}
                              margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis
                                dataKey="month"
                                tick={{ fontSize: 10 }}
                                tickFormatter={(v) =>
                                  format(parseISO(`${v}-01`), "MMM yyyy")
                                }
                              />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip
                                formatter={(v: any) => v}
                                labelFormatter={(v) =>
                                  format(parseISO(`${String(v)}-01`), "MMM yyyy")
                                }
                              />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar
                                dataKey="present"
                                name="Present"
                                stackId="a"
                                fill="#10b981"
                              />
                              <Bar
                                dataKey="absent"
                                name="Absent"
                                stackId="a"
                                fill="#ef4444"
                              />
                              <Bar
                                dataKey="late"
                                name="Late"
                                stackId="a"
                                fill="#f59e0b"
                              />
                            </BarChart>
                          </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-xs text-slate-500">
                        No attendance records found for this period.
                      </div>
                    )}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          Present
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          Absent
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          Late
                        </span>
                      </div>
                      <span>
                        Range: {format(dateRange.from, "dd MMM yyyy")} –{" "}
                        {format(dateRange.to, "dd MMM yyyy")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* AI insights sidebar */}
              <div className="space-y-3">
                <Card className="rounded-2xl border-slate-200 shadow-sm bg-gradient-to-br from-slate-50 to-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      AI Attendance Insights
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Automatically summarized patterns for this date range.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {aiInsights.length ? (
                      aiInsights.map((insight, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]"
                        >
                          <p className="font-semibold text-slate-900">
                            {insight.title}
                          </p>
                          <p className="text-slate-600">{insight.body}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Once enough attendance data is available, AI insights will appear here.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Weekday presence snapshot */}
                <Card className="rounded-2xl border-slate-200 shadow-sm bg-gradient-to-br from-slate-50 to-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      Weekday Presence Snapshot
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Which days have the strongest presence?
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {weekdayPresence.length ? (
                      <div className="space-y-1.5 text-[11px]">
                        {weekdayPresence.map((d) => (
                          <div key={d.label}>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-600">{d.label}</span>
                              <span className="font-semibold text-slate-900">
                                {d.percentage}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100">
                              <div
                                className="h-1.5 rounded-full bg-[#2F80ED]"
                                style={{ width: `${d.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Weekday breakdown will appear once daily data is available.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
              </div>
            )}

            {/* Departments tab – focus on department insights */}
            {activeTab === "departments" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card className="rounded-2xl border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      Department-wise Presence
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Weekday-only presence across departments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-1">
                    {departmentPresence.length ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={departmentPresence}
                            layout="vertical"
                            margin={{ top: 10, right: 24, left: 40, bottom: 10 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              horizontal={false}
                              stroke="#e5e7eb"
                            />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                            <YAxis
                              dataKey="group"
                              type="category"
                              tick={{ fontSize: 11 }}
                              width={80}
                            />
                            <Tooltip
                              formatter={(v: any) => [`${v}%`, "Presence rate"]}
                            />
                            <Bar dataKey="averagePercentage" radius={[0, 8, 8, 0]}>
                              {departmentPresence.map((_, i) => (
                                <Cell
                                  key={i}
                                  fill={
                                    ["#3b82f6", "#10b981", "#6366f1", "#f97316"][i] ||
                                    "#3b82f6"
                                  }
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="py-10 text-center text-xs text-slate-500">
                        Department-level data will appear once attendance is recorded.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="rounded-2xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Top 3 Departments with Highest Attendance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px] space-y-1.5">
                      {departmentPresence.slice(0, 3).map((d, idx) => (
                        <div
                          key={d.group}
                          className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1"
                        >
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <span className="text-[10px] font-semibold text-slate-500">
                              #{idx + 1}
                            </span>
                            {d.group}
                          </span>
                          <span className="font-semibold text-emerald-600">
                            {d.averagePercentage}%
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-slate-900">
                        Best Performing Department
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-[11px]">
                      {departmentPresence[0] ? (
                        <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                          <span className="font-medium text-emerald-900">
                            {departmentPresence[0].group}
                          </span>
                          <span className="font-semibold text-emerald-700 text-xs">
                            {departmentPresence[0].averagePercentage}% on-time
                          </span>
                        </div>
                      ) : (
                        <p className="text-slate-500 text-[11px]">
                          Best performing department will appear once data is available.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Approvals tab – show pending timesheet approvals only */}
            {activeTab === "approvals" && (
              <Card className="rounded-2xl border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Pending Timesheet Approvals
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Timesheets awaiting action in the selected period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {pendingApprovals.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No pending timesheet approvals for this range.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-[11px] text-slate-500">
                            <th className="py-2 px-2 text-left">Employee</th>
                            <th className="py-2 px-2 text-left">Period</th>
                            <th className="py-2 px-2 text-left">Submitted</th>
                            <th className="py-2 px-2 text-left">Manager</th>
                            <th className="py-2 px-2 text-left">Hours</th>
                            <th className="py-2 px-2 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingApprovals.map((ts) => (
                            <tr key={ts.id} className="border-b last:border-0">
                              <td className="py-2 px-2">
                                <div className="text-xs font-medium text-slate-900">
                                  {ts.employee.first_name} {ts.employee.last_name}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {ts.employee.employee_id} · {ts.employee.email}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-[11px] text-slate-700">
                                {format(parseISO(ts.week_start_date), "dd MMM yyyy")} –{" "}
                                {format(parseISO(ts.week_end_date), "dd MMM yyyy")}
                              </td>
                              <td className="py-2 px-2 text-[11px] text-slate-700">
                                {ts.submitted_at
                                  ? format(parseISO(ts.submitted_at), "dd MMM yyyy HH:mm")
                                  : "—"}
                              </td>
                              <td className="py-2 px-2 text-[11px] text-slate-700">
                                {ts.manager_first_name ? (
                                  <>
                                    {ts.manager_first_name} {ts.manager_last_name}
                                    <div className="text-[10px] text-slate-500">
                                      {ts.manager_email}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400">Unassigned</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-[11px] text-slate-700">
                                {ts.total_hours ?? 0}
                              </td>
                              <td className="py-2 px-2 text-[11px] capitalize text-slate-700">
                                {ts.status.replace("_", " ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

/* =========================
   Helpers
========================= */

type TrendIcon = "up" | "down-negative" | "down-neutral" | "neutral";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trendLabel?: string;
  trendIcon?: TrendIcon;
}

function KpiCard({
  title,
  value,
  subtitle,
  trendLabel,
  trendIcon = "neutral",
}: KpiCardProps) {
  const trendColor =
    trendIcon === "up"
      ? "text-emerald-600"
      : trendIcon === "down-negative"
      ? "text-red-600"
      : trendIcon === "down-neutral"
      ? "text-amber-500"
      : "text-slate-400";

  return (
    <Card className="h-[120px] rounded-2xl border-slate-200 bg-white shadow-sm transition-transform duration-150 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex h-full flex-col items-center justify-center px-3 text-center space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl font-semibold text-slate-900">
            {value ?? "—"}
          </span>
          {subtitle && (
            <p className="text-[11px] text-slate-500">{subtitle}</p>
          )}
        </div>
        {trendLabel && (
          <span className={`flex items-center justify-center gap-0.5 text-[10px] ${trendColor}`}>
            {trendIcon === "up" && <ArrowUpRight className="h-3 w-3" />}
            {(trendIcon === "down-negative" || trendIcon === "down-neutral") && (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trendIcon === "neutral" && <Minus className="h-3 w-3" />}
            {trendLabel}
          </span>
        )}
      </div>
    </Card>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-900">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
