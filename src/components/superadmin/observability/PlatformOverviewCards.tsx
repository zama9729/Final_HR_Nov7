import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface OverviewData {
  tenants: {
    total_tenants: number;
    active_tenants: number;
    inactive_tenants: number;
    basic_tenants: number;
    premium_tenants: number;
    enterprise_tenants: number;
  };
  at_risk: {
    count: number;
  };
  adoption: {
    avg_features_per_tenant: number;
  };
  activity: {
    active_recently: number;
  };
}

interface PlatformOverviewCardsProps {
  data?: OverviewData;
  isLoading?: boolean;
}

export function PlatformOverviewCards({ data, isLoading }: PlatformOverviewCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const activePercent = data.tenants.total_tenants > 0
    ? Math.round((data.tenants.active_tenants / data.tenants.total_tenants) * 100)
    : 0;

  const atRiskPercent = data.tenants.total_tenants > 0
    ? Math.round((data.at_risk.count / data.tenants.total_tenants) * 100)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.tenants.total_tenants}</div>
          <p className="text-xs text-muted-foreground">
            {data.tenants.active_tenants} active ({activePercent}%)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">At-Risk Tenants</CardTitle>
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">{data.at_risk.count}</div>
          <p className="text-xs text-muted-foreground">
            {atRiskPercent}% of total tenants
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Feature Adoption</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {data.adoption.avg_features_per_tenant.toFixed(1)}
          </div>
          <p className="text-xs text-muted-foreground">
            Features per tenant (30d)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{data.activity.active_recently}</div>
          <p className="text-xs text-muted-foreground">
            Active in last 7 days
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

