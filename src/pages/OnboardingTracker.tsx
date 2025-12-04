import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"join_date" | "name" | "employee_id" | "status">("join_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetchOnboardingEmployees();
  }, []);

  const fetchOnboardingEmployees = async () => {
    try {
      setLoading(true);
      const data = await api.getOnboardingEmployees();
      
      if (data && Array.isArray(data)) {
        setEmployees(data as any);
        
        // Calculate stats
        const notStarted = data.filter((e: any) => e.onboarding_status === 'not_started' || e.onboarding_status === 'pending').length;
        const inProgress = data.filter((e: any) => e.onboarding_status === 'in_progress').length;
        const completed = data.filter((e: any) => e.onboarding_status === 'completed').length;
        
        setStats({ notStarted, inProgress, completed });
      } else {
        console.warn('Invalid data format from API:', data);
        setEmployees([]);
        setStats({ notStarted: 0, inProgress: 0, completed: 0 });
      }
    } catch (error: any) {
      console.error('Error fetching onboarding employees:', error);
      setEmployees([]);
      setStats({ notStarted: 0, inProgress: 0, completed: 0 });
    } finally {
      setLoading(false);
    }
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

  const normalizedStatus = (e: OnboardingEmployee) => {
    if (e.must_change_password) return "awaiting_password";
    if (e.onboarding_status === "not_started" || e.onboarding_status === "pending") return "not_started";
    if (e.onboarding_status === "in_progress") return "in_progress";
    if (e.onboarding_status === "completed") return "completed";
    return e.onboarding_status || "unknown";
  };

  const filteredAndSortedEmployees = useMemo(() => {
    let list = [...employees];

    if (statusFilter !== "all") {
      list = list.filter((e) => normalizedStatus(e) === statusFilter);
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "join_date") {
        cmp = new Date(a.join_date).getTime() - new Date(b.join_date).getTime();
      } else if (sortBy === "name") {
        const an = `${a.profiles?.first_name || ""} ${a.profiles?.last_name || ""}`.trim().toLowerCase();
        const bn = `${b.profiles?.first_name || ""} ${b.profiles?.last_name || ""}`.trim().toLowerCase();
        cmp = an.localeCompare(bn);
      } else if (sortBy === "employee_id") {
        cmp = (a.employee_id || "").localeCompare(b.employee_id || "");
      } else if (sortBy === "status") {
        cmp = normalizedStatus(a).localeCompare(normalizedStatus(b));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [employees, statusFilter, sortBy, sortDir]);

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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Employees</CardTitle>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filter</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-[170px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="awaiting_password">Awaiting password</SelectItem>
                      <SelectItem value="not_started">Not started</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sort by</span>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="Join date" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="join_date">Join date</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="employee_id">Employee ID</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Ascending" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredAndSortedEmployees.length === 0 ? (
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
                  {filteredAndSortedEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(employee.onboarding_status, employee.must_change_password)}
                          <div>
                            <div className="font-medium">
                              {employee.profiles?.first_name || ''} {employee.profiles?.last_name || ''}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {employee.employee_id}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{employee.profiles?.email || 'N/A'}</TableCell>
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
