import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, Calendar, TrendingUp, AlertCircle, CheckCircle, Circle } from "lucide-react";
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

  useEffect(() => {
    checkOnboardingStatus();
    fetchDashboardStats();
    fetchPresenceStatus();

    // Poll for presence updates every 15 seconds
    const presenceInterval = setInterval(() => {
      fetchPresenceStatus();
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
