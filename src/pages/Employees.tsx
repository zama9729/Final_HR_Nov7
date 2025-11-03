import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Upload, Download, MoreVertical, Circle } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ShiftAssignmentDialog } from "@/components/shifts/ShiftAssignmentDialog";

interface Employee {
  id: string;
  employee_id: string;
  department: string;
  position: string;
  status: string;
  presence_status?: string;
  join_date: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export default function Employees() {
  const { user, userRole } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);

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

  const isHROrAbove = userRole === 'hr' || userRole === 'director' || userRole === 'ceo';
  const isManagerOrAbove = isHROrAbove || userRole === 'manager';

  const handleAssignShift = (employee: Employee) => {
    setSelectedEmployee({
      id: employee.id,
      name: `${employee.profiles?.first_name || ''} ${employee.profiles?.last_name || ''}`.trim(),
    });
    setShiftDialogOpen(true);
  };

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
      default: return 'text-gray-400';
    }
  };

  const handleDownload = () => {
    if (employees.length === 0) {
      return;
    }

    // Prepare CSV data
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
      emp.presence_status || ''
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {userRole === 'manager' ? 'My Team' : 'Employees'}
            </h1>
            <p className="text-muted-foreground">
              {userRole === 'manager' 
                ? 'Manage your team members' 
                : 'Manage your organization\'s workforce'}
            </p>
          </div>
          {isHROrAbove && (
            <div className="flex gap-2">
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

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={handleDownload} disabled={employees.length === 0}>
                <Download className="h-4 w-4" />
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Presence</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12">
                        Loading employees...
                      </TableCell>
                    </TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        <p>No employees found</p>
                        <p className="text-sm mt-2">Get started by adding employees or importing from CSV</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    employees.map((employee) => (
                      <TableRow key={employee.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <Link to={`/employees/${employee.id}`} className="hover:underline">
                            {employee.profiles?.first_name || ''} {employee.profiles?.last_name || ''}
                          </Link>
                        </TableCell>
                        <TableCell>{employee.profiles?.email || 'N/A'}</TableCell>
                        <TableCell>{employee.position}</TableCell>
                        <TableCell>{employee.department}</TableCell>
                        <TableCell>{new Date(employee.join_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                            {employee.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Circle className={`h-2.5 w-2.5 ${getPresenceColor(employee.presence_status)} rounded-full`} fill="currentColor" />
                            <span className="text-sm capitalize">
                              {employee.presence_status?.replace('_', ' ') || 'Unknown'}
                            </span>
                          </div>
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
                                <Link to={`/employees/${employee.id}`}>View Profile</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/employees/${employee.id}?tab=skills`}>Skills & Certifications</Link>
                              </DropdownMenuItem>
                              {isManagerOrAbove && (
                                <DropdownMenuItem onClick={() => handleAssignShift(employee)}>
                                  Assign Shift
                                </DropdownMenuItem>
                              )}
                              {isHROrAbove && (
                                <DropdownMenuItem asChild>
                                  <Link to={`/employees/${employee.id}`}>Edit</Link>
                                </DropdownMenuItem>
                              )}
                              {isHROrAbove && (
                                <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
      </div>
    </AppLayout>
  );
}
