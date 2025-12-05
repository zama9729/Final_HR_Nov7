import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Download, X, Search, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PayrollLayout } from "@/components/layout/PayrollLayout";
import { api } from "../lib/api";
import { toast } from "sonner";
import { format } from "date-fns";

interface Advance {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  total_amount: number;
  tenure_months: number;
  monthly_emi: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'active' | 'completed' | 'cancelled';
  start_month: string;
  disbursement_date: string;
  notes?: string;
  created_at: string;
}

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
}

export default function AdvanceSalary() {
  const navigate = useNavigate();
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Create form state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [amountMode, setAmountMode] = useState<'fixed' | 'months'>('fixed');
  const [value, setValue] = useState<string>("");
  const [tenureMonths, setTenureMonths] = useState<string>("");
  const [startMonth, setStartMonth] = useState<string>("");
  const [disbursementDate, setDisbursementDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [estimatedNetSalary, setEstimatedNetSalary] = useState<number>(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  useEffect(() => {
    // Fetch employee's net salary when employee is selected and mode is 'months'
    const fetchEmployeeNetSalary = async () => {
      if (selectedEmployeeId && amountMode === 'months') {
        try {
          // Try to get from latest payroll item first
          const payslips = await api.payslips.list();
          const employeePayslips = payslips.payslips?.filter((p: any) => p.employee_id === selectedEmployeeId) || [];
          
          if (employeePayslips.length > 0) {
            // Get the most recent payslip
            const latestPayslip = employeePayslips.sort((a: any, b: any) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            setEstimatedNetSalary(Number(latestPayslip.net_salary || 0));
          } else {
            // Fallback: try to get from compensation structure
            try {
              const comp = await api.employees.getCompensation(selectedEmployeeId);
              if (comp) {
                const gross = Number(comp.gross_pay || comp.basic_salary || 0) + 
                             Number(comp.hra || 0) + 
                             Number(comp.special_allowance || 0);
                // Estimate net (gross - 20% for deductions)
                setEstimatedNetSalary(gross * 0.8);
              }
            } catch (e) {
              setEstimatedNetSalary(0);
            }
          }
        } catch (error) {
          setEstimatedNetSalary(0);
        }
      } else {
        setEstimatedNetSalary(0);
      }
    };

    fetchEmployeeNetSalary();
  }, [selectedEmployeeId, amountMode]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [advancesData, employeesData] = await Promise.all([
        api.advanceSalary.list(statusFilter === "all" ? undefined : statusFilter),
        api.employees.list(),
      ]);
      setAdvances(advancesData);
      // Sort employees by employee_code (employee ID)
      const sortedEmployees = (employeesData.employees || []).sort((a: Employee, b: Employee) => {
        const codeA = (a.employee_code || '').toUpperCase();
        const codeB = (b.employee_code || '').toUpperCase();
        return codeA.localeCompare(codeB);
      });
      setEmployees(sortedEmployees);
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdvance = async () => {
    if (!selectedEmployeeId || !value || !tenureMonths || !startMonth || !disbursementDate) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setCreating(true);
      await api.advanceSalary.create({
        employee_id: selectedEmployeeId,
        amount_mode: amountMode,
        value: parseFloat(value),
        tenure_months: parseInt(tenureMonths),
        start_month: startMonth,
        disbursement_date: disbursementDate,
        notes: notes || undefined,
      });
      toast.success("Advance salary created successfully");
      setIsCreateDialogOpen(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to create advance");
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedEmployeeId("");
    setAmountMode('fixed');
    setValue("");
    setTenureMonths("");
    setStartMonth("");
    setDisbursementDate("");
    setNotes("");
    setEstimatedNetSalary(0);
  };

  const handleDownloadSlip = async (advanceId: string) => {
    try {
      await api.advanceSalary.downloadSlip(advanceId);
      toast.success("Advance slip downloaded");
    } catch (error: any) {
      toast.error(error.message || "Failed to download slip");
    }
  };

  const handleCancelAdvance = async (advanceId: string) => {
    if (!confirm("Are you sure you want to cancel this advance? This can only be done if no repayments have been made.")) {
      return;
    }

    try {
      await api.advanceSalary.cancel(advanceId);
      toast.success("Advance cancelled successfully");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel advance");
    }
  };

  // Calculate preview values
  const calculatePreview = () => {
    if (!value || !tenureMonths) return { totalAmount: 0, monthlyEmi: 0 };

    let totalAmount = 0;
    if (amountMode === 'fixed') {
      totalAmount = parseFloat(value) || 0;
    } else {
      // Multi-month: estimate based on employee's net salary
      const numMonths = parseFloat(value) || 0;
      totalAmount = estimatedNetSalary * numMonths;
    }

    const monthlyEmi = tenureMonths ? totalAmount / parseFloat(tenureMonths) : 0;
    return { totalAmount, monthlyEmi };
  };

  const preview = calculatePreview();

  // Filter advances
  const filteredAdvances = advances.filter(advance => {
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        advance.employee_name.toLowerCase().includes(search) ||
        advance.employee_code.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <PayrollLayout>
      <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Advance Salary Management</h1>
          <p className="text-muted-foreground mt-1">Manage employee salary advances and EMI deductions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="liquid-glass-nav-item">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Grant Advance
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Grant Advance Salary</DialogTitle>
              <DialogDescription>
                Create a new advance salary for an employee. EMI will be automatically deducted from future payrolls.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Employee *</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.employee_code || 'N/A'} - {emp.full_name || 'N/A'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Calculation Mode *</Label>
                <RadioGroup value={amountMode} onValueChange={(v) => setAmountMode(v as 'fixed' | 'months')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixed" id="fixed" />
                    <Label htmlFor="fixed">Fixed Amount</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="months" id="months" />
                    <Label htmlFor="months">Multi-Month Salary</Label>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label>
                  {amountMode === 'fixed' ? 'Advance Amount (₹)' : 'Number of Months'} *
                </Label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={amountMode === 'fixed' ? 'Enter amount' : 'Enter months'}
                />
                {amountMode === 'months' && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Estimated Net Salary: ₹{estimatedNetSalary.toLocaleString('en-IN')}
                  </p>
                )}
              </div>

              <div>
                <Label>Repayment Tenure (Months) *</Label>
                <Input
                  type="number"
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(e.target.value)}
                  placeholder="Enter number of months"
                  min="1"
                />
              </div>

              <div>
                <Label>EMI Start Month *</Label>
                <Input
                  type="date"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </div>

              <div>
                <Label>Disbursement Date *</Label>
                <Input
                  type="date"
                  value={disbursementDate}
                  onChange={(e) => setDisbursementDate(e.target.value)}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>

              {preview.totalAmount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span>Total Advance:</span>
                      <span className="font-semibold">₹{preview.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly EMI:</span>
                      <span className="font-semibold">₹{preview.monthlyEmi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAdvance} disabled={creating}>
                {creating ? "Creating..." : "Create Advance"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Advance Salary List</CardTitle>
              <CardDescription>View and manage all salary advances</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredAdvances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No advances found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Monthly EMI</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Month</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAdvances.map((advance) => {
                  const progress = (advance.paid_amount / advance.total_amount) * 100;
                  return (
                    <TableRow key={advance.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{advance.employee_name}</div>
                          <div className="text-sm text-muted-foreground">{advance.employee_code}</div>
                        </div>
                      </TableCell>
                      <TableCell>₹{advance.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>{advance.tenure_months} months</TableCell>
                      <TableCell>₹{advance.monthly_emi.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={progress} className="w-24" />
                          <div className="text-xs text-muted-foreground">
                            ₹{advance.paid_amount.toLocaleString('en-IN')} / ₹{advance.total_amount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(advance.status)}>
                          {advance.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(advance.start_month), 'MMM yyyy')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadSlip(advance.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          {advance.status === 'active' && advance.paid_amount === 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelAdvance(advance.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </PayrollLayout>
  );
}

