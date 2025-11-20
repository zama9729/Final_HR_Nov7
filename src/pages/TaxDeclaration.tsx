import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Download } from "lucide-react";

interface TaxComponentDefinition {
  id: string;
  label: string;
  section: string;
  section_group?: string;
  max_limit?: string;
}

interface TaxDeclaration {
  id: string;
  financial_year: string;
  chosen_regime: "old" | "new";
  status: "draft" | "submitted" | "approved" | "rejected";
  remarks?: string;
  updated_at?: string;
}

interface TaxDeclarationItem {
  id: string;
  component_id: string;
  declared_amount: string;
  approved_amount?: string;
  proof_url?: string;
}

interface TaxDeclarationResponse {
  declaration: TaxDeclaration | null;
  items: TaxDeclarationItem[];
}

interface ComponentSummary {
  id: string;
  label: string;
  section: string;
  section_group?: string;
  max_limit?: string;
  declared: number;
  approved: number | null;
  proofUrl: string;
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

const formatCurrency = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) {
    return "—";
  }
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const statusBadge = (status?: string) => {
  if (!status) return null;
  let variant: "default" | "secondary" | "outline" = "default";
  if (status === "draft") variant = "secondary";
  if (status === "rejected") variant = "outline";
  return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
};

export default function TaxDeclaration() {
  const { toast } = useToast();
  const [financialYear, setFinancialYear] = useState(getCurrentFinancialYear());
  const [definitions, setDefinitions] = useState<TaxComponentDefinition[]>([]);
  const [declaration, setDeclaration] = useState<TaxDeclaration | null>(null);
  const [items, setItems] = useState<TaxDeclarationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financialYear, refreshToken]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setRefreshToken((token) => token + 1);
      }
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshToken((token) => token + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = () => setRefreshToken((token) => token + 1);
    window.addEventListener("taxDeclarations:updated", handler);
    return () => window.removeEventListener("taxDeclarations:updated", handler);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [defs, declResult] = await Promise.all([
        api.getTaxDefinitions(financialYear),
        api.getMyTaxDeclaration(financialYear),
      ]);
      const normalizedDefs = Array.isArray(defs) ? (defs as TaxComponentDefinition[]) : [];
      const normalizedDecl = (declResult || {}) as TaxDeclarationResponse;
      const normalizedItems = Array.isArray(normalizedDecl.items) ? normalizedDecl.items : [];

      setDefinitions(normalizedDefs);
      setDeclaration(normalizedDecl.declaration || null);
      setItems(normalizedItems);
    } catch (error: any) {
      console.error("Failed to load tax declaration data", error);
      toast({
        title: "Error",
        description: error?.message || "Unable to load tax declaration data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const componentSummaries = useMemo<ComponentSummary[]>(() => {
    const byId = new Map(items.map((item) => [item.component_id, item]));

    if (definitions.length === 0 && items.length > 0) {
      // No definitions returned—fallback to items only
      return items.map<ComponentSummary>((item) => ({
        id: item.component_id,
        label: "Declared Component",
        section: "-",
        section_group: undefined,
        declared: Number(item.declared_amount || 0),
        approved: item.approved_amount ? Number(item.approved_amount) : null,
        proofUrl: item.proof_url || "",
      }));
    }

    return definitions.map<ComponentSummary>((definition) => {
      const record = byId.get(definition.id);
      return {
        id: definition.id,
        label: definition.label,
        section: definition.section,
        section_group: definition.section_group,
        max_limit: definition.max_limit,
        declared: record ? Number(record.declared_amount || 0) : 0,
        approved: record?.approved_amount ? Number(record.approved_amount) : null,
        proofUrl: record?.proof_url || "",
      };
    });
  }, [definitions, items]);

  const totals = useMemo(() => {
    let declared = 0;
    let approved = 0;
    let hasApproved = false;
    componentSummaries.forEach((component) => {
      declared += component.declared || 0;
      if (component.approved !== null && component.approved !== undefined) {
        hasApproved = true;
        approved += component.approved || 0;
      }
    });
    return { declared, approved, hasApproved };
  }, [componentSummaries]);

  const handleDownloadForm16 = async () => {
    try {
      setDownloading(true);
      const blob = await api.downloadForm16(financialYear);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Form16-${financialYear}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Failed to download Form 16", error);
      toast({
        title: "Download failed",
        description: error?.message || "Unable to download Form 16.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const statusMessage = useMemo(() => {
    const status = declaration?.status;
    if (!status) {
      return "Submit your declaration through the payroll portal to see the latest status here.";
    }
    if (status === "approved") {
      return "Your declaration has been approved. Keep this summary for your records.";
    }
    if (status === "rejected") {
      return "Your declaration was rejected. Review the remarks above and submit corrections in the payroll portal.";
    }
    if (status === "submitted") {
      return "Your declaration is awaiting review. HR will update the status once it is processed.";
    }
    return "Draft saved. Complete submission from the payroll portal when you are ready.";
  }, [declaration?.status]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Tax Declaration</h1>
            <p className="text-muted-foreground max-w-prose">
              Employees now submit their declarations in the payroll portal. This page provides a read-only summary of
              the latest information on record.
            </p>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label htmlFor="financialYear">Financial Year</Label>
              <Select value={financialYear} onValueChange={setFinancialYear}>
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
            <Button variant="outline" onClick={() => setRefreshToken((token) => token + 1)}>
              Refresh
            </Button>
            <Button variant="outline" onClick={handleDownloadForm16} disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Preparing…" : "Download Form 16"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Declaration Status</CardTitle>
              {statusBadge(declaration?.status)}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">Tax Regime:</span>{" "}
              {declaration?.chosen_regime ? declaration.chosen_regime.toUpperCase() : "OLD"}
            </p>
            <p>
              <span className="font-medium">Total Declared:</span> {formatCurrency(totals.declared)}
            </p>
            <p>
              <span className="font-medium">Total Approved:</span>{" "}
              {totals.hasApproved ? formatCurrency(totals.approved) : "Pending review"}
            </p>
            {declaration?.remarks && (
              <div className="mt-3 rounded-md border border-muted bg-muted/40 p-3 text-sm">
                <p className="font-medium">Reviewer Remarks</p>
                <p className="text-muted-foreground">{declaration.remarks}</p>
              </div>
            )}
            <p className="mt-3 text-muted-foreground">{statusMessage}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax-Saving Components</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : componentSummaries.length === 0 ? (
              <p className="text-muted-foreground">
                No declarations are on file for this financial year. Ask employees to submit their details from the
                payroll portal.
              </p>
            ) : (
              componentSummaries.map((component) => (
                <div key={component.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-base font-semibold">{component.label}</h3>
                      <p className="text-xs text-muted-foreground">
                        Section {component.section}
                        {component.section_group ? ` • Group ${component.section_group}` : ""}
                        {component.max_limit ? ` • Max ₹${Number(component.max_limit).toLocaleString()}` : ""}
                      </p>
                    </div>
                    {component.declared > 0 ? (
                      <Badge variant="outline">Declared</Badge>
                    ) : (
                      <Badge variant="secondary">Not Declared</Badge>
                    )}
                  </div>

                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="font-medium text-muted-foreground">Declared Amount</p>
                      <p className="text-base">{formatCurrency(component.declared)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Approved Amount</p>
                      <p className="text-base">
                        {component.approved !== null && component.approved !== undefined
                          ? formatCurrency(component.approved)
                          : "Pending review"}
                      </p>
                    </div>
                  </div>

                  <div className="text-sm">
                    <p className="font-medium text-muted-foreground">Proof Document</p>
                    {component.proofUrl ? (
                      <a
                        href={component.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2"
                      >
                        View proof
                      </a>
                    ) : (
                      <p className="text-muted-foreground">No proof uploaded.</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

