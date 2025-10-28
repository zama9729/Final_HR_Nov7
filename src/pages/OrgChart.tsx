import { AppLayout } from "@/components/layout/AppLayout";
import EnhancedOrgChart from "@/components/org-chart/EnhancedOrgChart";
import { Card } from "@/components/ui/card";

export default function OrgChartPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Chart</h1>
          <p className="text-muted-foreground">Interactive view of your organization's reporting structure</p>
        </div>

        <Card className="border-2">
          <EnhancedOrgChart />
        </Card>
      </div>
    </AppLayout>
  );
}
