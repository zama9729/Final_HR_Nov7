import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Plus, Edit, Trash2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Policy {
  id: string;
  name: string;
  description?: string;
  notice_period_days: number;
  auto_approve_days: number;
  use_ceo_approval: boolean;
  applies_to_department?: string;
  applies_to_location?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export default function OffboardingPolicies() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    notice_period_days: 30,
    auto_approve_days: 7,
    use_ceo_approval: true,
    applies_to_department: '',
    applies_to_location: '',
    is_default: false,
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const data = await api.getOffboardingPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load policies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (!form.name || !form.notice_period_days) {
        toast({
          title: "Validation Error",
          description: "Name and notice period days are required",
          variant: "destructive",
        });
        return;
      }

      await api.createOffboardingPolicy({
        name: form.name,
        description: form.description || undefined,
        notice_period_days: form.notice_period_days,
        auto_approve_days: form.auto_approve_days,
        use_ceo_approval: form.use_ceo_approval,
        applies_to_department: form.applies_to_department || undefined,
        applies_to_location: form.applies_to_location || undefined,
        is_default: form.is_default,
      });

      toast({
        title: "Success",
        description: "Policy created successfully",
      });
      setDialogOpen(false);
      resetForm();
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create policy",
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingPolicy) return;

    try {
      await api.updateOffboardingPolicy(editingPolicy.id, form);
      toast({
        title: "Success",
        description: "Policy updated successfully",
      });
      setDialogOpen(false);
      setEditingPolicy(null);
      resetForm();
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update policy",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this policy?')) return;

    try {
      await api.deleteOffboardingPolicy(id);
      toast({
        title: "Success",
        description: "Policy deleted successfully",
      });
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete policy",
        variant: "destructive",
      });
    }
  };

  const openEdit = (policy: Policy) => {
    setEditingPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description || '',
      notice_period_days: policy.notice_period_days,
      auto_approve_days: policy.auto_approve_days,
      use_ceo_approval: policy.use_ceo_approval,
      applies_to_department: policy.applies_to_department || '',
      applies_to_location: policy.applies_to_location || '',
      is_default: policy.is_default,
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      notice_period_days: 30,
      auto_approve_days: 7,
      use_ceo_approval: true,
      applies_to_department: '',
      applies_to_location: '',
      is_default: false,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Offboarding Policies</h1>
            <p className="text-muted-foreground">Manage notice periods and auto-approval settings</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingPolicy(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPolicy ? 'Edit Policy' : 'Create Policy'}</DialogTitle>
                <DialogDescription>
                  {editingPolicy ? 'Update offboarding policy settings' : 'Create a new offboarding policy'}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Policy Name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Default India HQ Policy"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Policy description..."
                    rows={3}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="notice_period_days">Notice Period (Days) *</Label>
                    <Input
                      id="notice_period_days"
                      type="number"
                      value={form.notice_period_days}
                      onChange={(e) => setForm({ ...form, notice_period_days: parseInt(e.target.value) || 30 })}
                      min={1}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="auto_approve_days">Auto-Approve After (Days)</Label>
                    <Input
                      id="auto_approve_days"
                      type="number"
                      value={form.auto_approve_days}
                      onChange={(e) => setForm({ ...form, auto_approve_days: parseInt(e.target.value) || 7 })}
                      min={1}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="applies_to_department">Department (Optional)</Label>
                    <Input
                      id="applies_to_department"
                      value={form.applies_to_department}
                      onChange={(e) => setForm({ ...form, applies_to_department: e.target.value })}
                      placeholder="Leave empty for all departments"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="applies_to_location">Location (Optional)</Label>
                    <Input
                      id="applies_to_location"
                      value={form.applies_to_location}
                      onChange={(e) => setForm({ ...form, applies_to_location: e.target.value })}
                      placeholder="Leave empty for all locations"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="use_ceo_approval"
                      checked={form.use_ceo_approval}
                      onChange={(e) => setForm({ ...form, use_ceo_approval: e.target.checked })}
                    />
                    <Label htmlFor="use_ceo_approval">Require CEO Approval</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_default"
                      checked={form.is_default}
                      onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                    />
                    <Label htmlFor="is_default">Set as Default Policy</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setDialogOpen(false);
                  setEditingPolicy(null);
                  resetForm();
                }}>
                  Cancel
                </Button>
                <Button onClick={editingPolicy ? handleUpdate : handleCreate}>
                  {editingPolicy ? 'Update' : 'Create'} Policy
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Policies</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : policies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No policies found. Create your first policy.
              </div>
            ) : (
              <div className="space-y-4">
                {policies.map((policy) => (
                  <div key={policy.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 hover-lift transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{policy.name}</h3>
                        {policy.is_default && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                            Default
                          </Badge>
                        )}
                      </div>
                      {policy.description && (
                        <p className="text-sm text-muted-foreground mb-2">{policy.description}</p>
                      )}
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p><span className="font-medium">Notice Period:</span> {policy.notice_period_days} days</p>
                        <p><span className="font-medium">Auto-Approve:</span> {policy.auto_approve_days} days</p>
                        <p><span className="font-medium">CEO Approval:</span> {policy.use_ceo_approval ? 'Required' : 'Not Required'}</p>
                        {policy.applies_to_department && (
                          <p><span className="font-medium">Department:</span> {policy.applies_to_department}</p>
                        )}
                        {policy.applies_to_location && (
                          <p><span className="font-medium">Location:</span> {policy.applies_to_location}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(policy)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(policy.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

