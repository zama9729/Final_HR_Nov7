import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Upload, Download, MoreVertical } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Employee {
  id: string;
  employee_id: string;
  department: string;
  position: string;
  status: string;
  join_date: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function Employees() {
  const { user, userRole } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmployees();
  }, [user, userRole]);

  const fetchEmployees = async () => {
    if (!user) return;

    let query = supabase
      .from('employees')
      .select(`
        id,
        employee_id,
        department,
        position,
        status,
        join_date,
        user_id,
        reporting_manager_id,
        onboarding_status,
        profiles!employees_user_id_fkey(first_name, last_name, email)
      `);

    // If user is a manager, only show their team
    if (userRole === 'manager') {
      // First get the employee record for the current user
      const { data: managerEmployee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (managerEmployee) {
        query = query.eq('reporting_manager_id', managerEmployee.id);
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching employees:', error);
    }
    
    if (data) {
      console.log('Fetched employees:', data);
      setEmployees(data as any);
    }
    setLoading(false);
  };

  const isHROrAbove = userRole === 'hr' || userRole === 'director' || userRole === 'ceo';

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
              <Button variant="outline" size="icon">
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
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        Loading employees...
                      </TableCell>
                    </TableRow>
                  ) : employees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        <p>No employees found</p>
                        <p className="text-sm mt-2">Get started by adding employees or importing from CSV</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    employees.map((employee) => (
                      <TableRow key={employee.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <Link to={`/employees/${employee.id}`} className="hover:underline">
                            {employee.profiles.first_name} {employee.profiles.last_name}
                          </Link>
                        </TableCell>
                        <TableCell>{employee.profiles.email}</TableCell>
                        <TableCell>{employee.position}</TableCell>
                        <TableCell>{employee.department}</TableCell>
                        <TableCell>{new Date(employee.join_date).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                            {employee.status}
                          </Badge>
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
                              <DropdownMenuItem>Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
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
      </div>
    </AppLayout>
  );
}
