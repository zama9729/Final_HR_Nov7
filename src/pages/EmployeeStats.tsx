import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppLayout } from "@/components/layout/AppLayout";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { User, Briefcase, Clock, DollarSign, Calendar } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { format } from "date-fns";

interface EmployeeStat {
  employee_id: string;
  employee_name: string;
  employee_email: string;
  department: string;
  position: string;
  project_count: number;
  total_allocation: number;
  timesheet_count: number;
  total_hours_logged: number;
  timesheet_entry_count: number;
  billable_entries: number;
  non_billable_entries: number;
  internal_entries: number;
  projects: Array<{
    project_id: string;
    project_name: string;
    role: string;
    allocation_percent?: number;
    percent_allocation?: number;
    start_date: string;
    end_date: string | null;
  }>;
}

export default function EmployeeStats() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<EmployeeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [allocationFilter, setAllocationFilter] = useState<string>('all');
  const [billableFilter, setBillableFilter] = useState<string>('all');
  const [weeklyHoursFilter, setWeeklyHoursFilter] = useState<string>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [filteredStats, setFilteredStats] = useState<EmployeeStat[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchEmployees();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [stats, allocationFilter, billableFilter, weeklyHoursFilter, selectedEmployee]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (startDate) params.startDate = format(startDate, "yyyy-MM-dd");
      if (endDate) params.endDate = format(endDate, "yyyy-MM-dd");
      
      const data = await api.getEmployeeStats(params);
      // Ensure data is an array
      const statsArray = Array.isArray(data) ? data : [];
      setStats(statsArray);
      setFilteredStats(statsArray);
    } catch (error: any) {
      console.error('Error fetching employee stats:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch employee statistics",
        variant: "destructive",
      });
      setStats([]);
      setFilteredStats([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...stats];

    // Filter by employee
    if (selectedEmployee !== 'all') {
      filtered = filtered.filter(stat => stat.employee_id === selectedEmployee);
    }

    // Filter by allocation status
    if (allocationFilter === 'allocated') {
      filtered = filtered.filter(stat => stat.project_count > 0);
    } else if (allocationFilter === 'not-allocated') {
      filtered = filtered.filter(stat => stat.project_count === 0);
    }

    // Filter by billable entries
    if (billableFilter === 'has-billable') {
      filtered = filtered.filter(stat => stat.billable_entries > 0);
    } else if (billableFilter === 'only-non-billable') {
      filtered = filtered.filter(stat => stat.non_billable_entries > 0 && stat.billable_entries === 0);
    }

    // Filter by weekly hours
    if (weeklyHoursFilter === 'under-20') {
      filtered = filtered.filter(stat => stat.total_hours_logged < 20);
    } else if (weeklyHoursFilter === '20-40') {
      filtered = filtered.filter(stat => stat.total_hours_logged >= 20 && stat.total_hours_logged < 40);
    } else if (weeklyHoursFilter === 'over-40') {
      filtered = filtered.filter(stat => stat.total_hours_logged >= 40);
    }

    setFilteredStats(filtered);
  };

  const handleFilter = () => {
    fetchStats();
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (userRole && !['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
    return (
      <AppLayout>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">You don't have permission to view this page.</p>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Employee Analytics</h1>
            <p className="text-muted-foreground mt-1">
              View detailed statistics and analytics for all employees
            </p>
          </div>
        </div>

        {/* Filters Bar */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-bold text-lg">Filters</span>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  mode="range"
                  placeholder="Select date range"
                  className="h-9"
                />
              </div>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.profiles?.first_name} {emp.profiles?.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={allocationFilter} onValueChange={setAllocationFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Allocation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="allocated">Allocated</SelectItem>
                  <SelectItem value="not-allocated">Not Allocated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={billableFilter} onValueChange={setBillableFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Billable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has-billable">Has Billable</SelectItem>
                  <SelectItem value="only-non-billable">Only Non-Billable</SelectItem>
                </SelectContent>
              </Select>
              <Select value={weeklyHoursFilter} onValueChange={setWeeklyHoursFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Weekly Hours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="under-20">&lt; 20 hrs</SelectItem>
                  <SelectItem value="20-40">20-40 hrs</SelectItem>
                  <SelectItem value="over-40">&gt; 40 hrs</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleFilter} className="h-9">Apply</Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Loading employee statistics...</p>
            </CardContent>
          </Card>
        ) : filteredStats.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">No employee statistics found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredStats.map((stat) => (
              <Card key={stat.employee_id} className="flex flex-col">
                <CardContent className="p-6">
                  {/* Employee Profile Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-16 w-16">
                      <AvatarImage />
                      <AvatarFallback className="text-xl bg-primary/20">
                        {getInitials(stat.employee_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{stat.employee_name}</h3>
                      <p className="text-sm text-muted-foreground">{stat.employee_email}</p>
                      {stat.department && (
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="font-normal text-xs">
                            <span className="h-2 w-2 rounded-full bg-green-500 mr-1 inline-block"></span>
                            {stat.department}
                          </Badge>
                          {stat.position && (
                            <Badge variant="outline" className="font-normal text-xs">{stat.position}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Allocation Status */}
                  <div className="mb-4 flex items-center gap-2">
                    {stat.project_count > 0 ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span className="text-sm font-medium">Allocated to Project</span>
                      </>
                    ) : (
                      <>
                        <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                        <span className="text-sm font-medium">Not Allocated to Project</span>
                      </>
                    )}
                  </div>
                  
                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Active Projects</p>
                      <p className="text-xl font-bold">{stat.project_count}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Total Allocation</p>
                      <p className="text-xl font-bold">{Number(stat.total_allocation) || 0}%</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Timesheets</p>
                      <p className="text-xl font-bold">{stat.timesheet_count}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Hours Logged</p>
                      <p className="text-xl font-bold">{Number(stat.total_hours_logged).toFixed(0)}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Billable Entries</p>
                      <p className="text-xl font-bold">{stat.billable_entries}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Non-Billable</p>
                      <p className="text-xl font-bold">{stat.non_billable_entries}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

