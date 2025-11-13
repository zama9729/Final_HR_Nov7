import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Download } from "lucide-react";

interface DeclarationSummary {
  id: string;
  employee_id: string;
  financial_year: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  chosen_regime: "old" | "new";
  remarks?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface DeclarationItem {
  id: string;
  declaration_id: string;
  component_id: string;
  declared_amount: string;
  approved_amount?: string;
  label: string;
  section: string;
  section_group?: string;
  proof_url?: string | null;
}

const getCurrentFinancialYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
};

const financialYearOptions = () => {
  const startYear = parseInt(getCurrentFinancialYear().split("-")[0], 10);
  return [startYear - 1, startYear, startYear + 1].map((year) => `${year}-${year + 1}`);
};

export default function TaxDeclarationReview() {
  const { toast } = useToast();
  const [financialYear, setFinancialYear] = useState<string>(getCurrentFinancialYear());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [declarations, setDeclarations] = useState<DeclarationSummary[]>([]);
  const [items, setItems] = useState<DeclarationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approvedValues, setApprovedValues] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const autoSelectRef = useRef(true);

  useEffect(() => {
    loadDeclarations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financialYear, statusFilter]);

  useEffect(() => {
    if (selectedId) {
      const selected = items.filter((item) => item.declaration_id === selectedId);
      const approved: Record<string, string> = {};
      selected.forEach((item) => {
        approved[item.id] = item.approved_amount ?? item.declared_amount ?? "0";
      });
      setApprovedValues(approved);
      const declaration = declarations.find((decl) => decl.id === selectedId);
      setRemarks(declaration?.remarks || "");
    } else {
      setApprovedValues({});
      setRemarks("");
    }
  }, [selectedId, items, declarations]);

  const loadDeclarations = async () => {
    try {
      setLoading(true);
      const result = await api.getTaxDeclarations({
        financial_year: financialYear,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setDeclarations(result.declarations || []);
      setItems(result.items || []);
      const availableIds = new Set((result.declarations || []).map((decl: DeclarationSummary) => decl.id));
      setSelectedId((prev) => {
        if (!prev) {
          return prev;
        }
        return availableIds.has(prev) ? prev : null;
      });
    } catch (error: any) {
      console.error("Failed to fetch tax declarations", error);
      toast({
        title: "Error",
        description: error?.message || "Unable to load tax declarations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId && declarations.length > 0) {
      if (autoSelectRef.current) {
        setSelectedId(declarations[0].id);
      } else {
        autoSelectRef.current = true;
      }
    }
  }, [declarations, selectedId]);

  const selectedDeclaration = useMemo(
    () => declarations.find((decl) => decl.id === selectedId) || null,
    [declarations, selectedId]
  );

  const selectedItems = useMemo(
    () => items.filter((item) => item.declaration_id === selectedId),
    [items, selectedId]
  );

  const selectedSummary = useMemo(() => {
    if (!selectedId) {
      return { declared: 0, approved: 0, hasApproved: false };
    }
    let declared = 0;
    let approved = 0;
    let hasApproved = false;
    selectedItems.forEach((item) => {
      declared += Number(item.declared_amount || 0);
      const approvedAmount = item.approved_amount !== undefined && item.approved_amount !== null
        ? Number(item.approved_amount)
        : NaN;
      if (!Number.isNaN(approvedAmount)) {
        hasApproved = true;
        approved += approvedAmount;
      }
    });
    return { declared, approved, hasApproved };
  }, [selectedId, selectedItems]);

  const statusChipStyles = (status?: string) => {
    switch (status) {
      case "approved":
        return "bg-emerald-100 text-emerald-700";
      case "rejected":
        return "bg-rose-100 text-rose-700";
      case "submitted":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const declarationStatusSummary = useMemo(() => {
    const summary = {
      approved: 0,
      rejected: 0,
      submitted: 0,
    };
    declarations.forEach((decl) => {
      if (decl.status === "approved") summary.approved += 1;
      else if (decl.status === "rejected") summary.rejected += 1;
      else if (decl.status === "submitted") summary.submitted += 1;
    });
    return summary;
  }, [declarations]);

  const filteredDeclarations = useMemo(() => {
    if (statusFilter === "all") {
      return declarations;
    }
    return declarations.filter((decl) => decl.status === statusFilter);
  }, [declarations, statusFilter]);

  const handleApproveAmountChange = (itemId: string, value: string) => {
    setApprovedValues((prev) => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const handleReview = async (decision: "approved" | "rejected") => {
    if (!selectedId) return;

    if (decision === "approved" && selectedItems.length === 0) {
      toast({
        title: "No items",
        description: "Cannot approve a declaration without any tax components.",
        variant: "destructive",
      });
      return;
    }

    try {
      setReviewing(true);
      await api.reviewTaxDeclaration(selectedId, {
        status: decision,
        remarks: remarks || undefined,
        items:
          decision === "approved"
            ? selectedItems.map((item) => ({
                id: item.id,
                approved_amount: Number(approvedValues[item.id] || 0),
              }))
            : undefined,
      });

      toast({
        title: decision === "approved" ? "Declaration approved" : "Declaration rejected",
        description:
          decision === "approved"
            ? "The declaration has been approved successfully."
            : "The declaration has been rejected.",
      });

      await loadDeclarations();

      autoSelectRef.current = false;
      setSelectedId(null);
      setRemarks("");
      setApprovedValues({});

      window.dispatchEvent(new Event("taxDeclarations:updated"));
    } catch (error: any) {
      console.error("Failed to review tax declaration", error);
      toast({
        title: "Error",
        description: error?.message || "Unable to record your decision",
        variant: "destructive",
      });
    } finally {
      setReviewing(false);
    }
  };

  const handleDownloadForm16 = async () => {
    if (!selectedDeclaration) return;
    try {
      setReviewing(true);
      const blob = await api.downloadForm16(financialYear, selectedDeclaration.employee_id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const namePart =
        [selectedDeclaration.first_name, selectedDeclaration.last_name].filter(Boolean).join("-") ||
        selectedDeclaration.employee_id;
      link.download = `Form16-${namePart || "employee"}-${financialYear}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({
        title: "Form 16 downloaded",
        description: "Form 16 has been generated for the selected employee.",
      });
    } catch (error: any) {
      console.error("Failed to download Form 16", error);
      toast({
        title: "Download failed",
        description: error?.message || "Unable to download Form 16.",
        variant: "destructive",
      });
    } finally {
      setReviewing(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tax Declaration Review</h1>
            <p className="text-muted-foreground">
              Review, approve, or reject employee tax declarations for the selected financial year.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="financialYear">Financial Year</Label>
            <Select value={financialYear} onValueChange={setFinancialYear} disabled={reviewing}>
              <SelectTrigger id="financialYear" className="w-40">
                <SelectValue placeholder="Select FY" />
              </SelectTrigger>
              <SelectContent>
                {financialYearOptions().map((fy) => (
                  <SelectItem key={fy} value={fy}>
                    {fy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              className={`rounded-lg border p-3 text-center transition-all ${
                statusFilter === "approved"
                  ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                  : "border-emerald-200 bg-emerald-25 hover:border-emerald-400"
              }`}
              onClick={() => setStatusFilter(statusFilter === "approved" ? "all" : "approved")}
              disabled={reviewing}
            >
              <p className="text-xs font-medium uppercase text-emerald-700">Approved</p>
              <p className="text-2xl font-semibold text-emerald-600">{declarationStatusSummary.approved}</p>
            </button>
            <button
              type="button"
              className={`rounded-lg border p-3 text-center transition-all ${
                statusFilter === "rejected"
                  ? "border-rose-500 bg-rose-50 ring-2 ring-rose-200"
                  : "border-rose-200 bg-rose-25 hover:border-rose-400"
              }`}
              onClick={() => setStatusFilter(statusFilter === "rejected" ? "all" : "rejected")}
              disabled={reviewing}
            >
              <p className="text-xs font-medium uppercase text-rose-700">Rejected</p>
              <p className="text-2xl font-semibold text-rose-600">{declarationStatusSummary.rejected}</p>
            </button>
            <button
              type="button"
              className={`rounded-lg border p-3 text-center transition-all ${
                statusFilter === "submitted"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-300 bg-slate-25 hover:border-slate-400"
              }`}
              onClick={() => setStatusFilter(statusFilter === "submitted" ? "all" : "submitted")}
              disabled={reviewing}
            >
              <p className="text-xs font-medium uppercase text-slate-700">Pending</p>
              <p className="text-2xl font-semibold text-slate-800">{declarationStatusSummary.submitted}</p>
            </button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[65vh] overflow-y-auto">
              {loading ? (
                <div className="text-muted-foreground">Loading declarations…</div>
              ) : filteredDeclarations.length === 0 ? (
                <div className="text-muted-foreground">No declarations found for this view.</div>
              ) : (
                filteredDeclarations.map((declaration) => {
                  const name =
                    [declaration.first_name, declaration.last_name].filter(Boolean).join(" ") ||
                    declaration.email ||
                    "Employee";
                  const isSelected = declaration.id === selectedId;
                  const summaryItems = items.filter((item) => item.declaration_id === declaration.id);
                  const approvedTotal = summaryItems.reduce((total, item) => {
                    const amount =
                      declaration.status === "approved"
                        ? Number(item.approved_amount ?? item.declared_amount ?? 0)
                        : Number(item.declared_amount ?? 0);
                    return total + amount;
                  }, 0);
                  const statusLabel =
                    declaration.status === "submitted"
                      ? "Pending"
                      : declaration.status === "approved"
                      ? "Approved"
                      : "Rejected";

                  return (
                    <div key={declaration.id} className="rounded-lg border">
                      <button
                        onClick={() => setSelectedId(isSelected ? null : declaration.id)}
                        className={`flex w-full flex-col gap-2 rounded-lg px-4 py-3 text-left transition-colors ${
                          isSelected ? "bg-primary/5" : "hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm sm:text-base">{name}</span>
                            <span className="text-xs text-muted-foreground">
                              Employee ID: {declaration.employee_id}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="text-muted-foreground">
                              FY {declaration.financial_year}
                            </span>
                            <span className="font-medium">
                              ₹{approvedTotal.toLocaleString("en-IN")}
                            </span>
                            <Badge className="capitalize" variant={
                              declaration.status === "approved"
                                ? "default"
                                : declaration.status === "rejected"
                                ? "destructive"
                                : "secondary"
                            }>
                              {statusLabel}
                            </Badge>
                          </div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="border-t bg-muted/30 p-4 space-y-4">
                          <div className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3 text-sm">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Status
                              </p>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${statusChipStyles(declaration.status)}`}
                              >
                                {declaration.status.toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Total Declared
                              </p>
                              <p className="text-base font-semibold">
                                ₹{selectedSummary.declared.toLocaleString("en-IN")}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Total Approved
                              </p>
                              <p className="text-base font-semibold">
                                {declaration.status === "approved"
                                  ? `₹${selectedSummary.approved.toLocaleString("en-IN")}`
                                  : declaration.status === "rejected"
                                  ? "Rejected"
                                  : "Pending review"}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label>Reviewer Remarks</Label>
                            {declaration.status === "submitted" ? (
                              <Textarea
                                placeholder="Provide remarks for the employee (visible after review)"
                                value={remarks}
                                onChange={(event) => setRemarks(event.target.value)}
                                disabled={reviewing}
                              />
                            ) : (
                              <p className="rounded-md border bg-white p-3 text-sm text-muted-foreground">
                                {declaration.remarks?.trim() || "No reviewer remarks recorded."}
                              </p>
                            )}
                          </div>

                          <div className="space-y-4">
                            {summaryItems.length === 0 ? (
                              <div className="text-muted-foreground text-sm">
                                This declaration does not have any tax components listed.
                              </div>
                            ) : (
                              summaryItems.map((item) => (
                                <div key={item.id} className="border rounded-lg bg-white p-4 space-y-2">
                                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                    <div>
                                      <h3 className="text-base font-semibold">{item.label}</h3>
                                      <p className="text-xs text-muted-foreground">
                                        Section {item.section}
                                        {item.section_group ? ` • Group ${item.section_group}` : ""}
                                      </p>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        Declared: ₹{Number(item.declared_amount || 0).toLocaleString("en-IN")}
                                      </p>
                                      {item.proof_url ? (
                                        <a
                                          href={item.proof_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-primary mt-2 inline-flex items-center gap-1 underline underline-offset-2"
                                        >
                                          View proof
                                        </a>
                                      ) : (
                                        <p className="text-xs text-muted-foreground mt-2">
                                          No proof uploaded.
                                        </p>
                                      )}
                                    </div>
                                    {declaration.status === "submitted" && (
                                      <Input
                                        className="w-32"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={approvedValues[item.id] || ""}
                                        onChange={(event) => handleApproveAmountChange(item.id, event.target.value)}
                                        disabled={reviewing}
                                      />
                                    )}
                                  </div>
                                  {declaration.status === "approved" && item.approved_amount && (
                                    <p className="text-sm text-emerald-600">
                                      Approved: ₹{Number(item.approved_amount).toLocaleString("en-IN")}
                                    </p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              variant="secondary"
                              onClick={handleDownloadForm16}
                              disabled={reviewing}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download Form 16
                            </Button>
                            {declaration.status === "submitted" && (
                              <>
                                <Button
                                  variant="outline"
                                  onClick={() => handleReview("rejected")}
                                  disabled={reviewing || !selectedId}
                                >
                                  Reject
                                </Button>
                                <Button
                                  onClick={() => handleReview("approved")}
                                  disabled={reviewing || !selectedId}
                                >
                                  Approve
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}


