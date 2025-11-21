import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Loader2, CalendarIcon, TrendingUp, Users, Clock, MapPin, Download } from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

export default function AttendanceAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [histogram, setHistogram] = useState<HistogramData[]>([]);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date(),
  });
  const [selectedPeriod, setSelectedPeriod] = useState("30");

  useEffect(() => {
    fetchData();
  }, [dateRange, selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");

      const [overviewData, histogramData] = await Promise.all([
        api.getAttendanceOverview({ from: fromStr, to: toStr }),
        api.getAttendanceHistogram({ from: fromStr, to: toStr }),
      ]);

      setOverview(overviewData);
      setHistogram(histogramData.histogram || []);
    } catch (error: any) {
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today Present</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
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
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{overview?.on_time_percent || 0}%</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">WFO / WFH</CardTitle>
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{overview?.wfo_percent || 0}% WFO</Badge>
                    <Badge variant="outline">{overview?.wfh_percent || 0}% WFH</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Histogram Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Attendance Timeline</CardTitle>
                <CardDescription>
                  Daily present/absent/late counts for the selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                {histogram.length > 0 ? (
                  <div className="space-y-4">
                    <div className="h-[300px] overflow-x-auto">
                      <div className="flex items-end gap-2 h-full min-w-full">
                        {histogram.map((item, idx) => {
                          const maxValue = Math.max(
                            ...histogram.map((h) => Math.max(h.present, h.absent, h.late))
                          );
                          const presentHeight = (item.present / maxValue) * 100;
                          const absentHeight = (item.absent / maxValue) * 100;
                          const lateHeight = (item.late / maxValue) * 100;

                          return (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center gap-1 group relative"
                            >
                              <div className="flex flex-col-reverse gap-0.5 w-full h-full">
                                <div
                                  className="bg-primary rounded-t"
                                  style={{ height: `${presentHeight}%` }}
                                  title={`Present: ${item.present}`}
                                />
                                <div
                                  className="bg-destructive rounded-t"
                                  style={{ height: `${absentHeight}%` }}
                                  title={`Absent: ${item.absent}`}
                                />
                                <div
                                  className="bg-yellow-500 rounded-t"
                                  style={{ height: `${lateHeight}%` }}
                                  title={`Late: ${item.late}`}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground transform -rotate-45 origin-top-left whitespace-nowrap">
                                {format(new Date(item.date), "MMM dd")}
                              </span>
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-popover border rounded p-2 shadow-lg z-10">
                                <div className="text-xs space-y-1">
                                  <div>Date: {format(new Date(item.date), "MMM dd, yyyy")}</div>
                                  <div>Present: {item.present}</div>
                                  <div>Absent: {item.absent}</div>
                                  <div>Late: {item.late}</div>
                                  <div>WFO: {item.wfo}</div>
                                  <div>WFH: {item.wfh}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-primary rounded" />
                        <span>Present</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-destructive rounded" />
                        <span>Absent</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500 rounded" />
                        <span>Late</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No data available for the selected period
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

