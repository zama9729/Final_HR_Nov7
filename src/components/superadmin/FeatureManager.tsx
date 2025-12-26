import { useState } from 'react';
import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Save, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Feature {
  feature_key: string;
  feature_name: string;
  description?: string;
  enabled: boolean;
  overridden: boolean;
  tier_basic: boolean;
  tier_premium: boolean;
  tier_enterprise: boolean;
  tenant_tier?: string;
}

interface FeatureManagerProps {
  tenantId: string;
  features: Feature[];
}

export function FeatureManager({ tenantId, features: initialFeatures }: FeatureManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [localFeatures, setLocalFeatures] = useState<Feature[]>(initialFeatures);
  const [hasChanges, setHasChanges] = useState(false);

  // Update local state when props change
  React.useEffect(() => {
    setLocalFeatures(initialFeatures);
    setHasChanges(false);
  }, [initialFeatures]);

  const updateMutation = useMutation({
    mutationFn: (features: Array<{ feature_key: string; enabled: boolean }>) =>
      api.updateTenantFeatures(tenantId, features),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tenants'] });
      setHasChanges(false);
      toast({
        title: 'Success',
        description: 'Features updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update features',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (featureKey: string, enabled: boolean) => {
    setLocalFeatures((prev) =>
      prev.map((f) => (f.feature_key === featureKey ? { ...f, enabled, overridden: true } : f))
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    const changes = localFeatures
      .filter((f) => {
        const original = initialFeatures.find((of) => of.feature_key === f.feature_key);
        return original && original.enabled !== f.enabled;
      })
      .map((f) => ({
        feature_key: f.feature_key,
        enabled: f.enabled,
      }));

    if (changes.length === 0) {
      toast({
        title: 'No changes',
        description: 'No features were modified',
      });
      return;
    }

    updateMutation.mutate(changes);
  };

  const handleReset = () => {
    setLocalFeatures(initialFeatures);
    setHasChanges(false);
  };

  const getTierDefault = (feature: Feature) => {
    const tier = feature.tenant_tier || 'basic';
    switch (tier) {
      case 'enterprise':
        return feature.tier_enterprise;
      case 'premium':
        return feature.tier_premium;
      default:
        return feature.tier_basic;
    }
  };

  const filteredFeatures = localFeatures.filter((f) =>
    f.feature_name.toLowerCase().includes(search.toLowerCase()) ||
    f.feature_key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search features..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <Button variant="outline" onClick={handleReset} size="sm">
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
            size="sm"
          >
            <Save className="h-4 w-4 mr-1" />
            Save Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to apply them.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {filteredFeatures.map((feature) => {
          const tierDefault = getTierDefault(feature);
          const isOverride = feature.enabled !== tierDefault;

          return (
            <Card key={feature.feature_key} className={isOverride ? 'border-blue-300' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={feature.feature_key} className="font-medium cursor-pointer">
                        {feature.feature_name}
                      </Label>
                      {feature.overridden && (
                        <Badge variant="outline" className="text-xs">
                          Overridden
                        </Badge>
                      )}
                      {isOverride && (
                        <Badge variant="outline" className="text-xs bg-blue-50">
                          Custom
                        </Badge>
                      )}
                    </div>
                    {feature.description && (
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>
                        Tier Default ({feature.tenant_tier || 'basic'}):{' '}
                        {tierDefault ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  <Switch
                    id={feature.feature_key}
                    checked={feature.enabled}
                    onCheckedChange={(checked) => handleToggle(feature.feature_key, checked)}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredFeatures.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No features found matching your search
        </div>
      )}
    </div>
  );
}

