import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Clock, Calendar, Bot, CalendarDays, CalendarClock, Briefcase, TrendingUp, AlertCircle, CheckCircle2, SunMedium, MoonStar } from "lucide-react";
import { format, startOfWeek, endOfWeek, isFuture, parseISO, addDays, isToday, isTomorrow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import CalendarPanel from "@/components/dashboard/CalendarPanel";

interface DashboardStats {
  timesheetHours: number;
  leaveBalance: number;
  nextHoliday: { date: string; name: string } | null;
  projects: Array<{ id: string; name: string; category?: string }>;
}

interface UpcomingShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  template_name: string;
  shift_type: string;
}

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    timesheetHours: 0,
    leaveBalance: 0,
    nextHoliday: null,
    projects: [],
  });
  const [presenceStatus, setPresenceStatus] = useState<string>('online');
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
    fetchDashboardStats();
    fetchPresenceStatus();
  }, [user]);

  useEffect(() => {
    if (userRole) {
      fetchUpcomingShifts();
    } else {
      setUpcomingShifts([]);
    }
  }, [userRole]);

  const fetchDashboardStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Get current week timesheet hours
      let timesheetHours = 0;
      try {
        const employeeId = await api.getEmployeeId();
        if (employeeId?.id) {
          const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          const timesheet = await api.getTimesheet(weekStart, weekEnd);
          
          // Use total_hours from timesheet if available, otherwise calculate from entries
          if (timesheet.total_hours !== undefined && timesheet.total_hours !== null) {
            timesheetHours = parseFloat(timesheet.total_hours) || 0;
          } else if (timesheet.entries && Array.isArray(timesheet.entries)) {
            // Calculate from entries, excluding holiday entries
            timesheetHours = timesheet.entries
              .filter((entry: any) => !entry.is_holiday)
              .reduce((total: number, entry: any) => {
                return total + (parseFloat(entry.hours || 0));
              }, 0);
          }
        }
      } catch (error) {
        console.error('Error fetching timesheet:', error);
      }

      // Get leave balance (for all roles that have employee records)
      let leaveBalance = 0;
      try {
        const balance = await api.getLeaveBalance();
        leaveBalance = balance.leaveBalance || 0;
      } catch (error: any) {
        // Only log error if it's not a 404 or permission issue
        const errorMsg = error?.message || String(error);
        if (!errorMsg.includes('not found') && !errorMsg.includes('permission')) {
          console.error('Error fetching leave balance:', error);
        }
      }

      // Get next holiday
      let nextHoliday: { date: string; name: string } | null = null;
      try {
        // Fetch holidays from the API
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/holidays?upcoming=true`,
          { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
        );
        if (response.ok) {
          const holidays = await response.json();
          if (holidays && holidays.length > 0) {
            const holiday = holidays[0];
            nextHoliday = {
              date: holiday.date,
              name: holiday.name || 'Holiday',
            };
          }
        }
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }

      // Get employee projects
      let projects: Array<{ id: string; name: string; category?: string }> = [];
      try {
        const employeeId = await api.getEmployeeId();
        if (employeeId?.id) {
          const employeeProjects = await api.getEmployeeProjects(employeeId.id);
          projects = (employeeProjects || []).map((p: any) => ({
            id: p.id || p.project_id,
            name: p.project_name || p.name,
            category: p.category || p.role || 'Project',
          })).slice(0, 3); // Limit to 3 projects
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      }

      setStats({
        timesheetHours: Math.round(timesheetHours),
        leaveBalance,
        nextHoliday,
        projects,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPresenceStatus = async () => {
    if (!user) return;

    try {
      const presence = await api.getPresenceStatus();
      setPresenceStatus(presence.presence_status || 'online');
    } catch (error) {
      console.error('Error fetching presence status:', error);
    }
  };

  const checkOnboardingStatus = async () => {
    if (!user || userRole === 'hr' || userRole === 'director' || userRole === 'ceo' || userRole === 'admin') {
      setIsLoading(false);
      return;
    }

    try {
      const employeeData = await api.checkEmployeePasswordChange();

      if (employeeData) {
        if (employeeData.onboarding_status === 'in_progress' || employeeData.onboarding_status === 'not_started' || employeeData.onboarding_status === 'pending') {
          navigate('/onboarding');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getFirstName = () => {
    const metadata = (user as any)?.user_metadata;
    return metadata?.first_name || user?.email?.split('@')[0] || 'User';
  };

  const formatHolidayDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMMM d');
    } catch {
      return dateStr;
    }
  };

  const isEmployee = userRole === 'employee';
  const showTimesheetCard = !isEmployee;

  const handleSubmitTimesheet = () => {
    navigate('/timesheets');
  };

  const handleApplyLeave = () => {
    navigate('/leaves');
  };

  const formatShiftTime = (time: string) => {
    if (!time) return '';
    // Convert 24h time to 12h format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getShiftDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const nextShift = upcomingShifts[0];
  const shiftVisual = nextShift
    ? nextShift.shift_type === 'night'
      ? {
          label: 'Night Shift',
          textColor: 'text-indigo-700 dark:text-indigo-200',
          badgeBg: 'bg-indigo-100 dark:bg-indigo-500/20',
          border: 'border-indigo-200 dark:border-indigo-500/40',
          icon: <MoonStar className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />,
        }
      : {
          label: 'Day Shift',
          textColor: 'text-sky-700 dark:text-sky-200',
          badgeBg: 'bg-amber-100 dark:bg-amber-500/20',
          border: 'border-amber-200 dark:border-amber-400/40',
          icon: <SunMedium className="h-5 w-5 text-amber-500 dark:text-amber-300" />,
        }
    : null;

  const fetchUpcomingShifts = async () => {
    if (!user) {
      setUpcomingShifts([]);
      return;
    }
    
    try {
      setLoadingShifts(true);
      const employeeId = await api.getEmployeeId();
      if (!employeeId?.id) {
        setLoadingShifts(false);
        return;
      }

      // Get upcoming shifts (next 7 days)
      const today = new Date();
      const nextWeek = addDays(today, 7);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/scheduling/employee/${employeeId.id}/shifts?start_date=${format(today, 'yyyy-MM-dd')}&end_date=${format(nextWeek, 'yyyy-MM-dd')}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const sorted = (data.shifts || []).sort((a: UpcomingShift, b: UpcomingShift) => {
          const dateCompare = new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime();
          if (dateCompare !== 0) return dateCompare;
          return a.start_time.localeCompare(b.start_time);
        });
        setUpcomingShifts(sorted);
      } else {
        setUpcomingShifts([]);
      }
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error);
    } finally {
      setLoadingShifts(false);
    }
  };


  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-6 p-6 animate-pulse">
          <div className="h-8 w-1/3 rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="h-32 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-64 rounded-lg bg-muted" />
          </div>
          <div className="h-[460px] rounded-lg bg-muted" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Welcome Section */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Welcome back, {getFirstName()}!</h1>
          <p className="text-muted-foreground">
            You are {presenceStatus === 'online' ? 'online' : presenceStatus.replace('_', ' ')}
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Timesheet Card */}
          {showTimesheetCard && (
            <Card className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Timesheet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-4">{stats.timesheetHours}</div>
                <Button 
                  onClick={handleSubmitTimesheet}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Submit
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Leave Balance Card */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Leave Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-4">{stats.leaveBalance}</div>
              <Button 
                onClick={handleApplyLeave}
                variant="outline"
                className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                Apply
              </Button>
            </CardContent>
          </Card>

          {/* Next Holiday Card */}
          <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next Holiday</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.nextHoliday ? (
                <>
                  <div className="text-3xl font-bold mb-1">
                    {formatHolidayDate(stats.nextHoliday.date)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{stats.nextHoliday.name}</p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-1">No upcoming</div>
                  <p className="text-sm text-muted-foreground mb-4">holiday</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Shifts Card */}
          <Card className="shadow-sm hover:shadow-md transition-shadow dark:border-slate-800 dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {isEmployee ? 'My Shifts' : 'Shift Schedule'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingShifts ? (
                  <div className="text-lg text-muted-foreground">Loading next shift…</div>
                ) : nextShift ? (
                  <div className={`relative rounded-2xl border ${shiftVisual?.border} bg-white dark:bg-slate-900 shadow-inner p-4 pl-14`}>
                    <div className={`absolute -top-3 -left-2 h-12 w-12 rounded-full ${shiftVisual?.badgeBg} flex items-center justify-center shadow`}>
                      {shiftVisual?.icon}
                    </div>
                    <div className={`text-2xl font-bold ${shiftVisual?.textColor}`}>
                      {shiftVisual?.label}
                    </div>
                    <p className="text-sm font-semibold text-slate-800">
                      {getShiftDateLabel(nextShift.shift_date)}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {formatShiftTime(nextShift.start_time)} – {formatShiftTime(nextShift.end_time)}
                    </p>
                    <Badge variant="outline" className="text-[11px] font-semibold dark:border-slate-700">
                      {nextShift.template_name}
                    </Badge>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No upcoming shifts scheduled</div>
                )}
                <Button
                  onClick={() => navigate(isEmployee ? '/my/profile?tab=shifts' : '/scheduling/calendar')}
                  variant="outline"
                  className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  {isEmployee ? 'View My Shifts' : 'View Calendar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Projects and AI Assistant */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* My Projects */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold">My Projects</CardTitle>
              <Link to="/projects" className="text-sm text-blue-600 hover:underline">
                View All
              </Link>
            </CardHeader>
            <CardContent>
              {stats.projects.length > 0 ? (
                <div className="space-y-3">
                  {stats.projects.map((project) => (
                    <div 
                      key={project.id}
                      className="p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">{project.category}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No projects assigned</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Assistant */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">AI Assistant</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Bot className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Need help? Ask AI to assist you.
              </p>
              <Button 
                onClick={() => navigate('/ai-assistant')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Ask AI
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Unified Team Calendar */}
        <div className="pt-2">
          <CalendarPanel />
        </div>
      </div>
    </AppLayout>
  );
}