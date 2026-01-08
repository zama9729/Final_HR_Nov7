import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface FeatureUsageHeatmapProps {
  tenantId: string;
}

export function FeatureUsageHeatmap({ tenantId }: FeatureUsageHeatmapProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['observability', 'tenant-feature-usage', tenantId],
    queryFn: () => api.getTenantFeatureUsage(tenantId),
    enabled: !!tenantId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const features = data?.features || [];

  // Sort by 30-day usage
  const sortedFeatures = [...features].sort((a, b) => 
    (b.usage_count_30d || 0) - (a.usage_count_30d || 0)
  );

  const getUsageIntensity = (count: number) => {
    if (count === 0) return { label: 'None', color: 'bg-gray-100 text-gray-600' };
    if (count < 10) return { label: 'Low', color: 'bg-yellow-100 text-yellow-700' };
    if (count < 50) return { label: 'Medium', color: 'bg-orange-100 text-orange-700' };
    if (count < 100) return { label: 'High', color: 'bg-green-100 text-green-700' };
    return { label: 'Very High', color: 'bg-blue-100 text-blue-700' };
  };

  const formatFeatureName = (key: string) => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Feature Usage Heatmap</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Feature adoption and usage intensity (last 30 days)
        </p>
      </CardHeader>
      <CardContent>
        {sortedFeatures.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No feature usage data available
          </div>
        ) : (
          <div className="space-y-2">
            {sortedFeatures.map((feature: any) => {
              const intensity30d = getUsageIntensity(feature.usage_count_30d || 0);
              const intensity7d = getUsageIntensity(feature.usage_count_7d || 0);
              
              return (
                <div
                  key={feature.feature_key}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatFeatureName(feature.feature_key)}</span>
                      <Badge variant="outline" className={intensity30d.color}>
                        {intensity30d.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Last used: {feature.last_used_at 
                        ? new Date(feature.last_used_at).toLocaleDateString()
                        : 'Never'}
                    </div>
                  </div>
                  
                  <div className="flex gap-4 text-sm">
                    <div className="text-right">
                      <div className="font-medium">{feature.usage_count_30d || 0}</div>
                      <div className="text-xs text-muted-foreground">30d</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{feature.usage_count_7d || 0}</div>
                      <div className="text-xs text-muted-foreground">7d</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{feature.usage_count || 0}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

