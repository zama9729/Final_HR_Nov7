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
import { Shield, Users, Settings, FileText } from 'lucide-react';

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['superadmin', 'stats'],
    queryFn: () => api.getSuperAdminStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
