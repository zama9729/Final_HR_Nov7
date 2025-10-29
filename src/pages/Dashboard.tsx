import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, Calendar, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardStats {
  totalEmployees: number;
  pendingApprovals: number;
  activeLeaveRequests: number;
  avgAttendance: number;
}

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    pendingApprovals: 0,
    activeLeaveRequests: 0,
    avgAttendance: 0,
  });

  useEffect(() => {
    checkOnboardingStatus();
    fetchDashboardStats();
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

      // For now, set defaults (these would need API endpoints for full stats)
      setStats({
        totalEmployees: employeeCount,
        pendingApprovals: pendingCount,
        activeLeaveRequests: 0,
        avgAttendance: 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your organization</p>
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
                Active Leave Requests
              </CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeLeaveRequests}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeLeaveRequests > 0 ? 'Currently on leave' : 'No active requests'}
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
