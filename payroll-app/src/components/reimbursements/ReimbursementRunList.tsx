import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { CreateReimbursementRunDialog } from "./CreateReimbursementRunDialog";

interface ReimbursementRun {
  id: string;
  run_date: string;
  status: "draft" | "processing" | "paid";
  total_amount: number;
  total_claims: number;
  reference_note?: string;
  created_at: string;
  created_by_name?: string;
}

interface ReimbursementRunListProps {
  onRefresh?: () => void;
}

export const ReimbursementRunList = ({ onRefresh }: ReimbursementRunListProps) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["reimbursement-runs"],
    queryFn: async () => {
      const result = await api.reimbursementRuns.list();
      return result.runs as ReimbursementRun[];
    },
  });

  const handleProcess = async (runId: string) => {
    setProcessingId(runId);
    try {
      await api.reimbursementRuns.process(runId);
      toast.success("Reimbursement run processed successfully");
      refetch();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to process reimbursement run");
    } finally {
      setProcessingId(null);
    }
  };

  const handleExport = async (runId: string) => {
    setExportingId(runId);
    try {
      const blob = await api.reimbursementRuns.exportBankFile(runId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reimbursement_payout_${runId.substring(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Bank file exported successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to export bank file");
    } finally {
      setExportingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "default";
      case "processing":
        return "secondary";
      case "draft":
        return "outline";
      default:
        return "outline";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const runs = data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Reimbursement Runs</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <CreateReimbursementRunDialog onSuccess={() => refetch()} />
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No reimbursement runs found.</p>
          <p className="text-sm mt-2">Create a new run to process approved expense claims.</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total Claims</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Reference Note</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">{formatDate(run.run_date)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusColor(run.status)}>
                      {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{run.total_claims}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(run.total_amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.reference_note || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.created_by_name || "System"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {run.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProcess(run.id)}
                          disabled={processingId === run.id}
                        >
                          {processingId === run.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Process"
                          )}
                        </Button>
                      )}
                      {run.status === "paid" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExport(run.id)}
                          disabled={exportingId === run.id}
                        >
                          {exportingId === run.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-2" />
                              Export Bank File
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

