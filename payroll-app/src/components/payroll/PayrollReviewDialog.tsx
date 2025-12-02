import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Edit2, Check, X, Ban, RotateCcw, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PayrollItem {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  employee_email: string;
  basic_salary: number;
  hra: number;
  special_allowance: number;
  da: number;
  lta: number;
  bonus: number;
  incentive_amount?: number;
  gross_salary: number;
  pf_deduction: number;
  esi_deduction: number;
  pt_deduction: number;
  tds_deduction: number;
  advance_deduction?: number;
  deductions: number;
  net_salary: number;
  lop_days?: number;
  paid_days?: number;
  total_working_days?: number;
}

interface PayrollReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  cycleMonth: number;
  cycleYear: number;
  onProcessed: () => void;
  canModify?: boolean;
  mode?: 'edit' | 'process'; // 'edit' for Edit button, 'process' for Process button
}

export const PayrollReviewDialog = ({
  open,
  onOpenChange,
  cycleId,
  cycleMonth,
  cycleYear,
  onProcessed,
  canModify = true,
  mode = 'process', // Default to 'process' for backward compatibility
}: PayrollReviewDialogProps) => {
  const [payrollItems, setPayrollItems] = useState<PayrollItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeIncentiveIndex, setActiveIncentiveIndex] = useState<number | null>(null);
  const [incentiveDraft, setIncentiveDraft] = useState<string>("");
  const [savingIncentive, setSavingIncentive] = useState(false);
  const [heldEmployeeIds, setHeldEmployeeIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payroll-preview", cycleId],
    queryFn: async () => {
      const result = await api.payroll.previewCycle(cycleId);
      return result.payrollItems as PayrollItem[];
    },
    enabled: open && !!cycleId,
  });

  useEffect(() => {
    if (data) {
      const normalized = data.map((item) => ({
        ...item,
        incentive_amount: Number(item.incentive_amount || 0),
      }));
      setPayrollItems(normalized);
      setActiveIncentiveIndex(null);
    }
  }, [data]);

  useEffect(() => {
    if (!open) {
      setActiveIncentiveIndex(null);
      setConfirmOpen(false);
      setHeldEmployeeIds(new Set());
      setSearchQuery("");
    }
  }, [open]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleEdit = (index: number) => {
    if (!canModify) return;
    setEditingIndex(index);
  };

  const handleCancelEdit = () => {
    if (data) {
      setPayrollItems([...data]);
    }
    setEditingIndex(null);
  };

  const handleSaveEdit = (index: number) => {
    const item = payrollItems[index];
    
    // Recalculate gross salary
    const grossSalary =
      item.basic_salary +
      item.hra +
      item.special_allowance +
      item.da +
      item.lta +
      item.bonus +
      (item.incentive_amount || 0);

    // Recalculate deductions (simplified - would need settings from backend)
    // PF: 12% of basic, capped at ₹15,000
    // If basic <= 15000, PF = 12% of basic; If basic > 15000, PF = 12% of 15000
    const pfWageCeiling = 15000;
    const pfBasis = item.basic_salary <= pfWageCeiling ? item.basic_salary : pfWageCeiling;
    const pfDeduction = (pfBasis * 12) / 100; // 12% of basic (capped)
    const esiDeduction = grossSalary <= 21000 ? (grossSalary * 0.75) / 100 : 0;
    const ptDeduction = 200; // Fixed
    const annualIncome = grossSalary * 12;
    const tdsDeduction =
      annualIncome > 250000 ? ((annualIncome - 250000) * 5) / 100 / 12 : 0;

    const deductions = pfDeduction + esiDeduction + ptDeduction + tdsDeduction;
    const netSalary = grossSalary - deductions;

    const updatedItems = [...payrollItems];
    updatedItems[index] = {
      ...item,
      gross_salary: grossSalary,
      pf_deduction: pfDeduction,
      esi_deduction: esiDeduction,
      pt_deduction: ptDeduction,
      tds_deduction: tdsDeduction,
      deductions,
      net_salary: netSalary,
    };
    setPayrollItems(updatedItems);
    setEditingIndex(null);
  };

  const handleFieldChange = (index: number, field: keyof PayrollItem, value: number) => {
    const updatedItems = [...payrollItems];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };
    setPayrollItems(updatedItems);
  };

  const handleHoldEmployee = (employeeId: string) => {
    const newHeld = new Set(heldEmployeeIds);
    if (newHeld.has(employeeId)) {
      newHeld.delete(employeeId);
    } else {
      newHeld.add(employeeId);
    }
    setHeldEmployeeIds(newHeld);
  };

  const prepareItems = () => {
    return payrollItems
      .filter(item => !heldEmployeeIds.has(item.employee_id))
      .map(item => ({
        employee_id: item.employee_id,
        basic_salary: item.basic_salary,
        hra: item.hra,
        special_allowance: item.special_allowance,
        da: item.da,
        lta: item.lta,
        bonus: item.bonus,
        incentive_amount: item.incentive_amount || 0,
        lop_days: item.lop_days,
        paid_days: item.paid_days,
        total_working_days: item.total_working_days,
      }));
  };

  const saveChanges = async () => {
    setProcessing(true);
    try {
      const itemsToSave = prepareItems();
      const result = await api.payroll.saveChanges(cycleId, itemsToSave);
      toast.success(result.message || "Changes saved successfully");
      onProcessed();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save changes");
    } finally {
      setProcessing(false);
    }
  };

  const processPayroll = async () => {
    setConfirmOpen(false);
    setProcessing(true);
    try {
      const itemsToProcess = prepareItems();
      const result = await api.payroll.processCycle(cycleId, itemsToProcess);
      toast.success(result.message || "Payroll processed successfully");
      onProcessed();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to process payroll");
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenIncentive = (index: number) => {
    if (!canModify) return;
    const currentAmount = payrollItems[index]?.incentive_amount || 0;
    setIncentiveDraft(currentAmount ? String(currentAmount) : "");
    setActiveIncentiveIndex(index);
  };

  const handleSaveIncentive = async () => {
    if (activeIncentiveIndex === null) return;
    const target = payrollItems[activeIncentiveIndex];
    const parsedAmount = Number(incentiveDraft || 0);

    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      toast.error("Please enter a valid incentive amount (zero or positive).");
      return;
    }

    setSavingIncentive(true);
    try {
      await api.payroll.setIncentive(cycleId, target.employee_id, parsedAmount);
      toast.success("Incentive saved.");
      await refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to save incentive");
    } finally {
      setSavingIncentive(false);
      setActiveIncentiveIndex(null);
    }
  };

  // Filter payroll items based on search query
  const filteredPayrollItems = payrollItems.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.employee_name.toLowerCase().includes(query) ||
      item.employee_code.toLowerCase().includes(query) ||
      item.employee_email.toLowerCase().includes(query)
    );
  });

  // Filter out held employees for display and calculations
  const activePayrollItems = filteredPayrollItems.filter(
    item => !heldEmployeeIds.has(item.employee_id)
  );
  
  const totalGross = activePayrollItems.reduce((sum, item) => sum + item.gross_salary, 0);
  const totalDeductions = activePayrollItems.reduce((sum, item) => sum + item.deductions, 0);
  const totalNet = totalGross - totalDeductions;

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString("default", { month: "long" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Payroll - {getMonthName(cycleMonth)} {cycleYear}</DialogTitle>
          <DialogDescription>
            Review and edit employee salaries before processing payroll
            {heldEmployeeIds.size > 0 && (
              <span className="block mt-1 text-destructive">
                {heldEmployeeIds.size} employee{heldEmployeeIds.size !== 1 ? 's' : ''} held (excluded from processing)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : payrollItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No employees found for this payroll cycle
          </div>
        ) : heldEmployeeIds.size === payrollItems.length ? (
          <div className="text-center py-12 text-muted-foreground">
            All employees are held. Please unhold at least one employee to process payroll.
          </div>
        ) : (
          <>
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee name, ID, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              {searchQuery && (
                <p className="text-xs text-muted-foreground mt-2">
                  Showing {filteredPayrollItems.length} of {payrollItems.length} employees
                </p>
              )}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">HRA</TableHead>
                    <TableHead className="text-right">Special Allowance</TableHead>
                    <TableHead className="text-right">Incentive</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayrollItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No employees found matching your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayrollItems.map((item, index) => {
                      // Find the original index in payrollItems array for editing
                      const originalIndex = payrollItems.findIndex(p => p.employee_id === item.employee_id);
                      const isHeld = heldEmployeeIds.has(item.employee_id);
                      return (
                      <TableRow key={item.employee_id} className={isHeld ? "opacity-50 bg-muted/30" : ""}>
                      {editingIndex === originalIndex ? (
                        <>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium flex items-center gap-2">
                                {item.employee_name}
                                {heldEmployeeIds.has(item.employee_id) && (
                                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                                    HELD
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{item.employee_code}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.basic_salary}
                              onChange={(e) =>
                                handleFieldChange(originalIndex, "basic_salary", Number(e.target.value))
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.hra}
                              onChange={(e) =>
                                handleFieldChange(originalIndex, "hra", Number(e.target.value))
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.special_allowance}
                              onChange={(e) =>
                                handleFieldChange(
                                  originalIndex,
                                  "special_allowance",
                                  Number(e.target.value)
                                )
                              }
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-2">
                              <span className="font-semibold">
                                {formatCurrency(item.incentive_amount || 0)}
                              </span>
                              {canModify && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenIncentive(originalIndex)}
                                  >
                                    {item.incentive_amount ? "Edit Incentive" : "Add Incentive"}
                                  </Button>
                                  {activeIncentiveIndex === originalIndex && (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        value={incentiveDraft}
                                        onChange={(e) => setIncentiveDraft(e.target.value)}
                                        className="w-28"
                                      />
                                      <Button
                                        size="sm"
                                        onClick={handleSaveIncentive}
                                        disabled={savingIncentive}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setActiveIncentiveIndex(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(item.gross_salary)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span>{formatCurrency(item.deductions)}</span>
                              {item.advance_deduction && item.advance_deduction > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  (EMI: {formatCurrency(item.advance_deduction)})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatCurrency(item.net_salary)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSaveEdit(originalIndex)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium flex items-center gap-2">
                                {item.employee_name}
                                {heldEmployeeIds.has(item.employee_id) && (
                                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                                    HELD
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{item.employee_code}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.basic_salary)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.hra)}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(item.special_allowance)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-2">
                              <span className="font-semibold">
                                {formatCurrency(item.incentive_amount || 0)}
                              </span>
                              {canModify && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenIncentive(originalIndex)}
                                  >
                                    {item.incentive_amount ? "Edit Incentive" : "Add Incentive"}
                                  </Button>
                                  {activeIncentiveIndex === originalIndex && (
                                    <div className="flex items-center justify-end gap-2">
                                      <Input
                                        type="number"
                                        value={incentiveDraft}
                                        onChange={(e) => setIncentiveDraft(e.target.value)}
                                        className="w-28"
                                      />
                                      <Button
                                        size="sm"
                                        onClick={handleSaveIncentive}
                                        disabled={savingIncentive}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setActiveIncentiveIndex(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(item.gross_salary)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span>{formatCurrency(item.deductions)}</span>
                              {item.advance_deduction && item.advance_deduction > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  (EMI: {formatCurrency(item.advance_deduction)})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatCurrency(item.net_salary)}
                          </TableCell>
                          <TableCell>
                            {canModify && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEdit(originalIndex)}
                                  disabled={isHeld}
                                >
                                  <Edit2 className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant={isHeld ? "default" : "destructive"}
                                  onClick={() => handleHoldEmployee(item.employee_id)}
                                  title={isHeld ? "Unhold Salary" : "Hold Salary"}
                                >
                                  {isHeld ? (
                                    <>
                                      <RotateCcw className="h-4 w-4 mr-1" />
                                      Unhold
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="h-4 w-4 mr-1" />
                                      Hold
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  )})
                  )}
                </TableBody>
              </Table>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Gross Salary</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Deductions</p>
                    <p className="text-2xl font-bold text-red-600">
                      {formatCurrency(totalDeductions)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Net Salary</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(totalNet)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          {mode === 'edit' ? (
            <Button
              disabled={!canModify || processing || activePayrollItems.length === 0}
              onClick={saveChanges}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          ) : (
            <AlertDialog open={confirmOpen} onOpenChange={(open) => !processing && setConfirmOpen(open)}>
              <AlertDialogTrigger asChild>
                <Button
                  disabled={!canModify || processing || activePayrollItems.length === 0}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Process Payroll"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Process payroll?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to process the payrolls?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={processing}>No</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={processing}
                    onClick={() => processPayroll()}
                  >
                    Yes, Process
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

