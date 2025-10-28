import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, CheckCircle, Clock, XCircle } from "lucide-react";

interface OnboardingEmployee {
  id: string;
  employee_id: string;
  onboarding_status: string;
  must_change_password: boolean;
  join_date: string;
  position: string;
  department: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function OnboardingTracker() {
  const [employees, setEmployees] = useState<OnboardingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    notStarted: 0,
    inProgress: 0,
    completed: 0,
  });

  useEffect(() => {
    fetchOnboardingEmployees();
  }, []);

  const fetchOnboardingEmployees = async () => {
    const { data } = await supabase
      .from('employees')
      .select(`
        id,
        employee_id,
        onboarding_status,
        must_change_password,
        join_date,
        position,
        department,
        profiles!employees_user_id_fkey(first_name, last_name, email)
      `)
      .in('onboarding_status', ['not_started', 'in_progress', 'pending'])
      .order('join_date', { ascending: false });

    if (data) {
      setEmployees(data as any);
      
      // Calculate stats
      const notStarted = data.filter(e => e.onboarding_status === 'not_started' || e.onboarding_status === 'pending').length;
      const inProgress = data.filter(e => e.onboarding_status === 'in_progress').length;
      const completed = data.filter(e => e.onboarding_status === 'completed').length;
      
      setStats({ notStarted, inProgress, completed });
    }
    setLoading(false);
  };

  const getStatusBadge = (status: string, mustChangePassword: boolean) => {
    if (mustChangePassword) {
      return <Badge variant="outline" className="bg-yellow-50">Awaiting Password Setup</Badge>;
    }
    
    switch (status) {
      case 'not_started':
      case 'pending':
        return <Badge variant="outline" className="bg-red-50">Not Started</Badge>;
      case 'in_progress':
        return <Badge variant="outline" className="bg-blue-50">In Progress</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-50">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string, mustChangePassword: boolean) => {
    if (mustChangePassword) return <Clock className="h-4 w-4 text-yellow-600" />;
    
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      default:
        return <XCircle className="h-4 w-4 text-red-600" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Onboarding Tracker</h1>
          <p className="text-muted-foreground">Monitor employee onboarding progress</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Not Started</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.notStarted}</div>
              <p className="text-xs text-muted-foreground">Employees pending onboarding</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">Currently onboarding</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">Successfully onboarded</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No employees in onboarding</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(employee.onboarding_status, employee.must_change_password)}
                          <div>
                            <div className="font-medium">
                              {employee.profiles.first_name} {employee.profiles.last_name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {employee.employee_id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{employee.profiles.email}</TableCell>
                      <TableCell>{employee.position}</TableCell>
                      <TableCell>{employee.department}</TableCell>
                      <TableCell>{new Date(employee.join_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {getStatusBadge(employee.onboarding_status, employee.must_change_password)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
