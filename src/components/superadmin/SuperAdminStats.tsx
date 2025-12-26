import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, Activity, CheckCircle } from 'lucide-react';

interface Stats {
  tenants_by_tier: Array<{ tier: string; count: number }>;
  tenants_by_status: Array<{ status: string; count: number }>;
  total_features: number;
  recent_activity_count: number;
}

export function SuperAdminStats({ stats }: { stats: Stats }) {
  const totalTenants = stats.tenants_by_tier.reduce((sum, item) => sum + item.count, 0);
  
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'enterprise': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'premium': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'basic': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-300';
      case 'inactive': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'suspended': return 'bg-red-100 text-red-800 border-red-300';
      case 'trial': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTenants}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {stats.tenants_by_tier.map((item) => (
              <Badge key={item.tier} variant="outline" className={getTierColor(item.tier)}>
                {item.tier}: {item.count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tenant Status</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalTenants}</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {stats.tenants_by_status.map((item) => (
              <Badge key={item.status} variant="outline" className={getStatusColor(item.status)}>
                {item.status}: {item.count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Features</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total_features}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Available platform features
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.recent_activity_count}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Actions in last 7 days
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

