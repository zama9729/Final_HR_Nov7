import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface LeavePolicy {
  id: string;
  name: string;
  leave_type: string;
  annual_entitlement: number;
  probation_entitlement: number;
  carry_forward_allowed: boolean;
  max_carry_forward: number;
  encashment_allowed: boolean;
  is_active: boolean;
}

export default function LeavePolicies() {
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    name: "",
    leave_type: "annual" as const,
    annual_entitlement: 0,
    probation_entitlement: 0,
    carry_forward_allowed: false,
    max_carry_forward: 0,
    encashment_allowed: false,
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const data = await api.getLeavePolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error("Error fetching policies:", error);
      toast({
        title: "Error",
        description: "Failed to load leave policies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    try {
      await api.createLeavePolicy({
        name: formData.name,
        leave_type: formData.leave_type,
        annual_entitlement: formData.annual_entitlement,
        probation_entitlement: formData.probation_entitlement,
        carry_forward_allowed: formData.carry_forward_allowed,
        max_carry_forward: formData.max_carry_forward,
        encashment_allowed: formData.encashment_allowed,
      });

      toast({
        title: "Policy created",
        description: "Leave policy has been created successfully",
      });
      setOpen(false);
      fetchPolicies();
      setFormData({
        name: "",
        leave_type: "annual",
        annual_entitlement: 0,
        probation_entitlement: 0,
        carry_forward_allowed: false,
        max_carry_forward: 0,
        encashment_allowed: false,
      });
    } catch (error: any) {
      console.error("Error creating policy:", error);
      toast({
        title: "Error creating policy",
        description: error.message || "Failed to create policy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leave Policies</h1>
            <p className="text-muted-foreground">Configure leave entitlements and rules</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Leave Policy</DialogTitle>
                <DialogDescription>Define a new leave policy with entitlements and rules</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Policy Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="leave_type">Leave Type *</Label>
                  <Select
                    value={formData.leave_type}
                    onValueChange={(value: any) => setFormData({ ...formData, leave_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                      <SelectItem value="bereavement">Bereavement Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="annual_entitlement">Annual Entitlement (days) *</Label>
                    <Input
                      id="annual_entitlement"
                      type="number"
                      min="0"
                      value={formData.annual_entitlement}
                      onChange={(e) => setFormData({ ...formData, annual_entitlement: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="probation_entitlement">Probation Entitlement (days)</Label>
                    <Input
                      id="probation_entitlement"
                      type="number"
                      min="0"
                      value={formData.probation_entitlement}
                      onChange={(e) => setFormData({ ...formData, probation_entitlement: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="carry_forward">Allow Carry Forward</Label>
                    <Switch
                      id="carry_forward"
                      checked={formData.carry_forward_allowed}
                      onCheckedChange={(checked) => setFormData({ ...formData, carry_forward_allowed: checked })}
                    />
                  </div>

                  {formData.carry_forward_allowed && (
                    <div className="space-y-2">
                      <Label htmlFor="max_carry_forward">Max Carry Forward (days)</Label>
                      <Input
                        id="max_carry_forward"
                        type="number"
                        min="0"
                        value={formData.max_carry_forward}
                        onChange={(e) => setFormData({ ...formData, max_carry_forward: parseInt(e.target.value) })}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <Label htmlFor="encashment">Allow Encashment</Label>
                    <Switch
                      id="encashment"
                      checked={formData.encashment_allowed}
                      onCheckedChange={(checked) => setFormData({ ...formData, encashment_allowed: checked })}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit">Create Policy</Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {policies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No leave policies created yet</p>
                <p className="text-sm mt-2">Create your first leave policy to get started</p>
              </CardContent>
            </Card>
          ) : (
            policies.map((policy) => (
              <Card key={policy.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-xl">{policy.name}</CardTitle>
                        <Badge variant="default">{policy.leave_type}</Badge>
                      </div>
                      <CardDescription>
                        {policy.annual_entitlement} days annual entitlement
                        {policy.probation_entitlement > 0 && ` • ${policy.probation_entitlement} days during probation`}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm">
                    {policy.carry_forward_allowed && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Carry Forward: {policy.max_carry_forward} days</Badge>
                      </div>
                    )}
                    {policy.encashment_allowed && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Encashment Allowed</Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
