import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TenantDetailsModal } from '../TenantDetailsModal';

interface Tenant {
  id: string;
  name: string;
  tier: string;
  status: string;
  created_at: string;
  active_flag_count: number;
  max_severity: string | null;
  active_days: number | null;
  total_active_users: number | null;
  error_rate_pct: number | null;
}

interface TenantHealthTableProps {
  onTenantSelect?: (tenantId: string) => void;
}

export function TenantHealthTable({ onTenantSelect }: TenantHealthTableProps) {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('');
  const [healthFilter, setHealthFilter] = useState<string>('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['observability', 'tenants', statusFilter, tierFilter, healthFilter],
    queryFn: () => api.getObservabilityTenants({
      status: statusFilter || undefined,
      tier: tierFilter || undefined,
      health_status: healthFilter || undefined,
    }),
  });

  const getHealthBadge = (tenant: Tenant) => {
    if (tenant.active_flag_count === 0) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Healthy
        </Badge>
      );
    }

    const severity = tenant.max_severity?.toLowerCase() || 'medium';
    
    if (severity === 'critical') {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Critical
        </Badge>
      );
    }
    
    if (severity === 'high') {
      return (
        <Badge variant="destructive" className="bg-orange-500">
          <AlertCircle className="h-3 w-3 mr-1" />
          High Risk
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Warning
      </Badge>
    );
  };

  const getTierBadge = (tier: string) => {
    const colors = {
      basic: 'bg-blue-50 text-blue-700 border-blue-200',
      premium: 'bg-purple-50 text-purple-700 border-purple-200',
      enterprise: 'bg-gold-50 text-gold-700 border-gold-200',
    };
    
    return (
      <Badge variant="outline" className={colors[tier as keyof typeof colors] || ''}>
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  const tenants = data?.tenants || [];

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Tiers</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>

        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Health</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Activity (30d)</TableHead>
              <TableHead>Error Rate</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No tenants found
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((tenant: Tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>{getTierBadge(tenant.tier)}</TableCell>
                  <TableCell>
                    <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'}>
                      {tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{getHealthBadge(tenant)}</TableCell>
                  <TableCell>
                    {tenant.active_flag_count > 0 ? (
                      <span className="text-destructive font-medium">
                        {tenant.active_flag_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{tenant.active_days || 0} days</div>
                      <div className="text-xs text-muted-foreground">
                        {tenant.total_active_users || 0} users
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.error_rate_pct !== null ? (
                      <span className={tenant.error_rate_pct > 5 ? 'text-destructive' : 'text-muted-foreground'}>
                        {tenant.error_rate_pct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTenantId(tenant.id);
                        onTenantSelect?.(tenant.id);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedTenantId && (
        <TenantDetailsModal
          tenantId={selectedTenantId}
          open={!!selectedTenantId}
          onClose={() => setSelectedTenantId(null)}
        />
      )}
    </>
  );
}

