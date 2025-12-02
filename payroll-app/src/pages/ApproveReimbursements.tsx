import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  REIMBURSEMENT_CATEGORY_LABELS,
  ReimbursementCategoryValue,
} from "@/constants/reimbursements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell } from "lucide-react";

type PendingReimbursement = {
  id: string;
  employee_id: string;
  employee_code?: string | null;
  employee_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  category: string;
  category_value?: ReimbursementCategoryValue | string;
  category_label?: string;
  amount: string | number;
  description?: string | null;
  receipt_url?: string | null;
  submitted_at: string;
  status: "pending" | "approved" | "rejected" | "paid";
};

type HistoryReimbursement = PendingReimbursement & {
  employee_name?: string | null;
  email?: string | null;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const resolveReceiptLink = (url?: string | null) => {
  if (!url) {
    return null;
  }
  if (url.startsWith("http")) {
    return url;
  }
  const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedUrl = url.startsWith("/") ? url : `/${url}`;
  return `${normalizedBase}${normalizedUrl}`;
};

const statusVariants: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-rose-100 text-rose-800 border-rose-300",
  paid: "bg-blue-100 text-blue-800 border-blue-300",
};

const ApproveReimbursements = () => {
  const [selected, setSelected] = useState<PendingReimbursement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const queryClient = useQueryClient();

  // Filter states for history
  const [filters, setFilters] = useState({
    status: "",
    employee_id: "",
    employee_name: "",
    from_date: "",
    to_date: "",
    sort_by: "submitted_at",
    sort_order: "desc" as "asc" | "desc",
  });

  // Fetch pending count for notifications
  const { data: pendingCountData } = useQuery({
    queryKey: ["reimbursements", "pending-count"],
    queryFn: () => api.reimbursements.pendingCount(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const pendingCount = pendingCountData?.count || 0;

  // Fetch pending reimbursements
  const { data, isLoading } = useQuery({
    queryKey: ["reimbursements", "pending"],
    queryFn: () => api.reimbursements.pending(),
  });

  const reimbursements = useMemo(
    () => (data?.reimbursements as PendingReimbursement[] | undefined) ?? [],
    [data],
  );

  // Fetch history with filters
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["reimbursements", "history", filters],
    queryFn: () => api.reimbursements.history(filters),
    enabled: activeTab === "history",
  });

  const historyReimbursements = useMemo(
    () => (historyData?.reimbursements as HistoryReimbursement[] | undefined) ?? [],
    [historyData],
  );

  const historySummary = historyData?.summary || {
    total_count: 0,
    total_amount: 0,
    paid_amount: 0,
    approved_amount: 0,
  };

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "reject" }) => {
      if (action === "approve") {
        return api.reimbursements.approve(id);
      }
      return api.reimbursements.reject(id);
    },
    onSuccess: (_, variables) => {
      if (variables.action === "reject") {
        toast.success("Reimbursement rejected", {
          description: "View rejected claims in the History tab",
        });
        // Switch to history tab to show the rejected claim
        setActiveTab("history");
      } else {
        toast.success("Reimbursement approved");
      }
      queryClient.invalidateQueries({ queryKey: ["reimbursements", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursements", "pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["reimbursements", "history"] });
      setDialogOpen(false);
      setSelected(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update reimbursement");
    },
  });

  const openDialog = (claim: PendingReimbursement) => {
    setSelected(claim);
    setDialogOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      status: "",
      employee_id: "",
      employee_name: "",
      from_date: "",
      to_date: "",
      sort_by: "submitted_at",
      sort_order: "desc",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Reimbursement Management</h1>
              {pendingCount > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  {pendingCount} Pending
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Review and approve employee expense claims for your organization.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending Claims
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle>Pending Claims</CardTitle>
                  <CardDescription>
                    {reimbursements.length === 0
                      ? "No reimbursements waiting for review."
                      : `You have ${reimbursements.length} pending reimbursement${
                          reimbursements.length > 1 ? "s" : ""
                        }.`}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    queryClient.invalidateQueries({ queryKey: ["reimbursements", "pending"] });
                    queryClient.invalidateQueries({ queryKey: ["reimbursements", "pending-count"] });
                  }}
                >
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : reimbursements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All caught up! Nothing pending review.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Review</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reimbursements.map((claim) => {
                        const categoryLabel =
                          claim.category_label ||
                          REIMBURSEMENT_CATEGORY_LABELS[claim.category_value || claim.category] ||
                          claim.category ||
                          "Other";
                        const employeeName =
                          claim.employee_name ||
                          [claim.first_name, claim.last_name].filter(Boolean).join(" ") ||
                          "Unknown";
                        return (
                          <TableRow key={claim.id}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{employeeName}</span>
                                {claim.employee_code && (
                                  <span className="text-xs text-muted-foreground">
                                    {claim.employee_code}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{categoryLabel}</TableCell>
                            <TableCell>
                              {currencyFormatter.format(Number(claim.amount || 0))}
                            </TableCell>
                            <TableCell>
                              {claim.submitted_at
                                ? new Date(claim.submitted_at).toLocaleString("en-IN")
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusVariants[claim.status] || ""}>
                                {claim.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button variant="secondary" size="sm" onClick={() => openDialog(claim)}>
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Reimbursement History</CardTitle>
                <CardDescription>
                  View and filter all reimbursement records including pending, approved, rejected, and paid claims. Track total amounts reimbursed to employees.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="status-filter">Status</Label>
                      <Select
                        value={filters.status}
                        onValueChange={(value) => handleFilterChange("status", value)}
                      >
                        <SelectTrigger id="status-filter">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employee-id-filter">Employee ID</Label>
                      <Input
                        id="employee-id-filter"
                        placeholder="Search by Employee ID"
                        value={filters.employee_id}
                        onChange={(e) => handleFilterChange("employee_id", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="employee-name-filter">Employee Name</Label>
                      <Input
                        id="employee-name-filter"
                        placeholder="Search by Employee Name"
                        value={filters.employee_name}
                        onChange={(e) => handleFilterChange("employee_name", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sort-by">Sort By</Label>
                      <Select
                        value={filters.sort_by}
                        onValueChange={(value) => handleFilterChange("sort_by", value)}
                      >
                        <SelectTrigger id="sort-by">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="submitted_at">Date</SelectItem>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="employee_name">Employee Name</SelectItem>
                          <SelectItem value="employee_code">Employee ID</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="from-date">From Date</Label>
                      <Input
                        id="from-date"
                        type="date"
                        value={filters.from_date}
                        onChange={(e) => handleFilterChange("from_date", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="to-date">To Date</Label>
                      <Input
                        id="to-date"
                        type="date"
                        value={filters.to_date}
                        onChange={(e) => handleFilterChange("to_date", e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sort-order">Sort Order</Label>
                      <Select
                        value={filters.sort_order}
                        onValueChange={(value) =>
                          handleFilterChange("sort_order", value as "asc" | "desc")
                        }
                      >
                        <SelectTrigger id="sort-order">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">Descending</SelectItem>
                          <SelectItem value="asc">Ascending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ["reimbursements", "history"] });
                      }}
                    >
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Summary Statistics */}
                {historySummary.total_count > 0 && (
                  <div className="grid gap-4 md:grid-cols-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Records</CardDescription>
                        <CardTitle className="text-2xl">{historySummary.total_count}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Total Amount</CardDescription>
                        <CardTitle className="text-2xl">
                          {currencyFormatter.format(historySummary.total_amount)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Approved Amount</CardDescription>
                        <CardTitle className="text-2xl">
                          {currencyFormatter.format(historySummary.approved_amount)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Paid Amount</CardDescription>
                        <CardTitle className="text-2xl">
                          {currencyFormatter.format(historySummary.paid_amount)}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                  </div>
                )}

                {historyLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : historyReimbursements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reimbursement records found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>Employee ID</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyReimbursements.map((claim) => {
                          const categoryLabel =
                            claim.category_label ||
                            REIMBURSEMENT_CATEGORY_LABELS[claim.category_value || claim.category] ||
                            claim.category ||
                            "Other";
                          const employeeName =
                            claim.employee_name ||
                            [claim.first_name, claim.last_name].filter(Boolean).join(" ") ||
                            "Unknown";
                          return (
                            <TableRow key={claim.id}>
                              <TableCell className="font-medium">{employeeName}</TableCell>
                              <TableCell>
                                {claim.employee_code || claim.employee_id || "N/A"}
                              </TableCell>
                              <TableCell>{categoryLabel}</TableCell>
                              <TableCell>
                                {currencyFormatter.format(Number(claim.amount || 0))}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusVariants[claim.status] || ""}>
                                  {claim.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {claim.submitted_at
                                  ? new Date(claim.submitted_at).toLocaleDateString("en-IN", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {claim.receipt_url ? (
                                  <Button variant="link" asChild className="px-0">
                                    <a
                                      href={resolveReceiptLink(claim.receipt_url) ?? "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      View
                                    </a>
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Reimbursement</DialogTitle>
            <DialogDescription>
              {selected
                ? `Submitted on ${new Date(selected.submitted_at).toLocaleString("en-IN")}`
                : "No claim selected"}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Employee</p>
                <p className="font-medium">
                  {selected.employee_name ||
                    [selected.first_name, selected.last_name].filter(Boolean).join(" ") ||
                    "Unknown"}
                  {selected.employee_code ? ` • ${selected.employee_code}` : ""}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">
                    {selected.category_label ||
                      REIMBURSEMENT_CATEGORY_LABELS[selected.category_value || selected.category] ||
                      selected.category ||
                      "Other"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">
                    {currencyFormatter.format(Number(selected.amount || 0))}
                  </p>
                </div>
              </div>
              {selected.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="font-medium whitespace-pre-wrap">{selected.description}</p>
                </div>
              )}
              {selected.receipt_url && (
                <div>
                  <p className="text-sm text-muted-foreground">Receipt</p>
                  <Button asChild variant="link" className="px-0">
                    <a
                      href={resolveReceiptLink(selected.receipt_url) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download receipt
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={reviewMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!selected || reviewMutation.isPending}
              onClick={() => selected && reviewMutation.mutate({ id: selected.id, action: "reject" })}
            >
              Reject
            </Button>
            <Button
              disabled={!selected || reviewMutation.isPending}
              onClick={() => selected && reviewMutation.mutate({ id: selected.id, action: "approve" })}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApproveReimbursements;
