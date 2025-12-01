import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Edit, Eye, Download, Archive, FileText, History, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { DynamicPolicyForm } from '@/components/policies/DynamicPolicyForm';
import { policyTemplates, getTemplatesByCategory, getTemplateById, PolicyTemplate } from '@/constants/policyTemplates';

interface Policy {
  id: string;
  code: string;
  title: string;
  short_description?: string;
  category: 'LEAVE' | 'OFFBOARDING' | 'GENERAL';
  status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  effective_from?: string;
  effective_to?: string;
  published_at?: string;
  created_at: string;
  created_by_name?: string;
  published_by_name?: string;
}

export default function UnifiedPolicyManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isHrUser = user?.role && ['hr', 'director', 'ceo', 'admin'].includes(user.role);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<Policy | null>(null);
  const [versionsDialogOpen, setVersionsDialogOpen] = useState(false);
  const [policyVersions, setPolicyVersions] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<PolicyTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    category: 'GENERAL' as 'LEAVE' | 'OFFBOARDING' | 'GENERAL',
    title: '',
    short_description: '',
    content_html: '',
    content_markdown: '',
    effective_from: '',
    effective_to: '',
  });
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [changelogText, setChangelogText] = useState('');

  useEffect(() => {
    fetchPolicies();
  }, [selectedCategory, selectedStatus, searchQuery]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (searchQuery) params.search = searchQuery;
      
      const response = await api.getUnifiedPolicies(params);
      setPolicies(response.policies || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch policies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPolicy(null);
    setSelectedTemplateId('');
    setSelectedTemplate(null);
    setFormValues({});
    setFormErrors({});
    setFormData({
      category: 'GENERAL',
      title: '',
      short_description: '',
      content_html: '',
      content_markdown: '',
      effective_from: '',
      effective_to: '',
    });
    setDialogOpen(true);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = getTemplateById(templateId);
    setSelectedTemplate(template);
    if (template) {
      setFormData(prev => ({
        ...prev,
        category: template.category,
        title: template.title,
      }));
      // Reset form values when template changes
      setFormValues({});
    }
  };

  const handleFormValuesChange = (values: Record<string, any>) => {
    setFormValues(values);
    // Generate HTML from template if available
    if (selectedTemplate && selectedTemplate.generateHTML) {
      const html = selectedTemplate.generateHTML(values);
      setFormData(prev => ({
        ...prev,
        content_html: html,
        content_markdown: html, // Can be improved with markdown conversion
      }));
    }
  };

  const handleEdit = async (policy: Policy) => {
    setEditingPolicy(policy);
    setSelectedTemplateId(''); // Will need to detect template from policy
    setSelectedTemplate(null);
    setFormValues({});
    setFormData({
      category: policy.category,
      title: policy.title,
      short_description: policy.short_description || '',
      content_html: '',
      content_markdown: '',
      effective_from: policy.effective_from || '',
      effective_to: policy.effective_to || '',
    });
    
    // Fetch full policy details
    try {
      const fullPolicy: any = await api.getUnifiedPolicy(policy.id);
      setFormData(prev => ({
        ...prev,
        content_html: fullPolicy.content_html || '',
        content_markdown: fullPolicy.content_markdown || '',
      }));
      
      // Try to find matching template by title
      const matchingTemplate = policyTemplates.find(t => 
        t.title.toLowerCase() === policy.title.toLowerCase() || 
        t.category === policy.category
      );
      if (matchingTemplate) {
        setSelectedTemplateId(matchingTemplate.id);
        setSelectedTemplate(matchingTemplate);
      }
    } catch (error) {
      console.error('Error fetching policy:', error);
    }
    
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Validate required fields
    const errors: Record<string, string> = {};
    
    if (!selectedTemplate && !editingPolicy) {
      toast({
        title: 'Validation Error',
        description: 'Please select a policy template',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.title) {
      errors.title = 'Title is required';
    }

    if (selectedTemplate) {
      // Validate template fields
      selectedTemplate.fields.forEach(field => {
        if (field.required) {
          const value = formValues[field.key];
          if (value === undefined || value === null || value === '') {
            errors[field.key] = `${field.label} is required`;
          }
        }
      });
    }

    if (!formData.content_html && !selectedTemplate) {
      errors.content = 'Content is required';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    // Generate HTML if template is selected and HTML not set
    if (selectedTemplate && selectedTemplate.generateHTML && !formData.content_html) {
      const html = selectedTemplate.generateHTML(formValues);
      setFormData(prev => ({ ...prev, content_html: html }));
    }

    try {
      if (editingPolicy) {
        await api.updateUnifiedPolicy(editingPolicy.id, formData);
        toast({
          title: 'Success',
          description: 'Policy updated successfully',
        });
      } else {
        await api.createUnifiedPolicy(formData);
        toast({
          title: 'Success',
          description: 'Policy created successfully',
        });
      }
      setDialogOpen(false);
      setFormErrors({});
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save policy',
        variant: 'destructive',
      });
    }
  };

  const handlePublish = async () => {
    if (!editingPolicy) return;
    
    try {
      await api.publishUnifiedPolicy(editingPolicy.id, changelogText);
      toast({
        title: 'Success',
        description: 'Policy published successfully',
      });
      setPublishDialogOpen(false);
      setChangelogText('');
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to publish policy',
        variant: 'destructive',
      });
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this policy?')) return;
    
    try {
      await api.archiveUnifiedPolicy(id);
      toast({
        title: 'Success',
        description: 'Policy archived successfully',
      });
      fetchPolicies();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive policy',
        variant: 'destructive',
      });
    }
  };

  const handleViewVersions = async (policy: Policy) => {
    try {
      const response = await api.getUnifiedPolicyVersions(policy.id);
      setPolicyVersions(response.versions || []);
      setViewingPolicy(policy);
      setVersionsDialogOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch versions',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadPDF = async (policyId: string, version: number) => {
    try {
      await api.downloadUnifiedPolicyPDF(policyId, version);
      toast({
        title: 'Success',
        description: 'PDF download started',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download PDF',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      DRAFT: 'outline',
      PENDING_REVIEW: 'secondary',
      PUBLISHED: 'default',
      ARCHIVED: 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      LEAVE: 'bg-blue-100 text-blue-800',
      OFFBOARDING: 'bg-orange-100 text-orange-800',
      GENERAL: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[category] || 'bg-gray-100 text-gray-800'}>{category}</Badge>;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Policy Management</h1>
            <p className="text-muted-foreground">Create and manage organization policies</p>
          </div>
          {isHrUser && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Policy
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Policies</CardTitle>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search policies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="LEAVE">Leave</SelectItem>
                    <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
                    <SelectItem value="GENERAL">General</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                    <SelectItem value="PUBLISHED">Published</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No policies found
                      </TableCell>
                    </TableRow>
                  ) : (
                    policies.map((policy) => (
                      <TableRow key={policy.id}>
                        <TableCell className="font-mono text-sm">{policy.code}</TableCell>
                        <TableCell className="font-medium">{policy.title}</TableCell>
                        <TableCell>{getCategoryBadge(policy.category)}</TableCell>
                        <TableCell>{getStatusBadge(policy.status)}</TableCell>
                        <TableCell>v{policy.version}</TableCell>
                        <TableCell>
                          {policy.effective_from ? format(new Date(policy.effective_from), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(policy.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewVersions(policy)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {/* View button - available for all published policies */}
                            {policy.status === 'PUBLISHED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const fullPolicy = await api.getMyPolicy(policy.id);
                                    // Create a view dialog or navigate to library
                                    // For now, open in library page
                                    window.location.href = `/policies/library?view=${policy.id}`;
                                  } catch (error: any) {
                                    toast({
                                      title: 'Error',
                                      description: error.message || 'Failed to load policy',
                                      variant: 'destructive',
                                    });
                                  }
                                }}
                                title="View Policy"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Download button - available for all published policies */}
                            {policy.status === 'PUBLISHED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadPDF(policy.id, policy.version)}
                                title="Download PDF"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Edit and Publish buttons - only for HR users */}
                            {isHrUser && policy.status !== 'ARCHIVED' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(policy)}
                                  title="Edit Policy"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {policy.status === 'DRAFT' && (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setEditingPolicy(policy);
                                      setPublishDialogOpen(true);
                                    }}
                                    title="Publish Policy"
                                  >
                                    <FileText className="h-4 w-4 mr-1" />
                                    Publish
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleArchive(policy.id)}
                                  title="Archive Policy"
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPolicy ? 'Edit Policy' : 'Create Policy'}</DialogTitle>
              <DialogDescription>
                {editingPolicy ? 'Update policy details and content' : 'Select a policy template and fill in the details'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {!editingPolicy && (
                <div>
                  <Label>Policy Template *</Label>
                  <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a policy template" />
                    </SelectTrigger>
                    <SelectContent>
                      {getTemplatesByCategory('LEAVE').map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          [Leave] {template.title}
                        </SelectItem>
                      ))}
                      {getTemplatesByCategory('OFFBOARDING').map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          [Offboarding] {template.title}
                        </SelectItem>
                      ))}
                      {getTemplatesByCategory('GENERAL').map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          [General] {template.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.template && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.template}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                    disabled={!!selectedTemplate}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEAVE">Leave</SelectItem>
                      <SelectItem value="OFFBOARDING">Offboarding</SelectItem>
                      <SelectItem value="GENERAL">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Effective From</Label>
                  <Input
                    type="date"
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Policy title"
                  className={formErrors.title ? 'border-red-500' : ''}
                />
                {formErrors.title && (
                  <p className="text-xs text-red-500 mt-1">{formErrors.title}</p>
                )}
              </div>

              <div>
                <Label>Short Description</Label>
                <Input
                  value={formData.short_description}
                  onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>

              {/* Dynamic Form Fields */}
              {selectedTemplate && (
                <DynamicPolicyForm
                  template={selectedTemplate}
                  values={formValues}
                  onChange={handleFormValuesChange}
                  errors={formErrors}
                />
              )}

              {/* Fallback to manual HTML input if no template or editing */}
              {(!selectedTemplate || editingPolicy) && (
                <div>
                  <Label>Content (HTML) *</Label>
                  <Textarea
                    value={formData.content_html}
                    onChange={(e) => setFormData({ ...formData, content_html: e.target.value })}
                    placeholder="Policy content in HTML format"
                    rows={15}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {editingPolicy ? 'Edit the policy content directly' : 'Or select a template above to use a form-based editor'}
                  </p>
                </div>
              )}

              <div>
                <Label>Effective To (Optional)</Label>
                <Input
                  type="date"
                  value={formData.effective_to}
                  onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingPolicy ? 'Update' : 'Create'} Policy
              </Button>
              {isHrUser && editingPolicy && editingPolicy.status === 'DRAFT' && (
                <Button
                  onClick={() => {
                    setPublishDialogOpen(true);
                  }}
                  variant="default"
                >
                  Publish
                </Button>
              )}
              {isHrUser && !editingPolicy && selectedTemplate && (
                <Button
                  onClick={async () => {
                    // Save first
                    await handleSave();
                    // Note: After save, the dialog closes. User can publish from the list.
                  }}
                  variant="default"
                >
                  Create & Publish
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Publish Dialog */}
        <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish Policy</DialogTitle>
              <DialogDescription>
                Add a changelog note for this version (optional)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Changelog</Label>
                <Textarea
                  value={changelogText}
                  onChange={(e) => setChangelogText(e.target.value)}
                  placeholder="What changed in this version?"
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handlePublish}>Publish</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Versions Dialog */}
        <Dialog open={versionsDialogOpen} onOpenChange={setVersionsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Version History: {viewingPolicy?.title}</DialogTitle>
              <DialogDescription>
                View and download previous versions of this policy
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Published By</TableHead>
                    <TableHead>Changelog</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policyVersions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell className="font-mono">v{version.version}</TableCell>
                      <TableCell>
                        {format(new Date(version.published_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell>{version.published_by_name || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {version.changelog_text || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadPDF(viewingPolicy!.id, version.version)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

