import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  CalendarIcon, 
  TrendingUp, 
  Users, 
  Clock, 
  MapPin, 
  Download, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";

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
    id: string;
    employee_id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  manager_id: string | null;
  manager_first_name: string | null;
  manager_last_name: string | null;
  manager_email: string | null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="font-semibold mb-2">{format(parseISO(label), "MMM dd, yyyy")}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-medium">{entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function AttendanceAnalytics() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [histogram, setHistogram] = useState<HistogramData[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date(),
  });
  const [selectedPeriod, setSelectedPeriod] = useState("30");

  const allowedRoles = ["admin", "hr", "ceo", "director"];
  const canViewAnalytics = userRole ? allowedRoles.includes(userRole) : false;

  useEffect(() => {
    if (canViewAnalytics) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [dateRange, canViewAnalytics]);

  const fetchData = async () => {
    if (!canViewAnalytics) return;
    setLoading(true);
    try {
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");

      const [overviewData, histogramData, approvalsData] = await Promise.all([
        api.getAttendanceOverview({ from: fromStr, to: toStr }),
        api.getAttendanceHistogram({ from: fromStr, to: toStr }),
        api.getPendingTimesheetApprovals({ from: fromStr, to: toStr }),
      ]);

      setOverview(overviewData);
      // Ensure histogram data is properly formatted
      const formattedHistogram = (histogramData.histogram || []).map((item: any) => ({
        ...item,
        date: item.date || format(parseISO(item.date), "yyyy-MM-dd"),
      }));
      setHistogram(formattedHistogram);

      setPendingApprovals(approvalsData?.pending || []);
      
      console.log("Histogram data:", formattedHistogram); // Debug log
    } catch (error: any) {
      console.error("Error fetching analytics:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    const today = new Date();
    let from = new Date();

    switch (period) {
      case "7":
        from.setDate(today.getDate() - 7);
        break;
      case "30":
        from.setDate(today.getDate() - 30);
        break;
      case "90":
        from.setDate(today.getDate() - 90);
        break;
      default:
        return; // Custom, don't change
    }

    setDateRange({ from, to: today });
  };

  const exportCSV = () => {
    if (histogram.length === 0) return;

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
    a.download = `attendance-analytics-${format(dateRange.from, "yyyy-MM-dd")}-${format(dateRange.to, "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Calculate statistics
  const stats = histogram.length > 0 ? {
    avgPresent: Math.round(histogram.reduce((sum, h) => sum + h.present, 0) / histogram.length),
    avgAbsent: Math.round(histogram.reduce((sum, h) => sum + h.absent, 0) / histogram.length),
    avgLate: Math.round(histogram.reduce((sum, h) => sum + h.late, 0) / histogram.length),
    totalWFO: histogram.reduce((sum, h) => sum + h.wfo, 0),
    totalWFH: histogram.reduce((sum, h) => sum + h.wfh, 0),
    maxPresent: Math.max(...histogram.map(h => h.present)),
    minPresent: Math.min(...histogram.map(h => h.present)),
  } : null;

  if (!canViewAnalytics) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Attendance Analytics</CardTitle>
              <CardDescription>Access restricted</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Attendance analytics are available only to HR, Directors, and Executive roles. If you
                believe you need access, please contact HR or an administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <TrendingUp className="h-7 w-7 text-primary" />
              Attendance Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive attendance insights and trends
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedPeriod || "30"} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {selectedPeriod === "custom" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from && dateRange.to ? (
                      `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd, yyyy")}`
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
            <Button onClick={exportCSV} variant="outline" disabled={histogram.length === 0}>
              <Download className="mr-2 h-4 w-4" />
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
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.total_employees || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Active workforce
                </p>
              </CardContent>
            </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today Present</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview?.today_present || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {overview?.today_present_percent || 0}% of total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">On-Time %</CardTitle>
                  <Timer className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview?.on_time_percent || 0}%</div>
                  <p className="text-xs text-muted-foreground">
                    Employees arriving on time
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">WFO / WFH</CardTitle>
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default" className="bg-blue-600">
                      {overview?.wfo_percent || 0}% WFO
                    </Badge>
                    <Badge variant="outline">
                      {overview?.wfh_percent || 0}% WFH
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Work location distribution
                  </p>
                </CardContent>
              </Card>

            </div>

            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Daily Present</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgPresent}</div>
                    <p className="text-xs text-muted-foreground">
                      Range: {stats.minPresent} - {stats.maxPresent}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Daily Absent</CardTitle>
                    <XCircle className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgAbsent}</div>
                    <p className="text-xs text-muted-foreground">
                      Average absentees per day
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Avg Daily Late</CardTitle>
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.avgLate}</div>
                    <p className="text-xs text-muted-foreground">
                      Average late arrivals
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total WFO/WFH</CardTitle>
                    <MapPin className="h-4 w-4 text-purple-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalWFO + stats.totalWFH}</div>
                    <p className="text-xs text-muted-foreground">
                      WFO: {stats.totalWFO} · WFH: {stats.totalWFH}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Charts & Approvals Section */}
            <Tabs defaultValue="timeline" className="space-y-4">
              <TabsList>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="trends">Trends</TabsTrigger>
                <TabsTrigger value="location">Work Location</TabsTrigger>
                <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Attendance Timeline</CardTitle>
                    <CardDescription>
                      Daily present/absent/late counts for the selected period
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {histogram.length > 0 ? (
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={histogram} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            tickFormatter={(value) => format(parseISO(value), "MMM dd")}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar dataKey="late" stackId="a" fill="#f59e0b" name="Late" radius={[0, 0, 4, 4]} />
                          <Bar dataKey="absent" stackId="a" fill="#ef4444" name="Absent" />
                          <Bar dataKey="present" stackId="a" fill="#10b981" name="Present" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No data available</p>
                        <p className="text-sm mt-2">No attendance records found for the selected period</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trends" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Attendance Trends</CardTitle>
                    <CardDescription>
                      Trend analysis of present, absent, and late employees over time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {histogram.length > 0 ? (
                      <ResponsiveContainer width="100%" height={400}>
                        <AreaChart data={histogram} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                          <defs>
                            <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                            </linearGradient>
                            <linearGradient id="colorLate" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            tickFormatter={(value) => format(parseISO(value), "MMM dd")}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="present"
                            stroke="#10b981"
                            fillOpacity={1}
                            fill="url(#colorPresent)"
                            name="Present"
                          />
                          <Area
                            type="monotone"
                            dataKey="absent"
                            stroke="#ef4444"
                            fillOpacity={1}
                            fill="url(#colorAbsent)"
                            name="Absent"
                          />
                          <Area
                            type="monotone"
                            dataKey="late"
                            stroke="#f59e0b"
                            fillOpacity={1}
                            fill="url(#colorLate)"
                            name="Late"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No data available</p>
                        <p className="text-sm mt-2">No attendance records found for the selected period</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="location" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Work Location Distribution</CardTitle>
                    <CardDescription>
                      WFO (Work From Office) vs WFH (Work From Home) breakdown
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {histogram.length > 0 ? (
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={histogram} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                            tickFormatter={(value) => format(parseISO(value), "MMM dd")}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                          <Bar dataKey="wfh" stackId="b" fill="#8b5cf6" name="WFH" radius={[0, 0, 4, 4]} />
                          <Bar dataKey="wfo" stackId="b" fill="#3b82f6" name="WFO" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No data available</p>
                        <p className="text-sm mt-2">No attendance records found for the selected period</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="approvals" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Pending Timesheet Approvals</CardTitle>
                    <CardDescription>
                      Timesheets submitted and awaiting manager/HR/CEO action for the selected period.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingApprovals.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">
                        No pending timesheet approvals for this period.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-xs text-muted-foreground">
                              <th className="py-2 px-2 text-left">Employee</th>
                              <th className="py-2 px-2 text-left">Period</th>
                              <th className="py-2 px-2 text-left">Submitted At</th>
                              <th className="py-2 px-2 text-left">Manager</th>
                              <th className="py-2 px-2 text-left">Hours</th>
                              <th className="py-2 px-2 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pendingApprovals.map((ts) => (
                              <tr key={ts.id} className="border-b last:border-0">
                                <td className="py-2 px-2">
                                  <div className="font-medium">
                                    {ts.employee.first_name} {ts.employee.last_name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {ts.employee.employee_id} · {ts.employee.email}
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {format(parseISO(ts.week_start_date), "dd MMM yyyy")} –{" "}
                                  {format(parseISO(ts.week_end_date), "dd MMM yyyy")}
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {ts.submitted_at
                                    ? format(parseISO(ts.submitted_at), "dd MMM yyyy HH:mm")
                                    : "—"}
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {ts.manager_first_name ? (
                                    <>
                                      {ts.manager_first_name} {ts.manager_last_name}
                                      <div className="text-xs text-muted-foreground">
                                        {ts.manager_email}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">Unassigned</span>
                                  )}
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {ts.total_hours ?? 0}
                                </td>
                                <td className="py-2 px-2 text-xs capitalize">
                                  {ts.status.replace('_', ' ')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
