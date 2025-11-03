import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Clock, Calendar, Bot } from "lucide-react";
import { format, startOfWeek, endOfWeek, isFuture, parseISO } from "date-fns";

interface DashboardStats {
  timesheetHours: number;
  leaveBalance: number;
  nextHoliday: { date: string; name: string } | null;
  projects: Array<{ id: string; name: string; category?: string }>;
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

  useEffect(() => {
    checkOnboardingStatus();
    fetchDashboardStats();
    fetchPresenceStatus();
  }, [user]);

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
          
          if (timesheet.entries && Array.isArray(timesheet.entries)) {
            timesheetHours = timesheet.entries.reduce((total: number, entry: any) => {
              return total + (parseFloat(entry.hours || 0));
            }, 0);
          }
        }
      } catch (error) {
        console.error('Error fetching timesheet:', error);
      }

      // Get leave balance
      let leaveBalance = 0;
      if (userRole && ['employee', 'manager'].includes(userRole)) {
        try {
          const balance = await api.getLeaveBalance();
          leaveBalance = balance.leaveBalance || 0;
        } catch (error) {
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
    return user?.user_metadata?.first_name || user?.email?.split('@')[0] || 'User';
  };

  const formatHolidayDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMMM d');
    } catch {
      return dateStr;
    }
  };

  const handleSubmitTimesheet = () => {
    navigate('/timesheets');
  };

  const handleApplyLeave = () => {
    navigate('/leaves');
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse">Loading...</div>
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

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Timesheet Card */}
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
      </div>
    </AppLayout>
  );
}