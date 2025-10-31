import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, Calendar, TrendingUp, AlertCircle, CheckCircle, Circle, BarChart3, Building2, DollarSign, Target, Activity, Briefcase, UserCheck, FileText, ArrowUpRight, ArrowDownRight, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface DashboardStats {
  totalEmployees: number;
  pendingApprovals: number;
  leaveBalance: number;
  avgAttendance: number;
}

interface CEODashboardStats {
  totalEmployees: number;
  activeProjects: number;
  pendingApprovals: number;
  pendingLeaves: number;
  pendingTimesheets: number;
  activeAssignments: number;
  employeeGrowth: number;
  topDepartments: Array<{ name: string; count: number }>;
  projectUtilization: Array<any>;
}

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    pendingApprovals: 0,
    leaveBalance: 0,
    avgAttendance: 0,
  });
  const [presenceStatus, setPresenceStatus] = useState<string>('online');
  const [hasActiveLeave, setHasActiveLeave] = useState(false);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkedInSince, setCheckedInSince] = useState<string | null>(null);
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [ceoStats, setCeoStats] = useState<CEODashboardStats>({
    totalEmployees: 0,
    activeProjects: 0,
    pendingApprovals: 0,
    pendingLeaves: 0,
    pendingTimesheets: 0,
    activeAssignments: 0,
    employeeGrowth: 0,
    topDepartments: [],
    projectUtilization: [],
  });

  useEffect(() => {
    checkOnboardingStatus();
    if (userRole === 'ceo') {
      fetchCEODashboardStats();
    } else {
      fetchDashboardStats();
      fetchCheckInStatus();
      fetchTodayCheckIns();
    }
    fetchPresenceStatus();

    // Poll for presence updates every 15 seconds
    const presenceInterval = setInterval(() => {
      fetchPresenceStatus();
      if (userRole !== 'ceo') {
        fetchCheckInStatus();
      }
    }, 15000);

    return () => {
      clearInterval(presenceInterval);
    };
  }, [user]);

  const fetchDashboardStats = async () => {
    if (!user) return;

    try {
      // Get employees count
      const employees = await api.getEmployees();
      const employeeCount = employees.filter((e: any) => e.status === 'active').length;

      // Pending approvals
      let pendingCount = 0;
      if (userRole && ['manager', 'hr', 'director', 'ceo'].includes(userRole)) {
        const counts = await api.getPendingCounts();
        pendingCount = counts.timesheets + counts.leaves;
      }

      // Get leave balance for employees/managers
      let leaveBalance = 0;
      if (userRole && ['employee', 'manager'].includes(userRole)) {
        try {
          const balance = await api.getLeaveBalance();
          leaveBalance = balance.leaveBalance || 0;
        } catch (error) {
          console.error('Error fetching leave balance:', error);
        }
      }

      setStats({
        totalEmployees: employeeCount,
        pendingApprovals: pendingCount,
        leaveBalance,
        avgAttendance: 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  };

  const fetchCEODashboardStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      // Fetch analytics data for comprehensive CEO dashboard
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/analytics`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      
      if (!resp.ok) {
        throw new Error('Failed to fetch analytics');
      }
      
      const data = await resp.json();
      
      // Get pending counts
      const counts = await api.getPendingCounts();
      
      setCeoStats({
        totalEmployees: data.overall?.total_employees || 0,
        activeProjects: data.overall?.active_projects || 0,
        pendingApprovals: counts.timesheets + counts.leaves,
        pendingLeaves: counts.leaves,
        pendingTimesheets: counts.timesheets,
        activeAssignments: data.overall?.active_assignments || 0,
        employeeGrowth: data.employeeGrowth?.slice(-1)[0]?.count || 0,
        topDepartments: (data.departmentData || []).slice(0, 5).map((row: any) => ({ 
          name: row.name, 
          count: parseInt(row.value) || 0 
        })),
        projectUtilization: data.projectUtilization || [],
      });
    } catch (error) {
      console.error('Error fetching CEO dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPresenceStatus = async () => {
    if (!user) return;

    try {
      const presence = await api.getPresenceStatus();
      setPresenceStatus(presence.presence_status || 'online');
      setHasActiveLeave(presence.has_active_leave || false);
    } catch (error) {
      console.error('Error fetching presence status:', error);
    }
  };

  const handlePresenceChange = async (newStatus: string) => {
    try {
      await api.updatePresenceStatus(newStatus as any);
      setPresenceStatus(newStatus);
      toast({
        title: 'Status Updated',
        description: `Your presence is now ${newStatus.replace('_', ' ')}`,
      });
    } catch (error: any) {
      console.error('Error updating presence status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update presence status',
        variant: 'destructive',
      });
    }
  };

  const fetchCheckInStatus = async () => {
    if (!user) return;

    try {
      const status = await api.getCheckInStatus();
      setIsCheckedIn(status.checkedIn);
      setCheckedInSince(status.checkedInSince);
    } catch (error) {
      console.error('Error fetching check-in status:', error);
    }
  };

  const fetchTodayCheckIns = async () => {
    if (!user) return;

    try {
      const records = await api.getTodayCheckIns();
      setTodayRecords(records);
    } catch (error) {
      console.error('Error fetching today check-ins:', error);
    }
  };

  const handleCheckIn = async () => {
    try {
      await api.checkIn();
      await fetchCheckInStatus();
      await fetchTodayCheckIns();
      toast({
        title: 'Checked In',
        description: 'You have successfully checked in',
      });
    } catch (error: any) {
      console.error('Error checking in:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to check in',
        variant: 'destructive',
      });
    }
  };

  const handleCheckOut = async () => {
    try {
      await api.checkOut();
      await fetchCheckInStatus();
      await fetchTodayCheckIns();
      toast({
        title: 'Checked Out',
        description: 'You have successfully checked out',
      });
    } catch (error: any) {
      console.error('Error checking out:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to check out',
        variant: 'destructive',
      });
    }
  };

  const calculateTotalHoursToday = () => {
    return todayRecords.reduce((total, record) => {
      return total + (Number(record.hours_worked) || 0);
    }, 0);
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const checkOnboardingStatus = async () => {
    if (!user || userRole === 'hr' || userRole === 'director' || userRole === 'ceo') {
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  const getPresenceColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'away': return 'text-red-500';
      case 'break': return 'text-yellow-500';
      case 'out_of_office': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const getPresenceLabel = (status: string) => {
    if (status === 'out_of_office' && hasActiveLeave) {
      return 'Out of Office (but available)';
    }
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // CEO Dashboard View
  if (userRole === 'ceo') {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">CEO Dashboard</h1>
              <p className="text-muted-foreground">Strategic overview of your organization</p>
            </div>
            {/* Presence Status Selector */}
            <div className="flex items-center gap-3">
              <Circle className={`h-3 w-3 ${getPresenceColor(presenceStatus)} rounded-full`} fill="currentColor" />
              <Select value={presenceStatus} onValueChange={handlePresenceChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">
                    <div className="flex items-center gap-2">
                      <Circle className="h-2 w-2 text-green-500" fill="currentColor" />
                      Online
                    </div>
                  </SelectItem>
                  <SelectItem value="away">
                    <div className="flex items-center gap-2">
                      <Circle className="h-2 w-2 text-red-500" fill="currentColor" />
                      Away
                    </div>
                  </SelectItem>
                  <SelectItem value="break">
                    <div className="flex items-center gap-2">
                      <Circle className="h-2 w-2 text-yellow-500" fill="currentColor" />
                      Break
                    </div>
                  </SelectItem>
                  <SelectItem value="out_of_office">
                    <div className="flex items-center gap-2">
                      <Circle className="h-2 w-2 text-blue-500" fill="currentColor" />
                      Out of Office
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Key Metrics - Interactive Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="transition-all hover:shadow-lg cursor-pointer group" onClick={() => navigate('/employees')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{ceoStats.totalEmployees}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <ArrowUpRight className="h-3 w-3 text-green-500" />
                  <span>Active workforce</span>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg cursor-pointer group" onClick={() => navigate('/ceo/dashboard')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                <Briefcase className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{ceoStats.activeProjects}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <Target className="h-3 w-3 text-blue-500" />
                  <span>In progress</span>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg cursor-pointer group" onClick={() => navigate('/timesheet-approvals')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Timesheets</CardTitle>
                <Clock className="h-4 w-4 text-warning group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{ceoStats.pendingTimesheets}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <AlertCircle className="h-3 w-3 text-orange-500" />
                  <span>Requires action</span>
                </div>
              </CardContent>
            </Card>

            <Card className="transition-all hover:shadow-lg cursor-pointer group" onClick={() => navigate('/leaves')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Leaves</CardTitle>
                <Calendar className="h-4 w-4 text-warning group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{ceoStats.pendingLeaves}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <AlertCircle className="h-3 w-3 text-orange-500" />
                  <span>Needs review</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Department Distribution & Project Utilization */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Top Departments
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/employees')}>
                    View All
                    <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ceoStats.topDepartments.length > 0 ? (
                    ceoStats.topDepartments.map((dept, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Users className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{dept.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{dept.count}</span>
                          <span className="text-xs text-muted-foreground">employees</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No department data available</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Project Utilization
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/ceo/dashboard')}>
                    View All
                    <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ceoStats.projectUtilization.length > 0 ? (
                    ceoStats.projectUtilization.slice(0, 5).map((project: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{project.project_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {project.assigned_employees || 0} employees
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">
                            {Number(project.avg_allocation || 0).toFixed(0)}%
                          </span>
                          <div className="h-8 w-1 bg-primary rounded-full" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No project data available</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <Button variant="outline" className="justify-start h-auto py-3 flex-col items-start hover:bg-primary/5" asChild>
                  <Link to="/employees/new">
                    <UserCheck className="h-5 w-5 mb-2" />
                    <span className="font-semibold">Add Employee</span>
                    <span className="text-xs text-muted-foreground">Onboard new team member</span>
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-3 flex-col items-start hover:bg-primary/5" asChild>
                  <Link to="/projects/new">
                    <Briefcase className="h-5 w-5 mb-2" />
                    <span className="font-semibold">New Project</span>
                    <span className="text-xs text-muted-foreground">Start a new initiative</span>
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-3 flex-col items-start hover:bg-primary/5" asChild>
                  <Link to="/analytics">
                    <BarChart3 className="h-5 w-5 mb-2" />
                    <span className="font-semibold">View Analytics</span>
                    <span className="text-xs text-muted-foreground">Deep dive into data</span>
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start h-auto py-3 flex-col items-start hover:bg-primary/5" asChild>
                  <Link to="/employee-stats">
                    <Activity className="h-5 w-5 mb-2" />
                    <span className="font-semibold">Employee Stats</span>
                    <span className="text-xs text-muted-foreground">Performance insights</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Strategic Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{ceoStats.activeAssignments}</div>
                <p className="text-xs text-muted-foreground mt-1">Current project assignments</p>
              </CardContent>
            </Card>

            <Card className="bg-success/5 border-success/20">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Analytics Dashboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">View comprehensive insights</span>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/analytics')}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-warning/5 border-warning/20">
              <CardHeader>
                <CardTitle className="text-sm font-medium">CEO Staffing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Manage project staffing</span>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/ceo/dashboard')}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Regular Dashboard View
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Overview of your organization</p>
          </div>
          {/* Presence Status Selector */}
          <div className="flex items-center gap-3">
            <Circle className={`h-3 w-3 ${getPresenceColor(presenceStatus)} rounded-full`} fill="currentColor" />
            <Select value={presenceStatus} onValueChange={handlePresenceChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">
                  <div className="flex items-center gap-2">
                    <Circle className="h-2 w-2 text-green-500" fill="currentColor" />
                    Online
                  </div>
                </SelectItem>
                <SelectItem value="away">
                  <div className="flex items-center gap-2">
                    <Circle className="h-2 w-2 text-red-500" fill="currentColor" />
                    Away
                  </div>
                </SelectItem>
                <SelectItem value="break">
                  <div className="flex items-center gap-2">
                    <Circle className="h-2 w-2 text-yellow-500" fill="currentColor" />
                    Break
                  </div>
                </SelectItem>
                <SelectItem value="out_of_office">
                  <div className="flex items-center gap-2">
                    <Circle className="h-2 w-2 text-blue-500" fill="currentColor" />
                    Out of Office
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="transition-all hover:shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Employees
              </CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground mt-1">Active employees</p>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Approvals
              </CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingApprovals}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.pendingApprovals > 0 ? 'Awaiting review' : 'No pending items'}
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Leave Balance
              </CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.leaveBalance}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.leaveBalance > 0 ? 'Days remaining' : 'No leave balance'}
              </p>
            </CardContent>
          </Card>

          <Card className="transition-all hover:shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Attendance
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgAttendance}%</div>
              <p className="text-xs text-muted-foreground mt-1">Timesheet approval rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Check-In/Check-Out Card */}
        {userRole !== 'ceo' && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h3 className="font-bold text-lg mb-1">Time Tracking</h3>
                  <p className="text-sm text-muted-foreground">
                    {isCheckedIn 
                      ? `Checked in since ${checkedInSince ? formatTime(checkedInSince) : 'N/A'}` 
                      : 'Not checked in today'}
                  </p>
                  {todayRecords.length > 0 && (
                    <p className="text-sm font-medium text-primary mt-2">
                      Total today: {calculateTotalHoursToday().toFixed(2)} hours
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isCheckedIn ? (
                    <Button 
                      variant="destructive" 
                      size="lg" 
                      onClick={handleCheckOut}
                      className="gap-2"
                    >
                      <LogOut className="h-5 w-5" />
                      Check Out
                    </Button>
                  ) : (
                    <Button 
                      variant="default" 
                      size="lg" 
                      onClick={handleCheckIn}
                      className="gap-2"
                    >
                      <LogIn className="h-5 w-5" />
                      Check In
                    </Button>
                  )}
                </div>
              </div>
              {todayRecords.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Today's Sessions</p>
                  <div className="space-y-2">
                    {todayRecords.map((record, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-background rounded-lg">
                        <div className="flex items-center gap-3">
                          <Circle className="h-2 w-2 text-green-500" fill="currentColor" />
                          <span className="text-sm">
                            {record.check_in_time && formatTime(record.check_in_time)}
                            {record.check_out_time && ` - ${formatTime(record.check_out_time)}`}
                            {!record.check_out_time && ' - Active'}
                          </span>
                        </div>
                        {record.hours_worked && (
                          <span className="text-sm font-medium">
                            {Number(record.hours_worked).toFixed(2)}h
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-warning" />
                Quick Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">
                  {stats.pendingApprovals > 0 
                    ? `You have ${stats.pendingApprovals} pending approval${stats.pendingApprovals > 1 ? 's' : ''}`
                    : 'All caught up! No pending approvals'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">All systems operational</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {(userRole === 'hr' || userRole === 'director' || userRole === 'ceo') && (
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <Button variant="outline" className="justify-start" asChild>
                  <Link to="/employees/new">
                    <Users className="mr-2 h-4 w-4" />
                    Add Employee
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link to="/employees/import">
                    <Users className="mr-2 h-4 w-4" />
                    Import CSV
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link to="/workflows/new">
                    <Users className="mr-2 h-4 w-4" />
                    Create Workflow
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link to="/policies">
                    <Users className="mr-2 h-4 w-4" />
                    Configure Policies
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
