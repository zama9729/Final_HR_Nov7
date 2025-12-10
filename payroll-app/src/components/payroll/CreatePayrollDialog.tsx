import { useState, useEffect, useMemo } from "react";
// Import the API client
import { api } from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
// Removed useToast, using sonnerToast for consistency
import { PlusCircle, Search } from "lucide-react";
import { toast as sonnerToast } from "sonner";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  gross_pay: number;
}

interface CreatePayrollDialogProps {
  // tenantId and userId are no longer needed, backend gets them from session
  onSuccess: () => void;
}

export const CreatePayrollDialog = ({ onSuccess }: CreatePayrollDialogProps) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [payday, setPayday] = useState("");
  const [runType, setRunType] = useState<"regular" | "off_cycle" | "partial_payment">("regular");
  
  // Employee data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  
  // Computed values based on selected employees
  const employeeCount = selectedEmployeeIds.size;
  const totalCompensation = useMemo(() => {
    return employees
      .filter(emp => selectedEmployeeIds.has(emp.id))
      .reduce((sum, emp) => sum + emp.gross_pay, 0);
  }, [employees, selectedEmployeeIds]);

  useEffect(() => {
    if (month && year) {
      // Calculate default payday (last working day of the month)
      const lastDay = new Date(parseInt(year), parseInt(month), 0);
      const dayOfWeek = lastDay.getDay();
      
      if (dayOfWeek === 0) { // Sunday
        lastDay.setDate(lastDay.getDate() - 2);
      } else if (dayOfWeek === 6) { // Saturday
        lastDay.setDate(lastDay.getDate() - 1);
      }
      
      setPayday(lastDay.toISOString().split('T')[0]);
    }
  }, [month, year]);

  useEffect(() => {
    // Fetch employee data when month/year changes or dialog opens
    const fetchEmployeeData = async () => {
      if (!month || !year) return;
      
      try {
        const params = new URLSearchParams({
          month: month,
          year: year,
        });
        const data = await api.get<{ employeeCount: number, totalCompensation: number, employees: Employee[] }>(`payroll/new-cycle-data?${params.toString()}`);
        const fetchedEmployees = data.employees || [];
        setEmployees(fetchedEmployees);
        // Default: select all employees
        setSelectedEmployeeIds(new Set(fetchedEmployees.map(emp => emp.id)));
      } catch (error: any) {
        sonnerToast.error(`Failed to fetch payroll data: ${error.message}`);
        setEmployees([]);
        setSelectedEmployeeIds(new Set());
      }
    };

    if (open && month && year) {
      fetchEmployeeData();
    } else if (!open) {
      // Reset state when dialog closes
      setEmployees([]);
      setSelectedEmployeeIds(new Set());
      setSearchQuery("");
    }
  }, [open, month, year]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body = {
        month: parseInt(month),
        year: parseInt(year),
        payday: payday,
        employeeCount: employeeCount,
        totalCompensation: totalCompensation,
        included_employee_ids: Array.from(selectedEmployeeIds),
        run_type: runType,
      };

      // Use the API client to create the payroll cycle
      await api.post("payroll-cycles", body);

      sonnerToast.success("Payroll cycle created successfully");
      
      // Invalidate the query for payroll cycles to refetch
      queryClient.invalidateQueries({ queryKey: ["payroll-cycles"] });
      
      setOpen(false);
      setMonth("");
      setPayday("");
      setRunType("regular");
      setEmployees([]);
      setSelectedEmployeeIds(new Set());
      setSearchQuery("");
      onSuccess();
    } catch (error: any) {
      sonnerToast.error(error.message || "Failed to create payroll cycle");
    } finally {
      setLoading(false);
    }
  };

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const query = searchQuery.toLowerCase();
    return employees.filter(emp => 
      emp.first_name.toLowerCase().includes(query) ||
      emp.last_name.toLowerCase().includes(query) ||
      emp.employee_id.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  const handleToggleEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployeeIds);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployeeIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedEmployeeIds.size === filteredEmployees.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(filteredEmployees.map(emp => emp.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Payroll Cycle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col [&>button]:z-50">
        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
            <DialogTitle>Create Payroll Cycle</DialogTitle>
            <DialogDescription>
              Processing salary for {employeeCount} of {employees.length} employee{employees.length !== 1 ? 's' : ''}
              {totalCompensation > 0 && ` - Estimated: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(totalCompensation)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 min-h-0">
            <div className="grid gap-4 pb-4">
            <div className="grid gap-2">
              <Label htmlFor="month">Month</Label>
              <Select value={month} onValueChange={setMonth} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min="2020"
                max="2100"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payday">Payday</Label>
              <Input
                id="payday"
                type="date"
                value={payday}
                onChange={(e) => setPayday(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Expected payment date (defaults to last working day of the month)
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Run Type</Label>
              <RadioGroup value={runType} onValueChange={(value) => setRunType(value as "regular" | "off_cycle" | "partial_payment")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="regular" id="run-type-regular" />
                  <Label htmlFor="run-type-regular" className="font-normal cursor-pointer">
                    Final Settlement (Regular)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="off_cycle" id="run-type-off-cycle" />
                  <Label htmlFor="run-type-off-cycle" className="font-normal cursor-pointer">
                    Off-Cycle / Bonus
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="partial_payment" id="run-type-partial" />
                  <Label htmlFor="run-type-partial" className="font-normal cursor-pointer">
                    Partial Salary Release
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {runType === "regular" 
                  ? "Regular payroll run. Previous partial salary releases in this period will be automatically deducted."
                  : runType === "off_cycle"
                  ? "Off-cycle run for bonuses/adhoc payments (tax/deductions as per components)."
                  : "Partial Salary Release: pay a flat net amount now; will be deducted from the final settlement."}
              </p>
            </div>

            {/* Employee Selection Section */}
            {employees.length > 0 && (
              <>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Select Employees</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAll}
                      className="h-8 text-xs"
                    >
                      {selectedEmployeeIds.size === filteredEmployees.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or employee ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <ScrollArea className="h-[250px] w-full rounded-md border p-4">
                    <div className="space-y-2">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No employees found matching your search.
                        </p>
                      ) : (
                        filteredEmployees.map((employee) => (
                          <div
                            key={employee.id}
                            className="flex items-center space-x-3 p-2 rounded-md hover:bg-accent transition-colors"
                          >
                            <Checkbox
                              id={`employee-${employee.id}`}
                              checked={selectedEmployeeIds.has(employee.id)}
                              onCheckedChange={() => handleToggleEmployee(employee.id)}
                            />
                            <label
                              htmlFor={`employee-${employee.id}`}
                              className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              <div className="flex items-center justify-between">
                                <span>
                                  {employee.first_name} {employee.last_name}
                                </span>
                                <span className="text-muted-foreground ml-2">
                                  ({employee.employee_id})
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(employee.gross_pay)}
                              </div>
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">
                    Unchecked employees will have their salary held (excluded from payroll).
                  </p>
                </div>
              </>
            )}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              {loading ? "Creating..." : "Create Cycle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

