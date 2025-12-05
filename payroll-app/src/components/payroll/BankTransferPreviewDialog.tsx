import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Download, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BankTransferPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleId: string;
  cycleMonth: number;
  cycleYear: number;
}

interface BankTransferItem {
  employee_code: string;
  employee_name: string;
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_name: string;
  net_salary: number;
  payment_date: string;
}

interface BankTransferPreviewData {
  cycle: {
    id: string;
    month: number;
    year: number;
    status: string;
    payday?: string;
  };
  payment_date: string;
  items: BankTransferItem[];
  total_employees: number;
  total_amount: number;
}

export const BankTransferPreviewDialog = ({
  open,
  onOpenChange,
  cycleId,
  cycleMonth,
  cycleYear,
}: BankTransferPreviewDialogProps) => {
  const { data, isLoading, error } = useQuery<BankTransferPreviewData>({
    queryKey: ["bank-transfer-preview", cycleId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:4000"}/api/payroll-cycles/${cycleId}/export/bank-transfer/preview`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to fetch preview" }));
        throw new Error(errorData.error || "Failed to fetch preview");
      }

      return response.json();
    },
    enabled: open && !!cycleId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleDownload = async () => {
    try {
      await api.payroll.downloadBankTransferFile(cycleId);
      toast.success("Bank transfer file downloaded successfully");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error downloading bank transfer file:", error);
      toast.error(error.message || "Failed to download bank transfer file");
    }
  };

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString("default", { month: "long" });
  };

  const items = data?.items || [];
  const hasMissingBankDetails = items.some(
    (item) => item.bank_account_number === "N/A" || item.bank_ifsc_code === "N/A"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileSpreadsheet className="mr-2 h-5 w-5" />
            Bank Transfer Export Preview - {getMonthName(cycleMonth)} {cycleYear}
          </DialogTitle>
          <DialogDescription>
            Preview the bank transfer file before downloading. This file will be sent to the bank for salary disbursement.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading preview...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            Failed to load preview. Please try again.
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No payroll items found for this cycle. Please process the payroll first.
          </div>
        ) : (
          <>
            {hasMissingBankDetails && (
              <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  Some employees have missing bank details (marked as "N/A"). Please update their bank information before sending the file to the bank.
                </AlertDescription>
              </Alert>
            )}

            <ScrollArea className="flex-1 border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[100px]">Employee Code</TableHead>
                    <TableHead className="min-w-[200px]">Employee Name</TableHead>
                    <TableHead className="min-w-[150px]">Bank Account Number</TableHead>
                    <TableHead className="min-w-[120px]">IFSC Code</TableHead>
                    <TableHead className="min-w-[120px]">Bank Name</TableHead>
                    <TableHead className="text-right min-w-[120px]">Net Salary</TableHead>
                    <TableHead className="min-w-[120px]">Payment Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={`${item.employee_code}-${index}`}>
                      <TableCell className="font-medium">{item.employee_code}</TableCell>
                      <TableCell>{item.employee_name}</TableCell>
                      <TableCell
                        className={
                          item.bank_account_number === "N/A"
                            ? "text-muted-foreground italic"
                            : ""
                        }
                      >
                        {item.bank_account_number}
                      </TableCell>
                      <TableCell
                        className={
                          item.bank_ifsc_code === "N/A"
                            ? "text-muted-foreground italic"
                            : ""
                        }
                      >
                        {item.bank_ifsc_code}
                      </TableCell>
                      <TableCell
                        className={
                          item.bank_name === "N/A"
                            ? "text-muted-foreground italic"
                            : ""
                        }
                      >
                        {item.bank_name}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.net_salary)}
                      </TableCell>
                      <TableCell>{item.payment_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <Card className="mt-4">
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Employees</p>
                    <p className="text-2xl font-bold">{data?.total_employees || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Payment Date</p>
                    <p className="text-lg font-semibold">{data?.payment_date || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Total Amount</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(data?.total_amount || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={isLoading || items.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Download Excel File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

