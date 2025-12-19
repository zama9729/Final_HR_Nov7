import { useEffect, useMemo, useState } from "react";
import { addDays, format, isAfter, isBefore, isSameDay, parseISO, startOfWeek } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Clock, ListFilter, Search, User } from "lucide-react";

type Role = "hr" | "director" | "ceo" | "admin" | "manager" | "employee" | string;

interface Shift {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type?: string;
  notes?: string;
  status?: string;
  location?: string;
  project_name?: string;
  employees?: {
    employee_id?: string;
    profiles?: {
      first_name?: string;
      last_name?: string;
    };
  };
}

type ViewMode = "calendar" | "card";

interface Filters {
  search: string;
  quickRange: "today" | "week" | "custom";
  from: Date | undefined;
  to: Date | undefined;
  shiftType: string;
  status: string;
}

const FILTER_STORAGE_KEY = "my-shifts-filters";

const statusColor: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  upcoming: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-gray-100 text-gray-700 border-gray-200",
  missed: "bg-rose-50 text-rose-700 border-rose-200",
};

const shiftTypeLabel: Record<string, string> = {
  morning: "Morning",
  evening: "Evening",
  night: "Night",
  regular: "Regular",
};

const defaultFilters: Filters = {
  search: "",
  quickRange: "week",
  from: undefined,
  to: undefined,
  shiftType: "all",
  status: "all",
};

export default function MyShifts() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [filters, setFilters] = useState<Filters>(() => {
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultFilters,
          ...parsed,
          from: parsed.from ? new Date(parsed.from) : undefined,
          to: parsed.to ? new Date(parsed.to) : undefined,
        };
      }
    } catch {
      /* ignore */
    }
    return defaultFilters;
  });

  const isManager = ["manager", "hr", "director", "ceo", "admin"].includes((userRole || "").toLowerCase());
  const isEmployee = !isManager;

  useEffect(() => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({
        ...filters,
        from: filters.from ? filters.from.toISOString() : undefined,
        to: filters.to ? filters.to.toISOString() : undefined,
      })
    );
  }, [filters]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Managers/Admins: use full shifts endpoint; employees: use own
        let data: any[] = [];
        if (isManager) {
          data = await api.getShifts();
        } else {
          const me = await api.getEmployeeId().catch(() => null);
          if (me?.id) {
            data = await api.getShiftsForEmployee(me.id);
          } else {
            data = [];
          }
        }
        setShifts(Array.isArray(data) ? data : []);
      } catch (error: any) {
        console.error("[MyShifts] Failed to load shifts", error);
        toast({
          title: "Error loading shifts",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isManager, toast]);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const date = parseISO(shift.shift_date);
      const matchesSearch =
        !filters.search ||
        (shift.notes || "").toLowerCase().includes(filters.search.toLowerCase()) ||
        (shift.employees?.profiles?.first_name || "")
          .toLowerCase()
          .includes(filters.search.toLowerCase()) ||
        (shift.employees?.profiles?.last_name || "").toLowerCase().includes(filters.search.toLowerCase());

      const matchesType = filters.shiftType === "all" || (shift.shift_type || "regular") === filters.shiftType;
      const matchesStatus = filters.status === "all" || (shift.status || "scheduled") === filters.status;

      let inRange = true;
      if (filters.quickRange === "today") {
        inRange = isSameDay(date, new Date());
      } else if (filters.quickRange === "week") {
        const end = addDays(weekStart, 6);
        inRange = !isBefore(date, weekStart) && !isAfter(date, end);
      } else if (filters.quickRange === "custom" && filters.from && filters.to) {
        inRange = !isBefore(date, filters.from) && !isAfter(date, filters.to);
      }

      return matchesSearch && matchesType && matchesStatus && inRange;
    });
  }, [filters, shifts, weekStart]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const start = filters.quickRange === "week" ? weekStart : startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }, [filters.quickRange, weekStart]);

  const shiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    calendarDays.forEach((d) => {
      map[format(d, "yyyy-MM-dd")] = [];
    });
    filteredShifts.forEach((shift) => {
      const key = shift.shift_date;
      if (!map[key]) map[key] = [];
      map[key].push(shift);
    });
    return map;
  }, [calendarDays, filteredShifts]);

  const summary = useMemo(() => {
    const now = new Date();
    const totalWeek = filteredShifts.length;
    const open = filteredShifts.filter((s) => (s.status || "scheduled") === "scheduled").length;
    const missed = filteredShifts.filter((s) => (s.status || "").toLowerCase() === "missed").length;
    const inProgress = filteredShifts.filter((s) => {
      const start = new Date(`${s.shift_date}T${s.start_time}`);
      const end = new Date(`${s.shift_date}T${s.end_time}`);
      return start <= now && end >= now && (s.status || "scheduled") !== "completed";
    }).length;
    return { totalWeek, open, missed, inProgress };
  }, [filteredShifts]);

  const teamOverview = useMemo(() => {
    if (!isManager) return [];
    const byEmp: Record<string, { name: string; today?: Shift; next?: Shift; status?: string }> = {};
    const todayStr = format(new Date(), "yyyy-MM-dd");
    filteredShifts.forEach((s) => {
      const name = `${s.employees?.profiles?.first_name || ""} ${s.employees?.profiles?.last_name || ""}`.trim() || "Employee";
      if (!byEmp[s.employee_id]) byEmp[s.employee_id] = { name };
      if (s.shift_date === todayStr) byEmp[s.employee_id].today = s;
      const shiftDate = parseISO(s.shift_date);
      if (!byEmp[s.employee_id].next || isBefore(parseISO(byEmp[s.employee_id].next!.shift_date), shiftDate)) {
        byEmp[s.employee_id].next = s;
      }
      byEmp[s.employee_id].status = s.status || "scheduled";
    });
    return Object.entries(byEmp).map(([id, val]) => ({ id, ...val }));
  }, [filteredShifts, isManager]);

  const shiftDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    filteredShifts.forEach((s) => {
      const type = (s.shift_type || "regular").toLowerCase();
      buckets[type] = (buckets[type] || 0) + 1;
    });
    return Object.entries(buckets).map(([type, count]) => ({ type: shiftTypeLabel[type] || type, count }));
  }, [filteredShifts]);

  const handleDateRange = (range: { from?: Date; to?: Date }) => {
    setFilters((f) => ({ ...f, quickRange: "custom", from: range.from, to: range.to }));
  };

  const statusBadge = (status?: string) => {
    const key = (status || "scheduled").toLowerCase();
    return (
      <Badge variant="outline" className={statusColor[key] || "bg-slate-100 text-slate-700 border-slate-200"}>
        {key.replace("_", " ")}
      </Badge>
    );
  };

  const formatTime = (time: string) => {
    try {
      const [h, m] = time.split(":").map(Number);
      const date = new Date();
      date.setHours(h, m || 0, 0, 0);
      return format(date, "hh:mm a");
    } catch {
      return time;
    }
  };

  const renderShiftCard = (shift: Shift) => (
    <Card key={shift.id} className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{shift.shift_type ? shiftTypeLabel[shift.shift_type] || shift.shift_type : "Shift"}</CardTitle>
            <CardDescription>{format(parseISO(shift.shift_date), "MMM dd, yyyy")}</CardDescription>
          </div>
          {statusBadge(shift.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>
            {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
          </span>
        </div>
        {shift.location && (
          <div className="text-muted-foreground text-sm">Location: {shift.location}</div>
        )}
        {shift.project_name && (
          <div className="text-muted-foreground text-sm">Project: {shift.project_name}</div>
        )}
        {isManager && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>
              {(shift.employees?.profiles?.first_name || "") +
                " " +
                (shift.employees?.profiles?.last_name || "")}
            </span>
          </div>
        )}
        {shift.notes && <p className="text-xs text-muted-foreground">{shift.notes}</p>}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Shifts</h1>
            <p className="text-muted-foreground">View and manage your shifts</p>
          </div>
          <div className="flex items-center gap-2">
            {isManager && (
              <>
                <Button size="sm" variant="default">Add Shift</Button>
                <Button size="sm" variant="outline">Assign Shift</Button>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Filters */}
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>Refine the shift list</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search shift, team member, note..."
                  className="pl-8"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Date range</label>
                <div className="flex gap-2">
                  <Button
                    variant={filters.quickRange === "today" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilters((f) => ({ ...f, quickRange: "today", from: undefined, to: undefined }))}
                  >
                    Today
                  </Button>
                  <Button
                    variant={filters.quickRange === "week" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilters((f) => ({ ...f, quickRange: "week", from: undefined, to: undefined }))}
                  >
                    This Week
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant={filters.quickRange === "custom" ? "default" : "outline"} size="sm">
                        Custom
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-2" align="start">
                      <Calendar
                        mode="range"
                        numberOfMonths={2}
                        selected={{ from: filters.from, to: filters.to }}
                        onSelect={(range) => handleDateRange(range || {})}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Shift type</label>
                  <Select
                    value={filters.shiftType}
                    onValueChange={(v) => setFilters((f) => ({ ...f, shiftType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="regular">Regular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Select
                    value={filters.status}
                    onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="scheduled">Upcoming</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="missed">Missed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base">Shifts</CardTitle>
                  <CardDescription>Calendar or card view</CardDescription>
                </div>
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                  <TabsList>
                    <TabsTrigger value="calendar">Calendar View</TabsTrigger>
                    <TabsTrigger value="card">Card View</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">Loading shifts...</div>
                ) : filteredShifts.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground text-sm">No shifts found</div>
                ) : viewMode === "calendar" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {calendarDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const dayShifts = shiftsByDay[key] || [];
                      return (
                        <Card key={key} className="border-dashed">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">{format(day, "EEE, MMM dd")}</CardTitle>
                              <Badge variant="outline" className="text-[11px]">
                                {dayShifts.length} shift{dayShifts.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {dayShifts.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No shifts</p>
                            ) : (
                              dayShifts.map((shift) => (
                                <div
                                  key={shift.id}
                                  className="rounded-lg border px-3 py-2 bg-muted/40 hover:bg-muted transition"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="text-sm font-medium">
                                      {shift.shift_type ? shiftTypeLabel[shift.shift_type] || shift.shift_type : "Shift"}
                                    </div>
                                    {statusBadge(shift.status)}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <Clock className="h-3 w-3" />
                                    <span>
                                      {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                                    </span>
                                  </div>
                                  {isManager && (
                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                      <User className="h-3 w-3" />
                                      <span>
                                        {(shift.employees?.profiles?.first_name || "") +
                                          " " +
                                          (shift.employees?.profiles?.last_name || "")}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {filteredShifts
                      .slice()
                      .sort((a, b) => (a.shift_date + a.start_time).localeCompare(b.shift_date + b.start_time))
                      .map((shift) => renderShiftCard(shift))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {isManager && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Team Shift Overview</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Today</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next shift</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamOverview.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground text-sm">
                          No team shifts
                        </TableCell>
                      </TableRow>
                    ) : (
                      teamOverview.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell>
                            {row.today ? `${formatTime(row.today.start_time)} – ${formatTime(row.today.end_time)}` : "—"}
                          </TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell>
                            {row.next
                              ? `${format(parseISO(row.next.shift_date), "MMM dd")} • ${formatTime(row.next.start_time)}`
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Summary</CardTitle>
                  <CardDescription>This week</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border p-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground">Total shifts</p>
                    <p className="text-lg font-semibold">{summary.totalWeek}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground">Open</p>
                    <p className="text-lg font-semibold">{summary.open}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground">In progress</p>
                    <p className="text-lg font-semibold">{summary.inProgress}</p>
                  </div>
                  <div className="rounded-lg border p-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground">Missed</p>
                    <p className="text-lg font-semibold">{summary.missed}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Shift distribution</CardTitle>
                </CardHeader>
                <CardContent className="h-44">
                  {shiftDistribution.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={shiftDistribution}>
                        <XAxis dataKey="type" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

