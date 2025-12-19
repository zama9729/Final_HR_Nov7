import { useEffect, useMemo, useState } from "react";
import { addDays, format, isAfter, isBefore, isSameDay, parseISO, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth } from "date-fns";
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
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, LineChart, Line, Legend } from "recharts";
import { CalendarDays, Clock, ListFilter, Search, User, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";

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

// Removed ViewMode - only calendar view now

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
  // Removed viewMode - only calendar view
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [shiftTrends, setShiftTrends] = useState<{
    thisMonth: Record<string, number>;
    lastMonth: Record<string, number>;
  }>({ thisMonth: {}, lastMonth: {} });
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
  const [viewMode, setViewMode] = useState<"my" | "team">("my");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [teamShifts, setTeamShifts] = useState<Shift[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

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
            const shiftsData = await api.getShiftsForEmployee(me.id);
            // Handle both array and object response formats
            data = Array.isArray(shiftsData) ? shiftsData : (shiftsData?.shifts || shiftsData || []);
          } else {
            data = [];
          }
        }
        // Ensure data is properly formatted
        const formattedShifts = Array.isArray(data) ? data.map((shift: any) => ({
          id: shift.id,
          employee_id: shift.employee_id,
          shift_date: shift.shift_date || shift.shiftDate,
          start_time: shift.start_time || shift.startTime,
          end_time: shift.end_time || shift.endTime,
          shift_type: shift.shift_type || shift.shiftType || 'regular',
          notes: shift.notes,
          status: shift.status || 'scheduled',
          location: shift.location,
          project_name: shift.project_name,
          employees: shift.employees,
        })) : [];
        setShifts(formattedShifts);
        
        // Calculate shift trends for this month and last month
        const now = new Date();
        const thisMonthStart = startOfMonth(now);
        const thisMonthEnd = endOfMonth(now);
        const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const lastMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        
        const thisMonthShifts = formattedShifts.filter((s) => {
          const date = parseISO(s.shift_date);
          return date >= thisMonthStart && date <= thisMonthEnd;
        });
        const lastMonthShifts = formattedShifts.filter((s) => {
          const date = parseISO(s.shift_date);
          return date >= lastMonthStart && date <= lastMonthEnd;
        });
        
        const thisMonthCounts: Record<string, number> = {};
        const lastMonthCounts: Record<string, number> = {};
        
        thisMonthShifts.forEach((s) => {
          const type = (s.shift_type || 'regular').toLowerCase();
          // Normalize shift types for consistent counting
          if (type === 'day' || type === 'regular') {
            thisMonthCounts['morning'] = (thisMonthCounts['morning'] || 0) + 1;
          } else if (type === 'ad-hoc') {
            thisMonthCounts['adhoc'] = (thisMonthCounts['adhoc'] || 0) + 1;
          } else {
            thisMonthCounts[type] = (thisMonthCounts[type] || 0) + 1;
          }
        });
        lastMonthShifts.forEach((s) => {
          const type = (s.shift_type || 'regular').toLowerCase();
          // Normalize shift types for consistent counting
          if (type === 'day' || type === 'regular') {
            lastMonthCounts['morning'] = (lastMonthCounts['morning'] || 0) + 1;
          } else if (type === 'ad-hoc') {
            lastMonthCounts['adhoc'] = (lastMonthCounts['adhoc'] || 0) + 1;
          } else {
            lastMonthCounts[type] = (lastMonthCounts[type] || 0) + 1;
          }
        });
        
        console.log('[MyShifts] Shift trends calculated:', { thisMonth: thisMonthCounts, lastMonth: lastMonthCounts });
        setShiftTrends({ thisMonth: thisMonthCounts, lastMonth: lastMonthCounts });
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
  }, [isManager, toast, currentMonth, viewMode, selectedEmployeeId]);

  // Load team members for managers
  useEffect(() => {
    if (!isManager || viewMode !== "team") return;
    
    const loadTeam = async () => {
      try {
        const me = await api.getEmployeeId().catch(() => null);
        if (me?.id) {
          const reports = await api.getManagerDirectReports(me.id);
          setTeamMembers(reports || []);
          if (reports && reports.length > 0 && !selectedEmployeeId) {
            setSelectedEmployeeId(reports[0].employee_id || reports[0].id);
          }
        }
      } catch (error: any) {
        console.error("[MyShifts] Failed to load team members", error);
      }
    };
    
    loadTeam();
  }, [isManager, viewMode, selectedEmployeeId]);

  // Load team shifts when employee is selected
  useEffect(() => {
    if (!isManager || viewMode !== "team" || !selectedEmployeeId) {
      setTeamShifts([]);
      return;
    }
    
    const loadTeamShifts = async () => {
      setLoadingTeam(true);
      try {
        const shiftsData = await api.getShiftsForEmployee(selectedEmployeeId);
        const data = Array.isArray(shiftsData) ? shiftsData : (shiftsData?.shifts || shiftsData || []);
        const formattedShifts = Array.isArray(data) ? data.map((shift: any) => ({
          id: shift.id,
          employee_id: shift.employee_id,
          shift_date: shift.shift_date || shift.shiftDate,
          start_time: shift.start_time || shift.startTime,
          end_time: shift.end_time || shift.endTime,
          shift_type: shift.shift_type || shift.shiftType || 'regular',
          notes: shift.notes,
          status: shift.status || 'scheduled',
          location: shift.location,
          project_name: shift.project_name,
          employees: shift.employees,
        })) : [];
        setTeamShifts(formattedShifts);
      } catch (error: any) {
        console.error("[MyShifts] Failed to load team shifts", error);
        toast({
          title: "Error loading team shifts",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingTeam(false);
      }
    };
    
    loadTeamShifts();
  }, [selectedEmployeeId, viewMode, isManager, toast, currentMonth]);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  // Filter shifts for current month only - use team shifts if in team view
  const shiftsToDisplay = viewMode === "team" && isManager ? teamShifts : shifts;
  const filteredShifts = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return shiftsToDisplay.filter((shift) => {
      const date = parseISO(shift.shift_date);
      const inMonth = date >= monthStart && date <= monthEnd;
      return inMonth;
    });
  }, [shiftsToDisplay, currentMonth]);

  // Month calendar view
  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Add leading days from previous month to fill first week
    const firstDay = days[0];
    const firstDayOfWeek = firstDay.getDay();
    const leadingDays: Date[] = [];
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      leadingDays.push(addDays(firstDay, -i - 1));
    }
    
    // Add trailing days from next month to fill last week
    const lastDay = days[days.length - 1];
    const lastDayOfWeek = lastDay.getDay();
    const trailingDays: Date[] = [];
    for (let i = 1; i <= 6 - lastDayOfWeek; i++) {
      trailingDays.push(addDays(lastDay, i));
    }
    
    return [...leadingDays, ...days, ...trailingDays];
  }, [currentMonth]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const start = filters.quickRange === "week" ? weekStart : startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < 7; i++) days.push(addDays(start, i));
    return days;
  }, [filters.quickRange, weekStart]);

  const shiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    // Use monthDays for calendar view
    monthDays.forEach((d) => {
      map[format(d, "yyyy-MM-dd")] = [];
    });
    
    // Group shifts by date and employee - only keep one shift per employee per day
    const shiftsByDateAndEmployee: Record<string, Record<string, Shift>> = {};
    filteredShifts.forEach((shift) => {
      const key = shift.shift_date.split("T")[0]; // Extract date part (yyyy-MM-dd)
      if (!shiftsByDateAndEmployee[key]) {
        shiftsByDateAndEmployee[key] = {};
      }
      // Only keep the first shift for each employee on each day
      if (!shiftsByDateAndEmployee[key][shift.employee_id]) {
        shiftsByDateAndEmployee[key][shift.employee_id] = shift;
      }
    });
    
    // Convert back to array format
    Object.keys(shiftsByDateAndEmployee).forEach((dateKey) => {
      map[dateKey] = Object.values(shiftsByDateAndEmployee[dateKey]);
    });
    
    return map;
  }, [filteredShifts, monthDays]);

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

  // Calculate KPI counts for current month and last month for comparison
  const kpiCounts = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const lastMonthStart = startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const lastMonthEnd = endOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    
    // Use shiftsToDisplay to get correct shifts (my or team)
    const monthShifts = shiftsToDisplay.filter((s) => {
      const date = parseISO(s.shift_date);
      return date >= monthStart && date <= monthEnd;
    });
    
    const lastMonthShifts = shiftsToDisplay.filter((s) => {
      const date = parseISO(s.shift_date);
      return date >= lastMonthStart && date <= lastMonthEnd;
    });
    
    const calculateCounts = (shiftList: Shift[]) => {
      const counts: Record<string, number> = {
        night: 0,
        morning: 0,
        evening: 0,
        custom: 0,
        adhoc: 0,
      };
      
      shiftList.forEach((s) => {
        const type = (s.shift_type || "regular").toLowerCase();
        if (type === 'night') counts.night++;
        else if (type === 'morning' || type === 'day' || type === 'regular') counts.morning++;
        else if (type === 'evening') counts.evening++;
        else if (type === 'custom') counts.custom++;
        else if (type === 'ad-hoc' || type === 'adhoc') counts.adhoc++;
      });
      
      return counts;
    };
    
    const thisMonth = calculateCounts(monthShifts);
    const lastMonth = calculateCounts(lastMonthShifts);
    
    return {
      thisMonth,
      lastMonth,
      trends: {
        night: { current: thisMonth.night, previous: lastMonth.night },
        morning: { current: thisMonth.morning, previous: lastMonth.morning },
        evening: { current: thisMonth.evening, previous: lastMonth.evening },
        custom: { current: thisMonth.custom, previous: lastMonth.custom },
        adhoc: { current: thisMonth.adhoc, previous: lastMonth.adhoc },
      },
    };
  }, [shiftsToDisplay, currentMonth]);

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
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "my" | "team")}>
                <TabsList>
                  <TabsTrigger value="my">My Shifts</TabsTrigger>
                  <TabsTrigger value="team">Team View</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        </div>

        {isManager && viewMode === "team" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Select Team Member</CardTitle>
                <CardDescription>View shifts for your team members</CardDescription>
              </CardHeader>
              <CardContent>
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team members found.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {teamMembers.map((member) => {
                      const empId = member.employee_id || member.id;
                      const name = member.name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Employee';
                      return (
                        <Button
                          key={empId}
                          variant={selectedEmployeeId === empId ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedEmployeeId(empId)}
                          className="justify-start"
                        >
                          <User className="h-4 w-4 mr-2" />
                          {name}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Team Overview - Who's working today and upcoming */}
            {selectedEmployeeId && teamShifts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Team Shift Overview</CardTitle>
                  <CardDescription>Today and upcoming shifts for selected team member</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(() => {
                      const today = new Date();
                      const next7Days = addDays(today, 7);
                      const upcoming = teamShifts
                        .filter((s) => {
                          const date = parseISO(s.shift_date);
                          return date >= today && date <= next7Days;
                        })
                        .slice(0, 5);
                      
                      if (upcoming.length === 0) {
                        return <p className="text-sm text-muted-foreground">No upcoming shifts in the next 7 days.</p>;
                      }
                      
                      return upcoming.map((shift) => {
                        const date = parseISO(shift.shift_date);
                        const isToday = isSameDay(date, today);
                        const member = teamMembers.find(m => (m.employee_id || m.id) === shift.employee_id);
                        const memberName = member?.name || `${member?.first_name || ''} ${member?.last_name || ''}`.trim() || 'Team Member';
                        
                        return (
                          <div key={shift.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{memberName}</span>
                                <Badge variant="outline" className="text-xs">
                                  {shiftTypeLabel[shift.shift_type || 'regular'] || shift.shift_type || 'Shift'}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {isToday ? 'Today' : format(date, "EEE, MMM d")} • {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                              </p>
                            </div>
                            {isManager && (userRole === 'hr' || userRole === 'admin' || userRole === 'ceo') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  toast({
                                    title: "Reassign Shift",
                                    description: "Shift reassignment feature coming soon.",
                                  });
                                }}
                              >
                                Reassign
                              </Button>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Left Column: KPIs and Trends */}
          <div className="space-y-4">
            {/* 5 KPI Blocks */}
            <div className="grid grid-cols-5 gap-3">
              {(['night', 'morning', 'evening', 'custom', 'adhoc'] as const).map((type) => {
                const trend = kpiCounts.trends[type];
                const change = trend.previous > 0 
                  ? ((trend.current - trend.previous) / trend.previous * 100)
                  : trend.current > 0 ? 100 : 0;
                const isIncrease = change > 0;
                const isDecrease = change < 0;
                const colors: Record<typeof type, { text: string; bg?: string }> = {
                  night: { text: 'text-purple-600' },
                  morning: { text: 'text-blue-600' },
                  evening: { text: 'text-emerald-600' },
                  custom: { text: 'text-amber-600' },
                  adhoc: { text: 'text-rose-600' },
                };
                const labels: Record<typeof type, string> = {
                  night: 'Night',
                  morning: 'Morning',
                  evening: 'Evening',
                  custom: 'Custom',
                  adhoc: 'Ad-hoc',
                };
                
                return (
                  <Card key={type}>
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground mb-1">{labels[type]}</div>
                      <div className="flex items-center gap-2">
                        <div className={`text-2xl font-bold ${colors[type].text}`}>{trend.current}</div>
                        {isIncrease && (
                          <div className="flex items-center gap-0.5 text-green-600">
                            <ArrowUp className="h-3 w-3" />
                            <span className="text-[10px]">{Math.abs(change).toFixed(0)}%</span>
                          </div>
                        )}
                        {isDecrease && (
                          <div className="flex items-center gap-0.5 text-red-600">
                            <ArrowDown className="h-3 w-3" />
                            <span className="text-[10px]">{Math.abs(change).toFixed(0)}%</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Shift Trends Chart - Match calendar height */}
            <Card className="flex flex-col flex-1">
              <CardHeader className="flex-shrink-0 pb-3">
                <CardTitle className="text-base">Shift Trends</CardTitle>
                <CardDescription>Monthly comparison</CardDescription>
              </CardHeader>
              <CardContent className="flex-1" style={{ minHeight: '450px', height: '450px' }}>
                {shiftTrends.thisMonth && Object.keys(shiftTrends.thisMonth).length > 0 || shiftTrends.lastMonth && Object.keys(shiftTrends.lastMonth).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[
                      { period: 'Last Month', night: shiftTrends.lastMonth['night'] || 0, morning: shiftTrends.lastMonth['morning'] || shiftTrends.lastMonth['day'] || shiftTrends.lastMonth['regular'] || 0, evening: shiftTrends.lastMonth['evening'] || 0, custom: shiftTrends.lastMonth['custom'] || 0, adhoc: shiftTrends.lastMonth['ad-hoc'] || shiftTrends.lastMonth['adhoc'] || 0 },
                      { period: 'This Month', night: shiftTrends.thisMonth['night'] || 0, morning: shiftTrends.thisMonth['morning'] || shiftTrends.thisMonth['day'] || shiftTrends.thisMonth['regular'] || 0, evening: shiftTrends.thisMonth['evening'] || 0, custom: shiftTrends.thisMonth['custom'] || 0, adhoc: shiftTrends.thisMonth['ad-hoc'] || shiftTrends.thisMonth['adhoc'] || 0 },
                    ]}>
                      <XAxis dataKey="period" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="night" stroke="#9333ea" strokeWidth={2} name="Night" />
                      <Line type="monotone" dataKey="morning" stroke="#3b82f6" strokeWidth={2} name="Morning" />
                      <Line type="monotone" dataKey="evening" stroke="#10b981" strokeWidth={2} name="Evening" />
                      <Line type="monotone" dataKey="custom" stroke="#f59e0b" strokeWidth={2} name="Custom" />
                      <Line type="monotone" dataKey="adhoc" stroke="#f43f5e" strokeWidth={2} name="Ad-hoc" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    No shift data available for comparison
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Calendar */}
          <div className="flex flex-col">
            <Card className="flex flex-col flex-1">
            <CardHeader className="flex-shrink-0 pb-3">
              <CardTitle className="text-base">Shifts</CardTitle>
              <CardDescription>Calendar view</CardDescription>
            </CardHeader>
            <CardContent className="flex-1" style={{ minHeight: '450px' }}>
              {(loading || (viewMode === "team" && loadingTeam)) ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Loading shifts...</div>
              ) : filteredShifts.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">
                  {viewMode === "team" ? "No shifts found for selected team member" : "No shifts found"}
                </div>
              ) : (
                  <div className="space-y-4">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                      >
                        Previous
                      </Button>
                      <h3 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                      >
                        Next
                      </Button>
                    </div>
                    
                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {/* Day Headers */}
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                          {day}
                        </div>
                      ))}
                      
                      {/* Calendar Days */}
                      {monthDays.map((day, idx) => {
                        const key = format(day, "yyyy-MM-dd");
                        const dayShifts = shiftsByDay[key] || [];
                        const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                        const isToday = isSameDay(day, new Date());
                        
                        // Get the primary shift for this day (only one shift per day per employee)
                        const primaryShift = dayShifts.length > 0 ? dayShifts[0] : null;
                        const shiftType = primaryShift?.shift_type || 'regular';
                        
                        const typeColors: Record<string, string> = {
                          night: "bg-purple-100 border-purple-300",
                          morning: "bg-blue-100 border-blue-300",
                          day: "bg-blue-100 border-blue-300",
                          regular: "bg-blue-100 border-blue-300",
                          evening: "bg-emerald-100 border-emerald-300",
                          custom: "bg-amber-100 border-amber-300",
                          'ad-hoc': "bg-rose-100 border-rose-300",
                          adhoc: "bg-rose-100 border-rose-300",
                        };
                        
                        const bgColor = typeColors[shiftType] || "bg-white";
                        const badgeColors: Record<string, string> = {
                          night: "bg-purple-500",
                          morning: "bg-blue-500",
                          day: "bg-blue-500",
                          regular: "bg-blue-500",
                          evening: "bg-emerald-500",
                          custom: "bg-amber-500",
                          'ad-hoc': "bg-rose-500",
                          adhoc: "bg-rose-500",
                        };
                        
                        return (
                          <div
                            key={idx}
                            className={`min-h-[80px] p-1.5 border rounded-md ${bgColor} ${!isCurrentMonth ? "opacity-40" : ""} ${isToday ? "ring-2 ring-primary" : ""}`}
                          >
                            <div className="text-xs font-medium mb-1">
                              {format(day, "d")}
                            </div>
                            {primaryShift && (
                              <div
                                className={`text-[10px] px-1 py-0.5 rounded ${badgeColors[shiftType] || "bg-gray-500"} text-white truncate`}
                                title={`${shiftTypeLabel[shiftType] || shiftType}: ${formatTime(primaryShift.start_time)} - ${formatTime(primaryShift.end_time)}`}
                              >
                                {shiftTypeLabel[shiftType] || shiftType}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Legend */}
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-purple-100 border border-purple-300"></div>
                        <span>Night Shift</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300"></div>
                        <span>Day Shift</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300"></div>
                        <span>Evening Shift</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300"></div>
                        <span>Custom Shift</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-rose-100 border border-rose-300"></div>
                        <span>Ad-hoc Shift</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

