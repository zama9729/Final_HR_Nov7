import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Play, Receipt, Edit2, Trash2, Download } from "lucide-react";
import { PayrollReviewDialog } from "./PayrollReviewDialog";
import { PayrollCyclePayslipsDialog } from "./PayrollCyclePayslipsDialog";
import { BankTransferPreviewDialog } from "./BankTransferPreviewDialog";
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
import { api } from "@/lib/api";
import { toast } from "sonner";

interface PayrollCycle {
  id: string;
  month: number;
  year: number;
  status: string;
  total_employees: number;
  total_amount: number;
  created_at: string;
  approved_at?: string;
  payday?: string;
  run_type?: "regular" | "off_cycle";
}

interface PayrollCycleListProps {
  cycles: PayrollCycle[];
  onRefresh?: () => void;
}

export const PayrollCycleList = ({ cycles, onRefresh }: PayrollCycleListProps) => {
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [payslipsDialogOpen, setPayslipsDialogOpen] = useState(false);
  const [bankTransferPreviewOpen, setBankTransferPreviewOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<PayrollCycle | null>(null);
  const [confirmProcessOpen, setConfirmProcessOpen] = useState(false);
  const [cycleToProcess, setCycleToProcess] = useState<PayrollCycle | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [cycleToDelete, setCycleToDelete] = useState<PayrollCycle | null>(null);
  const [processing, setProcessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isCycleEditable = (status: string) =>
    !["processing", "completed", "paid", "failed"].includes(status);

  const isCycleDeletable = (status: string) =>
    ["draft", "pending_approval"].includes(status);

  const handleProcess = (cycle: PayrollCycle) => {
    setCycleToProcess(cycle);
    setConfirmProcessOpen(true);
  };

  const handleEdit = (cycle: PayrollCycle) => {
    if (!isCycleEditable(cycle.status)) return;
    setSelectedCycle(cycle);
    setReviewDialogOpen(true);
  };

  const handleViewPayslips = (cycle: PayrollCycle) => {
    setSelectedCycle(cycle);
    setPayslipsDialogOpen(true);
  };

  const handleProcessed = () => {
    if (onRefresh) {
      onRefresh();
    }
  };

  const processCycle = async () => {
    if (!cycleToProcess) return;
    setProcessing(true);
    try {
      const result = await api.payroll.processCycle(cycleToProcess.id);
      toast.success(result.message || "Payroll processed successfully");
      setConfirmProcessOpen(false);
      setCycleToProcess(null);
      handleProcessed();
    } catch (error: any) {
      toast.error(error.message || "Failed to process payroll");
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = (cycle: PayrollCycle) => {
    if (!isCycleDeletable(cycle.status)) return;
    setCycleToDelete(cycle);
    setConfirmDeleteOpen(true);
  };

  const deleteCycle = async () => {
    if (!cycleToDelete) return;
    setDeleting(true);
    try {
      const result = await api.payroll.deleteCycle(cycleToDelete.id);
      toast.success(result.message || "Payroll cycle deleted successfully");
      setConfirmDeleteOpen(false);
      setCycleToDelete(null);
      handleProcessed();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete payroll cycle");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportBankFile = (cycle: PayrollCycle) => {
    setSelectedCycle(cycle);
    setBankTransferPreviewOpen(true);
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "secondary";
      case "processing": return "default";
      case "pending_approval": return "outline";
      case "approved": return "default";
      case "completed": return "default";
      case "paid": return "default";
      case "failed": return "destructive";
      default: return "secondary";
    }
  };

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'long' });
  };

  const getPayday = (cycle: PayrollCycle) => {
    // If payday is set in database, use it
    if (cycle.payday) {
      if (cycle.status === 'paid') {
        return <span className="text-green-600 font-medium">Paid on {new Date(cycle.payday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>;
      }
      return new Date(cycle.payday).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    
    // Otherwise calculate default payday
    const lastDay = new Date(cycle.year, cycle.month, 0);
    const dayOfWeek = lastDay.getDay();
    
    if (dayOfWeek === 0) { // Sunday
      lastDay.setDate(lastDay.getDate() - 2);
    } else if (dayOfWeek === 6) { // Saturday
      lastDay.setDate(lastDay.getDate() - 1);
    }
    
    if (cycle.status === 'paid') {
      return <span className="text-green-600 font-medium">Paid</span>;
    } else if (cycle.status === 'approved' || cycle.status === 'processing' || cycle.status === 'completed') {
      return lastDay.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      return <span className="text-muted-foreground">-</span>;
    }
  };

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Employees</TableHead>
          <TableHead className="text-right">Total Amount</TableHead>
          <TableHead>Payday</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cycles.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No payroll cycles found. Create your first payroll cycle to get started.
            </TableCell>
          </TableRow>
        ) : (
          cycles.map((cycle) => (
            <TableRow key={cycle.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col gap-1">
                  <span>{getMonthName(cycle.month)} {cycle.year}</span>
                  {cycle.run_type && (
                    <Badge 
                      variant={cycle.run_type === "off_cycle" ? "outline" : "secondary"}
                      className="text-xs w-fit"
                    >
                      {cycle.run_type === "off_cycle" ? "Off-Cycle" : "Regular"}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusColor(cycle.status)}>
                  {cycle.status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-medium">
                {cycle.total_employees || 0}
              </TableCell>
              <TableCell className="text-right font-medium">
                ₹{(cycle.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell>
                {getPayday(cycle)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(cycle.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {cycle.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleProcess(cycle)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Process
                    </Button>
                  )}
                  {isCycleEditable(cycle.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(cycle)}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  )}
                  {isCycleDeletable(cycle.status) && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(cycle)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  )}
                  {(cycle.status === 'completed' || cycle.status === 'approved' || cycle.status === 'processing') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewPayslips(cycle)}
                    >
                      <Receipt className="mr-2 h-4 w-4" />
                      View Payslips
                    </Button>
                  )}
                  {cycle.status !== 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportBankFile(cycle)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Bank File
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>

    {selectedCycle && (
      <>
        <PayrollReviewDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          cycleId={selectedCycle.id}
          cycleMonth={selectedCycle.month}
          cycleYear={selectedCycle.year}
          onProcessed={handleProcessed}
          canModify={isCycleEditable(selectedCycle.status)}
          mode="edit"
        />
        <PayrollCyclePayslipsDialog
          open={payslipsDialogOpen}
          onOpenChange={setPayslipsDialogOpen}
          cycleId={selectedCycle.id}
          cycleMonth={selectedCycle.month}
          cycleYear={selectedCycle.year}
        />
        <BankTransferPreviewDialog
          open={bankTransferPreviewOpen}
          onOpenChange={setBankTransferPreviewOpen}
          cycleId={selectedCycle.id}
          cycleMonth={selectedCycle.month}
          cycleYear={selectedCycle.year}
        />
      </>
    )}

    <AlertDialog open={confirmProcessOpen} onOpenChange={(open) => !processing && setConfirmProcessOpen(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Process payroll?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to process the payroll for this cycle?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>No</AlertDialogCancel>
          <AlertDialogAction onClick={processCycle} disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={confirmDeleteOpen} onOpenChange={(open) => !deleting && setConfirmDeleteOpen(open)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete payroll cycle?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this payroll cycle? This action cannot be undone. All associated payroll items and incentives will also be deleted.
            {cycleToDelete && (
              <span className="block mt-2 font-medium">
                Cycle: {getMonthName(cycleToDelete.month)} {cycleToDelete.year}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={deleteCycle} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
};
