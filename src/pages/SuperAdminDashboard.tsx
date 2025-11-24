import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const [mfaCode, setMfaCode] = useState("");
  const [metrics, setMetrics] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const kpiCards = useMemo(() => {
    if (!metrics?.kpis) return [];
    return [
      { label: "Total Orgs", value: metrics.kpis.totalOrgs },
      { label: "Active (30d)", value: metrics.kpis.active30d },
      { label: "New (7d)", value: metrics.kpis.newThisWeek },
      { label: "Churned (90d)", value: metrics.kpis.churned90d },
    ];
  }, [metrics]);

  const loadMetrics = async () => {
    if (!mfaCode) {
      toast({
        title: "MFA required",
        description: "Enter your MFA code to load metrics.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const data = await api.getSuperMetrics(undefined, mfaCode);
      setMetrics(data);
    } catch (error: any) {
      toast({
        title: "Unable to fetch metrics",
        description: error?.message || "Check your MFA code and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    if (!mfaCode) return;
    try {
      const data = await api.exportSuperMetrics(undefined, mfaCode);
      const blob = new Blob([JSON.stringify(data?.rows || [], null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "super-metrics.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error?.message || "Unable to export metrics",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    setMetrics(null);
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <h1 className="text-3xl font-bold">Owner Analytics</h1>
            <p className="text-muted-foreground">Aggregated, privacy-safe metrics across all organizations.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="password"
              placeholder="MFA code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              className="w-40"
            />
            <Button onClick={loadMetrics} disabled={loading}>
              {loading ? "Loading..." : "Load metrics"}
            </Button>
            <Button variant="outline" onClick={exportData} disabled={!metrics}>
              Export snapshot
            </Button>
          </div>
        </div>

        {metrics ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {kpiCards.map((card) => (
                <Card key={card.label}>
                  <CardHeader>
                    <CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">{card.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Org Size Buckets</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(metrics.sizeBuckets || []).map((bucket: any) => (
                    <div key={bucket.bucket} className="flex items-center justify-between text-sm">
                      <span>{bucket.bucket}</span>
                      <span className="font-semibold">{bucket.orgs}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Feature Adoption</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(metrics.featureAdoption?.attendance || {}).map(([mode, value]) => (
                    <div key={mode} className="flex items-center justify-between text-sm">
                      <span>{mode}</span>
                      <span className="font-semibold">{value as string}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span>Branches enabled</span>
                    <span className="font-semibold">{metrics.featureAdoption?.branches}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Payroll active</span>
                    <span className="font-semibold">{metrics.featureAdoption?.payroll}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Signups</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(metrics.signupStream || []).map((row: any, index: number) => (
                  <div key={`${row.date}-${index}`} className="flex items-center justify-between text-sm">
                    <span>{row.date}</span>
                    <span className="text-muted-foreground">
                      {row.plan_tier} · {row.company_size}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Enter your MFA code and load metrics to view the dashboard.
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

