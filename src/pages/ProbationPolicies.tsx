import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, CheckCircle2, XCircle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ProbationPolicy {
  id: string;
  name: string;
  probation_days: number;
  allowed_leave_days: number;
  requires_mid_probation_review: boolean;
  auto_confirm_at_end: boolean;
  probation_notice_days: number;
  is_active: boolean;
  status: 'draft' | 'published' | 'archived';
  published_at?: string;
  published_by_profile?: {
    first_name?: string;
    last_name?: string;
  };
  created_at: string;
  updated_at: string;
}

export default function ProbationPolicies() {
  const [policies, setPolicies] = useState<ProbationPolicy[]>([]);
  const [open, setOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ProbationPolicy | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { userRole } = useAuth();
  
  const [formData, setFormData] = useState({
    name: "",
    probation_days: 90,
    allowed_leave_days: 0,
    requires_mid_probation_review: false,
    auto_confirm_at_end: false,
    probation_notice_days: 0,
    status: 'draft' as 'draft' | 'published',
  });

  const canEdit = ['hr', 'ceo', 'admin'].includes(userRole || '');

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const data = await api.listProbationPolicies();
      setPolicies(data?.policies || []);
    } catch (error: any) {
      console.error("Error fetching policies:", error);
      toast({
        title: "Error",
        description: "Failed to load probation policies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.probation_days) {
      toast({
        title: "Validation Error",
        description: "Name and probation days are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (editingPolicy) {
        await api.updateProbationPolicy(editingPolicy.id, formData);
        toast({
          title: "Policy updated",
          description: "Probation policy has been updated successfully",
        });
      } else {
        await api.createProbationPolicy(formData);
        toast({
          title: "Policy created",
          description: "Probation policy has been created successfully",
        });
      }
      setOpen(false);
      setEditingPolicy(null);
      resetForm();
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save policy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (policy: ProbationPolicy) => {
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      probation_days: policy.probation_days,
      allowed_leave_days: policy.allowed_leave_days,
      requires_mid_probation_review: policy.requires_mid_probation_review,
      auto_confirm_at_end: policy.auto_confirm_at_end,
      probation_notice_days: policy.probation_notice_days,
      status: policy.status,
    });
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this policy?")) {
      return;
    }

    try {
      await api.deleteProbationPolicy(id);
      toast({
        title: "Policy deleted",
        description: "Probation policy has been deleted",
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

  const handlePublish = async (policy: ProbationPolicy) => {
    if (!confirm("Publishing this policy will automatically create probation records for all eligible employees. Continue?")) {
      return;
    }

    try {
      await api.updateProbationPolicy(policy.id, { status: 'published' });
      toast({
        title: "Policy published",
        description: "Probation policy has been published and applied to eligible employees",
      });
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to publish policy",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      probation_days: 90,
      allowed_leave_days: 0,
      requires_mid_probation_review: false,
      auto_confirm_at_end: false,
      probation_notice_days: 0,
      status: 'draft',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const activePolicy = policies.find(p => p.status === 'published' && p.is_active);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Probation Policies</h1>
            <p className="text-muted-foreground">
              Define organization-level probation periods and rules
            </p>
          </div>
          {canEdit && (
            <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) {
                setEditingPolicy(null);
                resetForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingPolicy(null);
                  resetForm();
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Policy
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingPolicy ? "Edit Probation Policy" : "Create Probation Policy"}
                  </DialogTitle>
                  <DialogDescription>
                    Define the probation period and rules for your organization
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Policy Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Standard Probation Policy"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="probation_days">Probation Period (Days) *</Label>
                    <Input
                      id="probation_days"
                      type="number"
                      min="1"
                      value={formData.probation_days}
                      onChange={(e) => setFormData({ ...formData, probation_days: parseInt(e.target.value) || 90 })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Standard probation period in days (e.g., 90 days)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="allowed_leave_days">Allowed Leave Days During Probation</Label>
                    <Input
                      id="allowed_leave_days"
                      type="number"
                      min="0"
                      value={formData.allowed_leave_days}
                      onChange={(e) => setFormData({ ...formData, allowed_leave_days: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum leave days allowed during probation period
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="probation_notice_days">Probation Notice Period (Days)</Label>
                    <Input
                      id="probation_notice_days"
                      type="number"
                      min="0"
                      value={formData.probation_notice_days}
                      onChange={(e) => setFormData({ ...formData, probation_notice_days: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Notice period required during probation (0 = no notice required)
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="requires_mid_probation_review"
                      checked={formData.requires_mid_probation_review}
                      onCheckedChange={(checked) => setFormData({ ...formData, requires_mid_probation_review: checked })}
                    />
                    <Label htmlFor="requires_mid_probation_review" className="cursor-pointer">
                      Require Mid-Probation Review
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="auto_confirm_at_end"
                      checked={formData.auto_confirm_at_end}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_confirm_at_end: checked })}
                    />
                    <Label htmlFor="auto_confirm_at_end" className="cursor-pointer">
                      Auto-Confirm at End of Probation
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      (Otherwise requires HR confirmation)
                    </p>
                  </div>

                  {!editingPolicy && (
                    <div className="space-y-2">
                      <Label htmlFor="status">Initial Status</Label>
                      <select
                        id="status"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="published">Publish Immediately</option>
                      </select>
                    </div>
                  )}
                  
                  {editingPolicy && editingPolicy.status !== 'published' && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-medium">Publish Policy</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            Publishing will automatically create probation records for eligible employees
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="default"
                          onClick={async () => {
                            if (!confirm("Publishing this policy will automatically create probation records for all eligible employees. Continue?")) {
                              return;
                            }
                            try {
                              setLoading(true);
                              await api.updateProbationPolicy(editingPolicy.id, { status: 'published' });
                              toast({
                                title: "Policy published",
                                description: "Probation policy has been published and applied to eligible employees",
                              });
                              setOpen(false);
                              setEditingPolicy(null);
                              resetForm();
                              fetchPolicies();
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.message || "Failed to publish policy",
                                variant: "destructive",
                              });
                            } finally {
                              setLoading(false);
                            }
                          }}
                          disabled={loading}
                        >
                          Publish Now
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        setEditingPolicy(null);
                        resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Saving..." : editingPolicy ? "Update" : "Create"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {activePolicy && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Active Policy
              </CardTitle>
              <CardDescription>
                This policy is currently published and applied to all eligible employees
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Policy Name</p>
                  <p className="font-medium">{activePolicy.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Probation Period</p>
                  <p className="font-medium">{activePolicy.probation_days} days</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Published</p>
                  <p className="font-medium">
                    {activePolicy.published_at
                      ? format(new Date(activePolicy.published_at), 'MMM dd, yyyy')
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Published By</p>
                  <p className="font-medium">
                    {activePolicy.published_by_profile
                      ? `${activePolicy.published_by_profile.first_name || ''} ${activePolicy.published_by_profile.last_name || ''}`.trim()
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {loading && policies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading policies...
              </CardContent>
            </Card>
          ) : policies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No probation policies created yet</p>
                <p className="text-sm mt-2">
                  Create your first policy to define probation rules for your organization
                </p>
              </CardContent>
            </Card>
          ) : (
            policies.map((policy) => (
              <Card key={policy.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{policy.name}</CardTitle>
                        {getStatusBadge(policy.status)}
                        {policy.is_active && (
                          <Badge variant="outline">Active</Badge>
                        )}
                      </div>
                      <CardDescription>
                        Created {format(new Date(policy.created_at), 'MMM dd, yyyy')}
                        {policy.published_at && (
                          <> • Published {format(new Date(policy.published_at), 'MMM dd, yyyy')}</>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {canEdit && policy.status !== 'published' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handlePublish(policy)}
                          className="bg-green-600 hover:bg-green-700 text-white font-medium"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Publish Policy
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(policy)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(policy.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {!canEdit && (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Probation Period</p>
                      <p className="font-medium">{policy.probation_days} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Allowed Leave Days</p>
                      <p className="font-medium">{policy.allowed_leave_days} days</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Mid-Review Required</p>
                      <p className="font-medium">
                        {policy.requires_mid_probation_review ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-400 inline" />
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Auto-Confirm</p>
                      <p className="font-medium">
                        {policy.auto_confirm_at_end ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                        ) : (
                          <XCircle className="h-4 w-4 text-gray-400 inline" />
                        )}
                      </p>
                    </div>
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

