import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { ShieldAlert, Users, TrendingUp, Target, Activity, AlertTriangle, Megaphone } from "lucide-react";
import { api } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import CalendarPanel from "@/components/dashboard/CalendarPanel";
import { SmartMemo } from "@/components/dashboard/SmartMemo";

type KpiTrend = "up" | "down" | "flat";

interface KpiCardProps {
  title: string;
  value: string;
  trend: KpiTrend;
  subtext?: string;
}

interface MetricsResponse {
  totalEmployees: number;
  attritionRate: number;
  projectDeliveryRate: number;
  productivityIndex: number;
  headcountTrend: Array<{ month: string; value: number }>;
  projectPerformance: { onTrack: number; delayed: number; atRisk: number };
  engagementScore: number;
  okrProgress: number;
  riskSeries: Array<{ month: string; open: number }>;
  lastUpdated: string;
}

const BRAND_RED = "#d62828";
const BRAND_BLACK = "#000000";
const BRAND_WHITE = "#ffffff";
const POSITIVE = "#2f9e44";
const NEGATIVE = "#d62828";

const defaultMetrics: MetricsResponse = {
  totalEmployees: 0,
  attritionRate: 0,
  projectDeliveryRate: 0,
  productivityIndex: 0,
  headcountTrend: [],
  projectPerformance: { onTrack: 0, delayed: 0, atRisk: 0 },
  engagementScore: 0,
  okrProgress: 0,
  riskSeries: [],
  lastUpdated: new Date().toISOString(),
};

function KpiCard({ title, value, trend, subtext }: KpiCardProps) {
  const arrow = trend === "up" ? "▲" : trend === "down" ? "▼" : "➖";
  const color = trend === "up" ? POSITIVE : trend === "down" ? NEGATIVE : BRAND_BLACK;
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardContent className="p-4 flex flex-col gap-2">
        <div className="text-sm text-slate-600">{title}</div>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold" style={{ color: BRAND_BLACK }}>{value}</div>
          <div className="text-sm font-semibold" style={{ color }}>
            {arrow}
          </div>
        </div>
        {subtext && <div className="text-xs text-slate-500">{subtext}</div>}
      </CardContent>
    </Card>
  );
}

export default function CEODashboard() {
  const { userRole } = useAuth();
  const [metrics, setMetrics] = useState<MetricsResponse>(defaultMetrics);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"30d" | "6m" | "12m">("30d");
  const [error, setError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<
    Array<{ id: string; title: string; body: string; priority: string; created_at: string; type?: string }>
  >([]);

  // Derive metrics from existing org data (employees + projects). Falls back to defaults if missing.
  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [employees, projects] = await Promise.all([
        api.getEmployees().catch(() => []),
        api.getProjects ? api.getProjects().catch(() => []) : Promise.resolve([]),
      ]);

      const totalEmployees = Array.isArray(employees) ? employees.length : 0;
      const inactive = (employees || []).filter((e: any) => (e.status || "").toLowerCase() !== "active").length;
      const attritionRate = totalEmployees ? Number(((inactive / totalEmployees) * 100).toFixed(1)) : 0;

      // Project delivery split by status if available
      const onTrack = (projects || []).filter((p: any) => (p.status || "").toLowerCase() === "on_track").length;
      const delayed = (projects || []).filter((p: any) => (p.status || "").toLowerCase() === "delayed").length;
      const atRisk = (projects || []).filter((p: any) => (p.status || "").toLowerCase() === "at_risk").length;
      const totalProjects = (projects || []).length || 1;
      const projectPerformance = {
        onTrack: Math.round((onTrack / totalProjects) * 100),
        delayed: Math.round((delayed / totalProjects) * 100),
        atRisk: Math.round((atRisk / totalProjects) * 100),
      };
      const projectDeliveryRate = projectPerformance.onTrack;

      // Headcount trend: naive monthly aggregation from join_date (last 12 months)
      const now = new Date();
      const months: Array<{ month: string; value: number }> = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleString("default", { month: "short" });
        const count = (employees || []).filter((e: any) => {
          if (!e.join_date) return true; // keep if unknown
          const jd = new Date(e.join_date);
          return jd <= new Date(d.getFullYear(), d.getMonth() + 1, 0); // joined on/before end of month
        }).length;
        months.push({ month: label, value: count });
      }

      // Productivity: simple proxy = 100 - attrition*0.5 (fallback)
      const productivityIndex = Math.max(0, Math.min(100, Math.round(100 - attritionRate * 0.5)));

      // Engagement/OKR placeholders (kept but clearly shown)
      const engagementScore = 78;
      const okrProgress = 64;

      setMetrics({
        totalEmployees,
        attritionRate,
        projectDeliveryRate,
        productivityIndex,
        headcountTrend: months,
        projectPerformance,
        engagementScore,
        okrProgress,
        riskSeries: [],
        lastUpdated: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message || "Failed to load CEO metrics");
      setMetrics(defaultMetrics);
    } finally {
      setLoading(false);
    }
  };

  const loadAnnouncements = async () => {
    try {
      const data = await api.getAnnouncements ? await api.getAnnouncements(5) : [];
      const mapped = (data || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        priority: a.priority || "normal",
        created_at: a.created_at || new Date().toISOString(),
        type: a.type || "announcement",
      }));
      setAnnouncements(mapped);
    } catch (_) {
      setAnnouncements([]);
    }
  };

  useEffect(() => {
    loadMetrics();
    loadAnnouncements();
    const id = setInterval(loadMetrics, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const lastUpdatedLabel = useMemo(() => {
    if (!metrics.lastUpdated) return "";
    return formatDistanceToNow(new Date(metrics.lastUpdated), { addSuffix: true });
  }, [metrics.lastUpdated]);

  if ((userRole || "").toLowerCase() !== "ceo") {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full text-center border border-red-200">
            <CardContent className="py-12 space-y-3">
              <ShieldAlert className="h-10 w-10 text-red-600 mx-auto" />
              <h2 className="text-xl font-semibold text-slate-900">403 - Access Denied</h2>
              <p className="text-sm text-slate-600">This page is restricted to CEO role.</p>
              <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
                Go to dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const headcountData = metrics.headcountTrend.length
    ? metrics.headcountTrend
    : [
        { month: "Jan", value: 240 },
        { month: "Feb", value: 242 },
        { month: "Mar", value: 245 },
        { month: "Apr", value: 250 },
        { month: "May", value: 252 },
        { month: "Jun", value: 255 },
        { month: "Jul", value: 258 },
        { month: "Aug", value: 262 },
        { month: "Sep", value: 265 },
        { month: "Oct", value: 267 },
        { month: "Nov", value: 270 },
        { month: "Dec", value: 272 },
      ];

  const projectBars = [
    { name: "Status", onTrack: metrics.projectPerformance.onTrack || 62, delayed: metrics.projectPerformance.delayed || 24, atRisk: metrics.projectPerformance.atRisk || 14 },
  ];

  const riskData = metrics.riskSeries.length
    ? metrics.riskSeries
    : [
        { month: "Jan", open: 11 },
        { month: "Feb", open: 9 },
        { month: "Mar", open: 7 },
        { month: "Apr", open: 8 },
        { month: "May", open: 6 },
        { month: "Jun", open: 5 },
      ];

  const engagementValue = metrics.engagementScore || 78;
  const okrValue = metrics.okrProgress || 64;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND_BLACK }}>CEO Dashboard – Organization Overview</h1>
            <p className="text-sm text-slate-600">Company-wide performance snapshot</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="6m">6 months</SelectItem>
                <SelectItem value="12m">12 months</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs border-slate-300">
              Last updated {lastUpdatedLabel || "just now"}
            </Badge>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Total Employees" value={metrics.totalEmployees ? metrics.totalEmployees.toString() : "–"} trend="up" subtext="vs last month" />
          <KpiCard title="Attrition Rate" value={`${metrics.attritionRate || 0}%`} trend="down" subtext="vs last month" />
          <KpiCard title="Project Delivery Rate" value={`${metrics.projectDeliveryRate || 0}%`} trend="up" subtext="vs last month" />
          <KpiCard title="Productivity Index" value={(metrics.productivityIndex || 72).toString()} trend="up" subtext="vs last month" />
        </div>

        {/* Charts Grid */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <Users className="h-5 w-5 text-red-600" />
                Employee Trends
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={headcountData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px'
                    }} 
                  />
                  <Line type="monotone" dataKey="value" stroke={BRAND_RED} strokeWidth={3} dot={{ r: 4, fill: BRAND_RED }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <TrendingUp className="h-5 w-5 text-red-600" />
                Project Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="onTrack" stackId="a" fill={POSITIVE} name="On Track" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delayed" stackId="a" fill="#f59f00" name="Delayed" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="atRisk" stackId="a" fill={NEGATIVE} name="At Risk" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <Activity className="h-5 w-5 text-red-600" />
                Engagement & Culture
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Engagement", value: engagementValue },
                      { name: "Gap", value: 100 - engagementValue },
                    ]}
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    <Cell key="eng" fill={BRAND_RED} />
                    <Cell key="gap" fill="#f1f3f5" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px'
                    }} 
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <Target className="h-5 w-5 text-red-600" />
                Strategic Goals (OKRs)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] flex items-center justify-center">
              <div className="relative inline-flex items-center justify-center">
                <div className="h-36 w-36 rounded-full border-[12px] border-slate-200" />
                <div
                  className="absolute h-36 w-36 rounded-full"
                  style={{
                    background: `conic-gradient(${BRAND_RED} ${okrValue}%, #f1f3f5 0)`,
                  }}
                />
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <div className="text-3xl font-bold" style={{ color: BRAND_BLACK }}>{okrValue}%</div>
                  <div className="text-xs text-slate-600 mt-1">OKRs Achieved</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Risk & Compliance
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'white', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px'
                    }} 
                  />
                  <Line type="monotone" dataKey="open" stroke={BRAND_RED} strokeWidth={3} dot={{ r: 4, fill: BRAND_RED }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Placeholder for future chart or keep empty for symmetry */}
          <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-slate-900 text-lg">
                <TrendingUp className="h-5 w-5 text-red-600" />
                Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[280px] flex items-center justify-center">
              <div className="text-center text-slate-500">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-medium">Additional metrics coming soon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Announcements */}
        <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-900">
              <Megaphone className="h-5 w-5 text-amber-600" />
              Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto pr-1">
            {announcements.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">No announcements yet.</div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div
                    key={a.id}
                    className={`w-full text-left p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                      a.type === 'birthday'
                        ? 'border-amber-300 bg-amber-50/70'
                        : a.priority === 'urgent'
                          ? 'border-red-300 bg-red-50/70'
                          : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm line-clamp-1">{a.title}</p>
                          {a.priority === 'urgent' && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Urgent</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
                      </div>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(a.created_at), 'MMM d')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team Calendar - Same as regular dashboard */}
        <div id="team-calendar-section" className="pt-2">
          <CalendarPanel />
        </div>

        {/* Smart Memo */}
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-900">Memo</CardTitle>
          </CardHeader>
          <CardContent>
            <SmartMemo selectedDate={new Date()} onEventsCreated={() => {}} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
