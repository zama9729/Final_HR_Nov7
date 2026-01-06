import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  Plus,
  Upload,
  Download,
  MoreVertical,
  Circle,
  Users,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ShiftAssignmentDialog } from "@/components/shifts/ShiftAssignmentDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Employee {
  id: string;
  employee_id: string;
  department: string;
  position: string;
  status: string;
  presence_status?: string;
  display_presence_status?: string;
  onboarding_status?: string;
  join_date: string;
  last_presence_update?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
  };
  home_assignment?: {
    role?: string;
  };
}

export default function Employees() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [employeeToAction, setEmployeeToAction] = useState<Employee | null>(null);

  useEffect(() => {
    fetchEmployees();

    // Poll for employee presence updates every 15 seconds
    const presenceInterval = setInterval(() => {
      fetchEmployees();
    }, 15000);

    return () => {
      clearInterval(presenceInterval);
    };
  }, [user, userRole]);

  const fetchEmployees = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const isHROrAbove = userRole === 'hr' || userRole === 'director' || userRole === 'ceo' || userRole === 'admin';
  const isManagerOrAbove = isHROrAbove || userRole === 'manager';

  const handleAssignShift = (employee: Employee) => {
    setSelectedEmployee({
      id: employee.id,
      name: `${employee.profiles?.first_name || ''} ${employee.profiles?.last_name || ''}`.trim(),
    });
    setShiftDialogOpen(true);
  };

  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setDepartmentFilter("all");
    setStatusFilter("all");
  };

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((emp) => {
      const fullName = `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.toLowerCase();
      const email = (emp.profiles?.email || "").toLowerCase();
      const role =
        (emp.profiles?.role ||
          emp.home_assignment?.role ||
          emp.position ||
          "employee"
        ).toString().toLowerCase();
      const dept = (emp.department || "").toLowerCase();
      const status = (emp.status || "").toLowerCase();
      const presence = (emp.display_presence_status || emp.presence_status || "").toLowerCase();

      if (term && !fullName.includes(term) && !email.includes(term)) {
        return false;
      }

      if (roleFilter !== "all" && role !== roleFilter.toLowerCase()) {
        return false;
      }

      if (departmentFilter !== "all" && dept !== departmentFilter.toLowerCase()) {
        return false;
      }

      if (statusFilter !== "all") {
        // Explicit, user-controlled status filtering
        switch (statusFilter) {
          case "active":
            if (status !== "active") return false;
            break;
          case "inactive":
            if (status !== "inactive") return false;
            break;
          case "on_notice":
            if (status !== "on_notice") return false;
            break;
          case "exited":
            // Treat common exit-like statuses as exited
            if (!["exited", "terminated", "resigned"].includes(status)) return false;
            break;
          case "future_joining":
            // Future joining / offer accepted-type statuses
            if (!["future_joining", "offer_accepted", "joining_soon"].includes(status)) return false;
            break;
        }
      }

      return true;
    });
  }, [employees, search, roleFilter, departmentFilter, statusFilter]);

  // Pagination removed - using filteredEmployees directly

  const totalEmployees = employees.length;
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of employees) {
      const key = (e.status || "unknown").toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [employees]);
  const activeEmployees = statusCounts["active"] || 0;
  const waitingOnboarding = employees.filter(
    (e) =>
      (e.onboarding_status && e.onboarding_status !== "completed") ||
      (e.display_presence_status || e.presence_status) === "waiting_for_onboarding"
  ).length;

  const distinctRoles = Array.from(
    new Set(
      employees.map(
        (e) =>
          (e.profiles?.role ||
            e.home_assignment?.role ||
            e.position ||
            "employee"
          ) as string
      )
    )
  ).filter(Boolean);

  const distinctDepartments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean))
  );

  const handleShiftAssigned = () => {
    // Optionally refresh employees list
    // fetchEmployees();
  };

  const getPresenceColor = (status?: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'away': return 'text-red-500';
      case 'break': return 'text-yellow-500';
      case 'out_of_office': return 'text-blue-500';
      case 'waiting_for_onboarding': return 'text-orange-500';
      default: return 'text-gray-400';
    }
  };

  const getPresenceLabel = (status?: string) => {
    switch (status) {
      case 'waiting_for_onboarding': return 'Waiting for onboarding';
      case 'out_of_office': return 'Out of office';
      default: return status?.replace('_', ' ') || 'Unknown';
    }
  };

  const handleDeactivateClick = (employee: Employee) => {
    setEmployeeToAction(employee);
    setDeactivateDialogOpen(true);
  };

  const handleDeactivate = async () => {
    if (!employeeToAction) return;

    try {
      await api.deactivateEmployee(employeeToAction.id);
      toast({
        title: "Success",
        description: "Employee deactivated successfully",
      });
      setDeactivateDialogOpen(false);
      setEmployeeToAction(null);
      fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate employee",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (employee: Employee) => {
    setEmployeeToAction(employee);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!employeeToAction) return;

    try {
      await api.deleteEmployee(employeeToAction.id);
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
      setDeleteDialogOpen(false);
      setEmployeeToAction(null);
      fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete employee",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (employees.length === 0) {
      return;
    }

    // Prepare CSV data
    const getPresenceLabelForCSV = (status?: string) => {
      switch (status) {
        case 'waiting_for_onboarding': return 'Waiting for onboarding';
        case 'out_of_office': return 'Out of office';
        default: return status?.replace('_', ' ') || 'Unknown';
      }
    };

    const headers = ['Employee ID', 'First Name', 'Last Name', 'Email', 'Position', 'Department', 'Status', 'Join Date', 'Presence Status'];
    const rows = employees.map(emp => [
      emp.employee_id || '',
      emp.profiles?.first_name || '',
      emp.profiles?.last_name || '',
      emp.profiles?.email || '',
      emp.position || '',
      emp.department || '',
      emp.status || '',
      emp.join_date ? new Date(emp.join_date).toLocaleDateString() : '',
      getPresenceLabelForCSV(emp.display_presence_status || emp.presence_status)
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape commas and quotes in cell values
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `employees_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <TooltipProvider>
        <div className="space-y-6 bg-[#f8f9fb] min-h-screen -mx-4 px-4 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between pt-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {userRole === "manager" ? "My Team" : "Employees"}
              </h1>
              <p className="text-muted-foreground">
                {userRole === "manager"
                  ? "Manage your team members"
                  : "Manage your organization's workforce"}
              </p>
            </div>
            {isHROrAbove && (
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link to="/employees/import">
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/employees/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Employee
                  </Link>
                </Button>
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow duration-200 border-0">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Total Employees
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-bold">
                      {totalEmployees}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {totalEmployees} total
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow duration-200 border-0">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Status Breakdown
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <div className="flex flex-col text-xs text-muted-foreground gap-1">
                      <div>
                        <span className="font-semibold text-emerald-600">
                          Active:
                        </span>{" "}
                        {activeEmployees}
                      </div>
                      <div>
                        <span className="font-semibold">
                          Inactive / On notice / Exited / Future:
                        </span>{" "}
                        {totalEmployees - activeEmployees}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 shadow-sm">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm hover:shadow-md transition-shadow duration-200 border-0">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Waiting for Onboarding
                  </p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-bold text-amber-600">
                      {waitingOnboarding}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {waitingOnboarding} active
                    </span>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shadow-sm">
                  <Clock3 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search + Filters */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees by name or email…"
                    className="pl-9 rounded-full bg-[#f8f9fb]"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleDownload}
                    disabled={employees.length === 0}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Role
                  </label>
                  <Select
                    value={roleFilter}
                    onValueChange={(v) => {
                      setRoleFilter(v);
                    }}
                  >
                    <SelectTrigger className="bg-[#f8f9fb] border-none">
                      <SelectValue placeholder="All roles" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      {distinctRoles.map((r) => (
                        <SelectItem key={r} value={r.toLowerCase()}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Department
                  </label>
                  <Select
                    value={departmentFilter}
                    onValueChange={(v) => {
                      setDepartmentFilter(v);
                    }}
                  >
                    <SelectTrigger className="bg-[#f8f9fb] border-none">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {distinctDepartments.map((d) => (
                        <SelectItem key={d} value={d.toLowerCase()}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Status
                  </label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => {
                      setStatusFilter(v);
                    }}
                  >
                    <SelectTrigger className="bg-[#f8f9fb] border-none">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_notice">On Notice</SelectItem>
                      <SelectItem value="exited">Exited</SelectItem>
                      <SelectItem value="future_joining">Future Joining</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 justify-end">
                  <Button variant="outline" onClick={clearFilters}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Employee table */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="max-h-[75vh] flex flex-col overflow-hidden rounded-xl border border-slate-200">
                {/* Scrollable table container with sticky header */}
                <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollBehavior: 'smooth' }}>
                  <Table>
                    <TableHeader className="bg-[#f3f4f8] sticky top-0 z-10">
                      <TableRow className="hover:bg-[#f3f4f8]">
                        <TableHead className="bg-[#f3f4f8]">Name</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Email</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Role</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Department</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Join Date</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Status</TableHead>
                        <TableHead className="bg-[#f3f4f8]">Presence</TableHead>
                        <TableHead className="w-12 bg-[#f3f4f8]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            Loading employees...
                          </TableCell>
                        </TableRow>
                      ) : filteredEmployees.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-12 text-muted-foreground"
                          >
                            <p>No employees found</p>
                            <p className="text-sm mt-2">
                              Get started by adding employees or importing from CSV
                            </p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredEmployees.map((employee) => {
                        const presenceStatus =
                          employee.display_presence_status ||
                          employee.presence_status;
                        const lastActive =
                          employee.last_presence_update &&
                          new Date(
                            employee.last_presence_update
                          ).toLocaleString("en-IN");

                        const roleLabel =
                          employee.profiles?.role ||
                          employee.home_assignment?.role ||
                          employee.position ||
                          "employee";

                        const statusLower = (employee.status || "").toLowerCase();
                        const statusVariant =
                          statusLower === "active"
                            ? "default"
                            : statusLower === "inactive"
                            ? "secondary"
                            : "outline";

                        const presenceColor = getPresenceColor(presenceStatus);

                        return (
                          <TableRow
                            key={employee.id}
                            className="cursor-pointer transition hover:bg-white hover:shadow-sm hover:-translate-y-[1px]"
                          >
                            <TableCell className="font-medium">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    to={`/employees/${employee.id}`}
                                    className="hover:underline"
                                  >
                                    {employee.profiles?.first_name || ""}{" "}
                                    {employee.profiles?.last_name || ""}
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="space-y-1 text-xs">
                                    <p>View profile</p>
                                    <p className="text-muted-foreground">
                                      Message via your internal tools
                                    </p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {employee.profiles?.email || "N/A"}
                            </TableCell>
                            <TableCell>{roleLabel}</TableCell>
                            <TableCell>{employee.department || "-"}</TableCell>
                            <TableCell>
                              {employee.join_date
                                ? new Date(
                                    employee.join_date
                                  ).toLocaleDateString("en-IN")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant={statusVariant} className="capitalize">
                                    {employee.status || "unknown"}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    Joined on{" "}
                                    {employee.join_date
                                      ? new Date(
                                          employee.join_date
                                        ).toLocaleDateString("en-IN")
                                      : "N/A"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-2">
                                    <Circle
                                      className={`h-2.5 w-2.5 ${presenceColor} rounded-full`}
                                      fill="currentColor"
                                    />
                                    <span className="text-sm capitalize">
                                      {getPresenceLabel(presenceStatus)}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">
                                    {presenceStatus === "online"
                                      ? lastActive
                                        ? `Online since ${lastActive}`
                                        : "Online"
                                      : lastActive
                                      ? `Last active ${lastActive}`
                                      : "Presence data not available"}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link to={`/employees/${employee.id}`}>
                                      View Details
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link
                                      to={`/employees/${employee.id}?tab=skills`}
                                    >
                                      Skills & Certifications
                                    </Link>
                                  </DropdownMenuItem>
                                  {isManagerOrAbove && (
                                    <DropdownMenuItem
                                      onClick={() => handleAssignShift(employee)}
                                    >
                                      Assign Shift
                                    </DropdownMenuItem>
                                  )}
                                  {isHROrAbove && (
                                    <DropdownMenuItem asChild>
                                      <Link to={`/employees/${employee.id}`}>
                                        Edit
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  {isHROrAbove && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handleDeactivateClick(employee)}
                                        disabled={employee.status === "inactive"}
                                      >
                                        {employee.status === "inactive"
                                          ? "Already Inactive"
                                          : "Deactivate"}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteClick(employee)}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        Delete
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                    </TableBody>
                  </Table>
                </div>
                {/* Fixed footer with legend */}
                <div className="flex-shrink-0 border-t bg-[#f3f4f8] px-4 py-3">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Showing {filteredEmployees.length} of {totalEmployees}{" "}
                        employee{filteredEmployees.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />{" "}
                        Online
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />{" "}
                        Waiting for Onboarding
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-gray-500 inline-block" />{" "}
                        Offline
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        {/* Shift Assignment Dialog */}
        {selectedEmployee && (
          <ShiftAssignmentDialog
            open={shiftDialogOpen}
            onOpenChange={setShiftDialogOpen}
            employeeId={selectedEmployee.id}
            employeeName={selectedEmployee.name}
            onShiftAssigned={handleShiftAssigned}
          />
        )}

        {/* Deactivate Confirmation Dialog */}
        <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate Employee</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to deactivate {employeeToAction?.profiles?.first_name} {employeeToAction?.profiles?.last_name}?
                This will prevent them from accessing the system. You can reactivate them later by updating their status.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeactivate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Deactivate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Employee</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete {employeeToAction?.profiles?.first_name} {employeeToAction?.profiles?.last_name}?
                This action cannot be undone. All employee data including profile, roles, and related records will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  </AppLayout>
  );
}
