import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Shield, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ProbationPolicy {
  id?: string;
  name: string;
  probation_days: number;
  allowed_leave_days: number;
  requires_mid_probation_review: boolean;
  auto_confirm_at_end: boolean;
  probation_notice_days: number;
  confirmation_effective_rule: 'on_probation_end' | 'next_working_day';
  notify_employee: boolean;
  notify_manager: boolean;
  notify_hr: boolean;
  allow_extension: boolean;
  max_extension_days: number;
  status?: string;
  is_active?: boolean;
}

export default function OrganizationRules() {
  const { userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<ProbationPolicy | null>(null);
  const [probationDurationType, setProbationDurationType] = useState<'1month' | '3months' | '6months' | 'custom'>('3months');
  const [customDays, setCustomDays] = useState<number>(90);

  const allowedRoles = ['hr', 'ceo'];
  const canAccess = userRole ? allowedRoles.includes(userRole) : false;

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    fetchPolicy();
  }, [canAccess]);

  const fetchPolicy = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/probation-policies/active');
      if (data.policy) {
        setPolicy(data.policy);
        // Set duration type based on days
        const days = data.policy.probation_days;
        if (days === 30) {
          setProbationDurationType('1month');
        } else if (days === 90) {
          setProbationDurationType('3months');
        } else if (days === 180) {
          setProbationDurationType('6months');
        } else {
          setProbationDurationType('custom');
          setCustomDays(days);
        }
      } else {
        // Create default policy
        setPolicy({
          name: 'Default Probation Policy',
          probation_days: 90,
          allowed_leave_days: 0,
          requires_mid_probation_review: false,
          auto_confirm_at_end: false,
          probation_notice_days: 0,
          confirmation_effective_rule: 'on_probation_end',
          notify_employee: true,
          notify_manager: true,
          notify_hr: true,
          allow_extension: false,
          max_extension_days: 0,
        });
      }
    } catch (error: any) {
      console.error('Error fetching policy:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load probation policy',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateProbationDays = () => {
    switch (probationDurationType) {
      case '1month':
        return 30;
      case '3months':
        return 90;
      case '6months':
        return 180;
      case 'custom':
        return customDays;
      default:
        return 90;
    }
  };

  const handleSave = async () => {
    if (!policy) return;

    const probationDays = calculateProbationDays();
    if (probationDays < 1) {
      toast({
        title: 'Validation Error',
        description: 'Probation duration must be at least 1 day',
        variant: 'destructive',
      });
      return;
    }

    if (policy.allow_extension && policy.max_extension_days < 0) {
      toast({
        title: 'Validation Error',
        description: 'Max extension days must be non-negative',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const policyData = {
        ...policy,
        probation_days: probationDays,
        status: policy.status || 'published',
        is_active: true,
      };

      if (policy.id) {
        // Update existing policy
        await api.put(`/api/probation-policies/${policy.id}`, policyData);
        toast({
          title: 'Success',
          description: 'Probation policy updated successfully',
        });
      } else {
        // Create new policy
        const result = await api.post('/api/probation-policies', policyData);
        setPolicy(result.policy);
        toast({
          title: 'Success',
          description: 'Probation policy created successfully',
        });
      }

      await fetchPolicy();
    } catch (error: any) {
      console.error('Error saving policy:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save probation policy',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Access Restricted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Only HR and CEO roles can access Organization Rules settings.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!policy) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Failed to load probation policy. Please refresh the page.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Organization Rules</h1>
          <p className="text-muted-foreground">Configure employment rules and policies for your organization</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Probation Policy</CardTitle>
            <CardDescription>
              Configure probation period settings, auto-confirmation rules, and notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Probation Duration */}
            <div className="space-y-2">
              <Label>Probation Duration</Label>
              <div className="flex gap-4">
                <Select
                  value={probationDurationType}
                  onValueChange={(value: any) => setProbationDurationType(value)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1month">1 Month (30 days)</SelectItem>
                    <SelectItem value="3months">3 Months (90 days)</SelectItem>
                    <SelectItem value="6months">6 Months (180 days)</SelectItem>
                    <SelectItem value="custom">Custom (days)</SelectItem>
                  </SelectContent>
                </Select>
                {probationDurationType === 'custom' && (
                  <Input
                    type="number"
                    min="1"
                    value={customDays}
                    onChange={(e) => setCustomDays(parseInt(e.target.value) || 0)}
                    className="w-[150px]"
                    placeholder="Days"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected duration: {calculateProbationDays()} days
              </p>
            </div>

            {/* Auto-Confirmation */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-Confirmation</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically confirm employee after probation period
                </p>
              </div>
              <Switch
                checked={policy.auto_confirm_at_end}
                onCheckedChange={(checked) =>
                  setPolicy({ ...policy, auto_confirm_at_end: checked })
                }
              />
            </div>

            {/* Confirmation Effective Date Rule */}
            {policy.auto_confirm_at_end && (
              <div className="space-y-2">
                <Label>Confirmation Effective Date</Label>
                <Select
                  value={policy.confirmation_effective_rule}
                  onValueChange={(value: 'on_probation_end' | 'next_working_day') =>
                    setPolicy({ ...policy, confirmation_effective_rule: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_probation_end">On Probation End Date</SelectItem>
                    <SelectItem value="next_working_day">Next Working Day</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {policy.confirmation_effective_rule === 'on_probation_end'
                    ? 'Employee will be confirmed on the exact probation end date'
                    : 'Employee will be confirmed on the next working day (excluding weekends)'}
                </p>
              </div>
            )}

            {/* Notification Options */}
            <div className="space-y-3">
              <Label>Notification Options</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-employee"
                    checked={policy.notify_employee}
                    onCheckedChange={(checked) =>
                      setPolicy({ ...policy, notify_employee: checked as boolean })
                    }
                  />
                  <Label htmlFor="notify-employee" className="font-normal cursor-pointer">
                    Notify Employee
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-manager"
                    checked={policy.notify_manager}
                    onCheckedChange={(checked) =>
                      setPolicy({ ...policy, notify_manager: checked as boolean })
                    }
                  />
                  <Label htmlFor="notify-manager" className="font-normal cursor-pointer">
                    Notify Reporting Manager
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="notify-hr"
                    checked={policy.notify_hr}
                    onCheckedChange={(checked) =>
                      setPolicy({ ...policy, notify_hr: checked as boolean })
                    }
                  />
                  <Label htmlFor="notify-hr" className="font-normal cursor-pointer">
                    Notify HR
                  </Label>
                </div>
              </div>
            </div>

            {/* Extension Rules */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow Probation Extension</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable the ability to extend probation periods
                  </p>
                </div>
                <Switch
                  checked={policy.allow_extension}
                  onCheckedChange={(checked) =>
                    setPolicy({ ...policy, allow_extension: checked })
                  }
                />
              </div>

              {policy.allow_extension && (
                <div className="space-y-2">
                  <Label htmlFor="max-extension">Max Extension Duration (days)</Label>
                  <Input
                    id="max-extension"
                    type="number"
                    min="0"
                    value={policy.max_extension_days}
                    onChange={(e) =>
                      setPolicy({
                        ...policy,
                        max_extension_days: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-[200px]"
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum number of days probation can be extended
                  </p>
                </div>
              )}
            </div>

            {/* Additional Settings */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Mid-Probation Review</Label>
                  <p className="text-xs text-muted-foreground">
                    Require a review at the midpoint of the probation period
                  </p>
                </div>
                <Switch
                  checked={policy.requires_mid_probation_review}
                  onCheckedChange={(checked) =>
                    setPolicy({ ...policy, requires_mid_probation_review: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="allowed-leave">Allowed Leave Days During Probation</Label>
                <Input
                  id="allowed-leave"
                  type="number"
                  min="0"
                  value={policy.allowed_leave_days}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      allowed_leave_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-[200px]"
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notice-days">Probation Notice Days</Label>
                <Input
                  id="notice-days"
                  type="number"
                  min="0"
                  value={policy.probation_notice_days}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      probation_notice_days: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-[200px]"
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Number of days before probation end to send notifications
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-xs text-muted-foreground">
                <p>After saving, run backfill to confirm existing employees who exceeded probation period.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await api.post('/api/probation/backfill');
                      toast({
                        title: 'Backfill Complete',
                        description: `Processed ${result.processed} employees, ${result.skipped} skipped`,
                      });
                    } catch (error: any) {
                      toast({
                        title: 'Error',
                        description: error.message || 'Failed to run backfill',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Run Probation Backfill
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      const result = await api.backfillAnniversaryEvents();
                      toast({
                        title: 'Anniversary Backfill Complete',
                        description: `Created ${result.processed} anniversary events, ${result.skipped} skipped`,
                      });
                    } catch (error: any) {
                      toast({
                        title: 'Error',
                        description: error.message || 'Failed to run anniversary backfill',
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Run Anniversary Backfill
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

