import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { TenantList } from '@/components/superadmin/TenantList';
import { FeatureMatrixView } from '@/components/superadmin/FeatureMatrixView';
import { AuditLogsView } from '@/components/superadmin/AuditLogsView';
import { SuperAdminStats } from '@/components/superadmin/SuperAdminStats';
import { SuperAdminDebug } from '@/components/superadmin/SuperAdminDebug';
import { PlatformOverviewCards } from '@/components/superadmin/observability/PlatformOverviewCards';
import { TenantHealthTable } from '@/components/superadmin/observability/TenantHealthTable';
import { TenantMetricsView } from '@/components/superadmin/observability/TenantMetricsView';
import { FeatureUsageHeatmap } from '@/components/superadmin/observability/FeatureUsageHeatmap';
import { Shield, Users, Settings, FileText, Activity } from 'lucide-react';

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [observabilityTenantId, setObservabilityTenantId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['superadmin', 'stats'],
    queryFn: () => api.getSuperAdminStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: observabilityOverview, isLoading: observabilityLoading } = useQuery({
    queryKey: ['observability', 'overview'],
    queryFn: () => api.getObservabilityOverview(),
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-600" />
              Super Admin Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage tenants, features, and monitor platform activity
            </p>
          </div>
        </div>

        {/* Debug Info */}
        <SuperAdminDebug />
        
        {/* Stats Cards */}
        {!statsLoading && stats && (
          <SuperAdminStats stats={stats} />
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="tenants" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tenants" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Tenants
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Feature Matrix
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="observability" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Observability
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="space-y-4">
            <TenantList 
              onTenantSelect={setSelectedTenantId}
              selectedTenantId={selectedTenantId}
            />
          </TabsContent>

          <TabsContent value="features" className="space-y-4">
            <FeatureMatrixView />
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <AuditLogsView />
          </TabsContent>

          <TabsContent value="observability" className="space-y-6">
            {/* Overview Cards */}
            <PlatformOverviewCards 
              data={observabilityOverview} 
              isLoading={observabilityLoading} 
            />

            {/* Tenant Health Table */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Tenant Health & Risk</h2>
              <TenantHealthTable 
                onTenantSelect={(id) => setObservabilityTenantId(id)} 
              />
            </div>

            {/* Detailed Tenant Metrics */}
            {observabilityTenantId && (
              <div className="space-y-6 mt-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Tenant Details</h2>
                  <button
                    onClick={() => setObservabilityTenantId(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <TenantMetricsView tenantId={observabilityTenantId} />
                  </div>
                  <div className="md:col-span-2">
                    <FeatureUsageHeatmap tenantId={observabilityTenantId} />
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
