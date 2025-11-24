import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Download, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function PolicyEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    type: 'doc',
    template_text: '',
    value_json: {} as Record<string, any>,
    status: 'draft',
    effective_from: '',
  });

  useEffect(() => {
    if (id && id !== 'new') {
      fetchPolicy();
    } else {
      setLoading(false);
    }
  }, [id]);

  const fetchPolicy = async () => {
    try {
      const data = await api.request(`/api/policy-management/policies/${id}`);
      setPolicy(data);
      setFormData({
        title: data.title || '',
        type: data.type || 'doc',
        template_text: data.template_text || '',
        value_json: data.value_json || {},
        status: data.status || 'draft',
        effective_from: data.effective_from || '',
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load policy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (id === 'new') {
        await api.request('/api/policy-management/policies', {
          method: 'POST',
          body: JSON.stringify({
            key: formData.title.toLowerCase().replace(/\s+/g, '_'),
            ...formData,
          }),
        });
        toast({ title: "Policy created successfully" });
        navigate('/policies/management');
      } else {
        await api.request(`/api/policy-management/policies/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(formData),
        });
        toast({ title: "Policy updated successfully" });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to save policy",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await api.request(`/api/policy-management/policies/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ change_note: 'Published via UI' }),
      });
      toast({ title: "Policy published successfully" });
      await fetchPolicy();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to publish policy",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    window.open(`/api/policy-management/policies/${id}/download`, '_blank');
  };

  const updateValueJson = (key: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      value_json: { ...prev.value_json, [key]: value },
    }));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/policies/management')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {id === 'new' ? 'Create Policy' : 'Edit Policy'}
              </h1>
              {policy && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={policy.status === 'published' ? 'default' : 'secondary'}>
                    {policy.status}
                  </Badge>
                  {policy.version && <span className="text-sm text-muted-foreground">v{policy.version}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {policy && policy.status === 'published' && (
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            )}
            {policy && policy.status !== 'published' && (
              <Button onClick={handlePublish} disabled={saving}>
                Publish
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Policy Details</CardTitle>
            <CardDescription>Edit policy information and content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Policy Title"
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doc">Document</SelectItem>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === 'doc' && (
              <div>
                <Label htmlFor="template">Template Text</Label>
                <Textarea
                  id="template"
                  value={formData.template_text}
                  onChange={(e) => setFormData(prev => ({ ...prev, template_text: e.target.value }))}
                  placeholder="Use {{variable_name}} for templating"
                  rows={15}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use variables like {{probation_days}} in your template
                </p>
              </div>
            )}

            {formData.type === 'doc' && Object.keys(formData.value_json).length > 0 && (
              <div>
                <Label>Template Variables</Label>
                <div className="space-y-2 mt-2">
                  {Object.entries(formData.value_json).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Input
                        value={key}
                        readOnly
                        className="flex-1"
                        placeholder="Variable name"
                      />
                      <Input
                        value={String(value)}
                        onChange={(e) => updateValueJson(key, e.target.value)}
                        className="flex-1"
                        placeholder="Value"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="effective_from">Effective From</Label>
              <Input
                id="effective_from"
                type="date"
                value={formData.effective_from}
                onChange={(e) => setFormData(prev => ({ ...prev, effective_from: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


