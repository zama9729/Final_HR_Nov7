import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { FileText, Download, Search, Calendar, Tag } from 'lucide-react';
import { format } from 'date-fns';

interface Policy {
  id: string;
  code: string;
  title: string;
  short_description?: string;
  category: 'LEAVE' | 'OFFBOARDING' | 'GENERAL';
  version: number;
  effective_from?: string;
  effective_to?: string;
  published_at?: string;
  content_html?: string;
}

export default function PolicyLibrary() {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchPolicies();
    
    // Check if there's a view parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('view');
    if (viewId) {
      // Fetch and show the policy
      api.getMyPolicy(viewId).then((policy) => {
        setSelectedPolicy(policy);
        setDialogOpen(true);
        // Clean up URL
        window.history.replaceState({}, '', '/policies/library');
      }).catch(console.error);
    }
  }, [selectedCategory, searchQuery]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (searchQuery) params.search = searchQuery;
      
      const response = await api.getMyPolicies(params);
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

  const handleViewPolicy = async (policy: Policy) => {
    try {
      const fullPolicy = await api.getMyPolicy(policy.id);
      setSelectedPolicy(fullPolicy);
      setDialogOpen(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch policy details',
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
      console.error('Download error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to download PDF',
        variant: 'destructive',
      });
    }
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      LEAVE: 'bg-blue-100 text-blue-800',
      OFFBOARDING: 'bg-orange-100 text-orange-800',
      GENERAL: 'bg-gray-100 text-gray-800',
    };
    return <Badge className={colors[category] || 'bg-gray-100 text-gray-800'}>{category}</Badge>;
  };

  const isRecentlyUpdated = (publishedAt?: string) => {
    if (!publishedAt) return false;
    const published = new Date(publishedAt);
    const daysAgo = (Date.now() - published.getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 30; // New if published within last 30 days
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Policy Library</h1>
          <p className="text-muted-foreground">Browse and download published policies</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Published Policies</CardTitle>
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : policies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No published policies found
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {policies.map((policy) => (
                  <Card key={policy.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg mb-2">{policy.title}</CardTitle>
                          <div className="flex items-center gap-2 mb-2">
                            {getCategoryBadge(policy.category)}
                            {isRecentlyUpdated(policy.published_at) && (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                New
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {policy.short_description || 'No description available'}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          <span className="font-mono text-xs">{policy.code}</span>
                          <span>•</span>
                          <span>v{policy.version}</span>
                        </div>
                        {policy.effective_from && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>
                              Effective: {format(new Date(policy.effective_from), 'MMM d, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleViewPolicy(policy)}
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadPDF(policy.id, policy.version)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policy Detail Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedPolicy?.title}</DialogTitle>
              <DialogDescription>
                <div className="flex items-center gap-4 mt-2">
                  {selectedPolicy && getCategoryBadge(selectedPolicy.category)}
                  <span className="text-sm">
                    {selectedPolicy?.code} • v{selectedPolicy?.version}
                  </span>
                  {selectedPolicy?.effective_from && (
                    <span className="text-sm">
                      Effective: {format(new Date(selectedPolicy.effective_from), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {selectedPolicy?.short_description && (
                <div>
                  <p className="text-sm text-muted-foreground">{selectedPolicy.short_description}</p>
                </div>
              )}
              <div className="prose max-w-none">
                <div
                  dangerouslySetInnerHTML={{
                    __html: selectedPolicy?.content_html || '<p>No content available</p>',
                  }}
                />
              </div>
              {selectedPolicy?.published_at && (
                <div className="text-sm text-muted-foreground pt-4 border-t">
                  Published: {format(new Date(selectedPolicy.published_at), 'MMMM d, yyyy')}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => selectedPolicy && handleDownloadPDF(selectedPolicy.id, selectedPolicy.version)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

