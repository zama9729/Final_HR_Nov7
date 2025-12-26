import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FeatureManager } from './FeatureManager';
import { Building2, Users, Briefcase, Settings } from 'lucide-react';
import { format } from 'date-fns';

interface TenantDetailsModalProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenantDetailsModal({ tenantId, open, onOpenChange }: TenantDetailsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin', 'tenants', tenantId],
    queryFn: () => api.getSuperAdminTenantDetails(tenantId),
    enabled: open && !!tenantId,
  });

  const tenant = data?.tenant;
  const features = data?.features || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {isLoading ? <Skeleton className="h-6 w-48" /> : tenant?.name || 'Tenant Details'}
          </DialogTitle>
          <DialogDescription>
            Manage tenant settings, features, and view usage statistics
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : tenant ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="features">
                <Settings className="h-4 w-4 mr-1" />
                Features
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <p className="text-sm font-medium">{tenant.name}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Domain</label>
                  <p className="text-sm">{tenant.domain}</p>
                </div>
                {tenant.subdomain && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Subdomain</label>
                    <p className="text-sm">{tenant.subdomain}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tier</label>
                  <Badge
                    className={
                      tenant.tier === 'enterprise'
                        ? 'bg-purple-100 text-purple-800'
                        : tenant.tier === 'premium'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }
                  >
                    {tenant.tier}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Badge
                    className={
                      tenant.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : tenant.status === 'suspended'
                        ? 'bg-red-100 text-red-800'
                        : tenant.status === 'trial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }
                  >
                    {tenant.status}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <p className="text-sm">
                    {format(new Date(tenant.created_at), 'MMM dd, yyyy HH:mm')}
                  </p>
                </div>
                {tenant.last_active_at && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Last Active</label>
                    <p className="text-sm">
                      {format(new Date(tenant.last_active_at), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{tenant.user_count}</p>
                    <p className="text-xs text-muted-foreground">Users</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{tenant.employee_count}</p>
                    <p className="text-xs text-muted-foreground">Employees</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{tenant.enabled_features_count}</p>
                    <p className="text-xs text-muted-foreground">Enabled Features</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="mt-4">
              <FeatureManager tenantId={tenantId} features={features} />
            </TabsContent>
          </Tabs>
        ) : (
          <p className="text-destructive">Failed to load tenant details</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

