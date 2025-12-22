import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Edit, ShieldCheck, Filter, Search, Trash2, CheckCircle2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface PolicyCatalog {
  id: string;
  key: string;
  display_name: string;
  category: string;
  description?: string;
  value_type: string;
}

interface OrgPolicy {
  id: string;
  org_id: string;
  policy_key: string;
  display_name: string;
  category: string;
  description?: string;
  value_type: string;
  value: any;
  effective_from: string;
  effective_to?: string;
  status?: 'draft' | 'active' | 'retired';
}

interface EmployeePolicy {
  id: string;
  user_id: string;
  policy_key: string;
  display_name: string;
  category: string;
  value: any;
  effective_from: string;
  effective_to?: string;
}

export default function PoliciesManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<PolicyCatalog[]>([]);
  const [orgPolicies, setOrgPolicies] = useState<OrgPolicy[]>([]);
  const [employeePolicies, setEmployeePolicies] = useState<EmployeePolicy[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("org");
  const [libraryPolicies, setLibraryPolicies] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<OrgPolicy | null>(null);
  const [formData, setFormData] = useState({
    policy_key: "",
    value: "",
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: "",
  });
  const [search, setSearch] = useState("");
  const [publishedProbationPolicy, setPublishedProbationPolicy] = useState<any>(null);

  useEffect(() => {
    fetchCatalog();
    fetchOrgPolicies();
    fetchEmployees();
    fetchLibraryPolicies();
    fetchPublishedProbationPolicy();
  }, []);

  const fetchPublishedProbationPolicy = async () => {
    try {
      const data = await api.getActiveProbationPolicy();
      setPublishedProbationPolicy(data?.policy || null);
    } catch (error) {
      // Ignore errors - probation policy might not exist yet
      setPublishedProbationPolicy(null);
    }
  };

  useEffect(() => {
    if (selectedEmployee) {
      fetchEmployeePolicies(selectedEmployee);
    }
  }, [selectedEmployee]);

  const fetchCatalog = async () => {
    try {
      const data = await api.getPolicyCatalog();
      setCatalog(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch policy catalog",
        variant: "destructive",
      });
    }
  };

  const fetchLibraryPolicies = async () => {
    try {
      const data = await api.getManagedPolicies({});
      // API returns an array; older shape was { policies: [] } so support both
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.policies)
          ? (data as any).policies
          : [];
      setLibraryPolicies(list);
    } catch (error: any) {
      console.error("Error fetching rich policies:", error);
    }
  };

  const fetchOrgPolicies = async () => {
    try {
      const data = await api.getOrgPolicies();
      setOrgPolicies(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch org policies",
        variant: "destructive",
      });
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchEmployeePolicies = async (userId: string) => {
    try {
      const data = await api.getEmployeePolicies(userId);
      setEmployeePolicies(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch employee policies",
        variant: "destructive",
      });
    }
  };

  const handleOpenDialog = (policy?: OrgPolicy) => {
    if (policy) {
      setEditPolicy(policy);
      setFormData({
        policy_key: policy.policy_key,
        value: typeof policy.value === 'string' ? policy.value : JSON.stringify(policy.value, null, 2),
        effective_from: policy.effective_from,
        effective_to: policy.effective_to || "",
      });
    } else {
      setEditPolicy(null);
      setFormData({
        policy_key: "",
        value: "",
        effective_from: new Date().toISOString().split('T')[0],
        effective_to: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let parsedValue: any;
      const selectedCatalogItem = catalog.find(c => c.key === formData.policy_key);
      
      if (selectedCatalogItem?.value_type === 'JSON') {
        parsedValue = JSON.parse(formData.value);
      } else if (selectedCatalogItem?.value_type === 'NUMBER') {
        parsedValue = parseFloat(formData.value);
      } else if (selectedCatalogItem?.value_type === 'BOOLEAN') {
        parsedValue = formData.value === 'true';
      } else {
        parsedValue = formData.value;
      }

      if (activeTab === 'org') {
        await api.createOrgPolicy({
          policy_key: formData.policy_key,
          value: parsedValue,
          effective_from: formData.effective_from,
          effective_to: formData.effective_to || undefined,
        });
        toast({
          title: "Success",
          description: "Organization policy created/updated successfully",
        });
      } else if (selectedEmployee) {
        await api.createEmployeePolicy(selectedEmployee, {
          policy_key: formData.policy_key,
          value: parsedValue,
          effective_from: formData.effective_from,
          effective_to: formData.effective_to || undefined,
        });
        toast({
          title: "Success",
          description: "Employee policy override created/updated successfully",
        });
      }

      setDialogOpen(false);
      fetchOrgPolicies();
      if (selectedEmployee) {
        fetchEmployeePolicies(selectedEmployee);
      }
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

  const policiesByCategory = (policies: OrgPolicy[] | EmployeePolicy[]) => {
    return policies.reduce((acc, policy) => {
      if (!acc[policy.category]) acc[policy.category] = [];
      acc[policy.category].push(policy);
      return acc;
    }, {} as Record<string, (OrgPolicy | EmployeePolicy)[]>);
  };

  const filteredOrgPolicies = useMemo(() => {
    if (!search.trim()) return orgPolicies;
    const term = search.toLowerCase();
    return orgPolicies.filter((p) =>
      (p.display_name || "").toLowerCase().includes(term) ||
      (p.category || "").toLowerCase().includes(term) ||
      (p.policy_key || "").toLowerCase().includes(term)
    );
  }, [orgPolicies, search]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-slate-50 shadow-sm">
              <ShieldCheck className="h-3 w-3 text-emerald-300" />
              Policy Management
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Policies</h1>
            <p className="text-sm text-muted-foreground">
              Configure organization-wide rules and fine-tune employee overrides.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search policies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-100 dark:bg-slate-900/40 flex flex-wrap">
            <TabsTrigger value="org">Organization Policies</TabsTrigger>
            <TabsTrigger value="employee">Employee Overrides</TabsTrigger>
            <TabsTrigger value="library">Policy Library</TabsTrigger>
          </TabsList>

          <TabsContent value="org" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Organization Policies</CardTitle>
                    <CardDescription>
                      Define default rules for leave, working hours, benefits, and more.
                    </CardDescription>
                  </div>
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Policy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {Object.entries(policiesByCategory(filteredOrgPolicies)).map(([category, categoryPolicies]) => (
                  <div key={category} className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        {category}
                        <Badge variant="outline" className="text-xs">
                          {categoryPolicies.length} policy
                          {categoryPolicies.length !== 1 ? "ies" : ""}
                        </Badge>
                      </h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Policy</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Effective From</TableHead>
                          <TableHead>Effective To</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryPolicies.map((policy) => (
                          <TableRow key={policy.id} className="align-top">
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-0.5">
                                <span>{policy.display_name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {policy.policy_key}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {policy.value_type === 'JSON' ? (
                                <pre className="text-xs bg-muted p-2 rounded max-w-xs overflow-auto">
                                  {JSON.stringify(policy.value, null, 2)}
                                </pre>
                              ) : (
                                String(policy.value)
                              )}
                            </TableCell>
                            <TableCell>{new Date(policy.effective_from).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {policy.effective_to ? (
                                <span>{new Date(policy.effective_to).toLocaleDateString()}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Indefinite</span>
                              )}
                            </TableCell>
                            <TableCell className="space-x-1">
                              {(() => {
                                const isProbationPolicy = policy.policy_key?.toLowerCase().includes('probation') || 
                                                         policy.display_name?.toLowerCase().includes('probation');
                                const isPublished = isProbationPolicy && publishedProbationPolicy && 
                                                   publishedProbationPolicy.probation_days === (typeof policy.value === 'number' ? policy.value : parseInt(policy.value) || 90);
                                
                                if (isPublished) {
                                  return (
                                    <>
                                      <Badge className="bg-green-500 text-white mr-1">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Published
                                      </Badge>
                                      <Button
                                        variant="default"
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 text-white mr-1"
                                        onClick={async () => {
                                          try {
                                            setLoading(true);
                                            const blob = await api.downloadOrgPolicyPDF(policy.id);
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `policy-${policy.policy_key || policy.id}.pdf`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            document.body.removeChild(a);
                                            toast({
                                              title: "Download started",
                                              description: "Policy PDF is downloading",
                                            });
                                          } catch (error: any) {
                                            toast({
                                              title: "Download failed",
                                              description: error.message || "Failed to download policy PDF",
                                              variant: "destructive",
                                            });
                                          } finally {
                                            setLoading(false);
                                          }
                                        }}
                                        disabled={loading}
                                      >
                                        <Download className="h-3 w-3 mr-1" />
                                        Download PDF
                                      </Button>
                                    </>
                                  );
                                }
                                
                                return (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white mr-1"
                                    onClick={async () => {
                                    if (isProbationPolicy) {
                                      if (!confirm("Publishing this probation policy will create/update the probation policy system and apply it to eligible employees. Continue?")) {
                                        return;
                                      }
                                      try {
                                        setLoading(true);
                                        // Get or create active probation policy
                                        const activePolicy = await api.getActiveProbationPolicy();
                                        const probationDays = typeof policy.value === 'number' ? policy.value : parseInt(policy.value) || 90;
                                        
                                        if (activePolicy?.policy) {
                                          // Update existing
                                          await api.updateProbationPolicy(activePolicy.policy.id, {
                                            name: policy.display_name || 'Probation Policy',
                                            probation_days: probationDays,
                                            status: 'published'
                                          });
                                        } else {
                                          // Create new
                                          await api.createProbationPolicy({
                                            name: policy.display_name || 'Probation Policy',
                                            probation_days: probationDays,
                                            status: 'published'
                                          });
                                        }
                                        
                                        toast({
                                          title: "Policy published",
                                          description: "Probation policy has been published and applied to eligible employees",
                                        });
                                        await fetchPublishedProbationPolicy();
                                        fetchOrgPolicies();
                                      } catch (err: any) {
                                        toast({
                                          title: "Error",
                                          description: err?.message || "Failed to publish probation policy",
                                          variant: "destructive",
                                        });
                                      } finally {
                                        setLoading(false);
                                      }
                                    } else {
                                      // For non-probation policies, just show success (they're effective immediately)
                                      toast({
                                        title: "Policy active",
                                        description: "This policy is now effective from the specified date",
                                      });
                                    }
                                  }}
                                  disabled={loading}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Publish
                                </Button>
                                );
                              })()}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(policy as OrgPolicy)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600"
                                onClick={async () => {
                                  if (!confirm("Delete this policy? This cannot be undone.")) {
                                    return;
                                  }
                                  try {
                                    setLoading(true);
                                    await api.deleteOrgPolicy(policy.id);
                                    toast({
                                      title: "Deleted",
                                      description: "Organization policy deleted.",
                                    });
                                    fetchOrgPolicies();
                                  } catch (err: any) {
                                    toast({
                                      title: "Error",
                                      description: err?.message || "Failed to delete policy",
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
                {orgPolicies.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No organization policies configured yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employee" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Employee Policy Overrides</CardTitle>
                    <CardDescription>Override organization policies for specific employees</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((emp) => (
                          <SelectItem key={emp.id} value={emp.user_id}>
                            {emp.first_name} {emp.last_name} ({emp.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedEmployee && (
                      <Button onClick={() => handleOpenDialog()} disabled={!selectedEmployee}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Override
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedEmployee ? (
                  <>
                    {Object.entries(policiesByCategory(employeePolicies)).map(([category, categoryPolicies]) => (
                      <div key={category} className="mb-6">
                        <h3 className="text-lg font-semibold mb-3">{category}</h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Policy</TableHead>
                              <TableHead>Override Value</TableHead>
                              <TableHead>Effective From</TableHead>
                              <TableHead>Effective To</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {categoryPolicies.map((policy) => (
                              <TableRow key={policy.id}>
                                <TableCell className="font-medium">{policy.display_name}</TableCell>
                                <TableCell>
                                  {typeof policy.value === 'object' ? (
                                    <pre className="text-xs bg-muted p-2 rounded max-w-xs overflow-auto">
                                      {JSON.stringify(policy.value, null, 2)}
                                    </pre>
                                  ) : (
                                    String(policy.value)
                                  )}
                                </TableCell>
                                <TableCell>{new Date(policy.effective_from).toLocaleDateString()}</TableCell>
                                <TableCell>
                                  {policy.effective_to ? new Date(policy.effective_to).toLocaleDateString() : 'Indefinite'}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenDialog(policy as any)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                    {employeePolicies.length === 0 && (
                      <p className="text-muted-foreground text-center py-8">
                        No overrides for this employee.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Select an employee to view their policy overrides.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* New document-style Policy Library */}
          <TabsContent value="library" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Policy Library</CardTitle>
                    <CardDescription>
                      Rich, versioned policy documents with PDF export.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => (window.location.href = "/policies/editor/new")}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Document Policy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {libraryPolicies.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">
                    No document-style policies created yet. Use{" "}
                    <span className="font-semibold">New Document Policy</span> to add one.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Effective From</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {libraryPolicies.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{p.title}</span>
                              <span className="text-xs text-muted-foreground">{p.key}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={p.status === "published" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell>v{p.version}</TableCell>
                          <TableCell>
                            {p.effective_from
                              ? new Date(p.effective_from).toLocaleDateString()
                              : "-"}
                          </TableCell>
                          <TableCell className="space-x-2">
                            {p.status !== "published" && (
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={async () => {
                                  if (!confirm("Publish this policy? It will be made available to all employees.")) {
                                    return;
                                  }
                                  try {
                                    setLoading(true);
                                    await api.publishManagedPolicy(p.id);
                                    toast({
                                      title: "Policy published",
                                      description: "Policy has been published successfully",
                                    });
                                    fetchLibraryPolicies();
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
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Publish
                              </Button>
                            )}
                            {(p.status === "published" || p.status === "PUBLISHED") && (
                              <Button
                                variant="default"
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={async () => {
                                  try {
                                    setLoading(true);
                                    const blob = await api.downloadPolicyPDF(p.id);
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `policy-${p.key || p.id}-v${p.version || 'latest'}.pdf`;
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                    toast({
                                      title: "Download started",
                                      description: "Policy PDF is downloading",
                                    });
                                  } catch (error: any) {
                                    toast({
                                      title: "Download failed",
                                      description: error.message || "Failed to download policy PDF",
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                disabled={loading}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Download PDF
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                (window.location.href = `/policies/editor/${p.id}`)
                              }
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editPolicy ? 'Edit Policy' : 'Add Policy'}
              </DialogTitle>
              <DialogDescription>
                {activeTab === 'org' 
                  ? 'Create or update an organization policy'
                  : 'Create or update an employee policy override'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="policy_key">Policy *</Label>
                <Select
                  value={formData.policy_key}
                  onValueChange={(value) => setFormData({ ...formData, policy_key: value })}
                  required
                >
                  <SelectTrigger id="policy_key">
                    <SelectValue placeholder="Select a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.display_name} ({item.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.policy_key && (
                <>
                  {(() => {
                    const selectedCatalogItem = catalog.find(c => c.key === formData.policy_key);
                    return (
                      <>
                        {selectedCatalogItem?.description && (
                          <p className="text-sm text-muted-foreground">
                            {selectedCatalogItem.description}
                          </p>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="value">
                            Value ({selectedCatalogItem?.value_type}) *
                          </Label>
                          {(() => {
                            const key = selectedCatalogItem?.key || '';
                            const getExample = () => {
                              if (key.includes('probation')) return '90';
                              if (key.includes('leave') && key.includes('annual')) return '12';
                              if (key.includes('leave') && key.includes('sick')) return '10';
                              if (key.includes('leave') && key.includes('maternity')) return '26';
                              if (key.includes('leave') && key.includes('paternity')) return '5';
                              if (key.includes('overtime')) return '1.5';
                              if (key.includes('wfh') && key.includes('days')) return '10';
                              if (key.includes('start') || key.includes('end')) return '09:00';
                              return '';
                            };
                            
                            return selectedCatalogItem?.value_type === 'JSON' ? (
                              <>
                                <Textarea
                                  id="value"
                                  value={formData.value}
                                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                  placeholder='{"key": "value"}'
                                  rows={6}
                                  required
                                />
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground font-medium">
                                    Enter valid JSON. Examples:
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    • For leave policies: {`{"annual_leave_days": 12, "sick_leave_days": 10}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    • For working hours: {`{"start_time": "09:00", "end_time": "18:00"}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    • For arrays: {`["Monday", "Tuesday", "Wednesday"]`}
                                  </p>
                                </div>
                              </>
                            ) : selectedCatalogItem?.value_type === 'BOOLEAN' ? (
                              <>
                                <Select
                                  value={formData.value}
                                  onValueChange={(value) => setFormData({ ...formData, value })}
                                  required
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select value" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">True (Enabled)</SelectItem>
                                    <SelectItem value="false">False (Disabled)</SelectItem>
                                  </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                  Select <strong>True</strong> to enable this policy, <strong>False</strong> to disable it
                                </p>
                              </>
                            ) : selectedCatalogItem?.value_type === 'NUMBER' ? (
                              <>
                                <Input
                                  id="value"
                                  type="number"
                                  value={formData.value}
                                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                  placeholder={getExample() || "Enter a number"}
                                  required
                                />
                                <div className="space-y-1">
                                  {key.includes('days') && (
                                    <p className="text-xs text-muted-foreground">
                                      💡 Enter number of days. Example: <strong>30</strong> for 30 days
                                    </p>
                                  )}
                                  {key.includes('percent') && (
                                    <p className="text-xs text-muted-foreground">
                                      💡 Enter percentage. Example: <strong>50</strong> for 50%
                                    </p>
                                  )}
                                  {key.includes('overtime') && (
                                    <p className="text-xs text-muted-foreground">
                                      💡 Enter multiplier. Example: <strong>1.5</strong> for 1.5x rate
                                    </p>
                                  )}
                                  {key.includes('weeks') && (
                                    <p className="text-xs text-muted-foreground">
                                      💡 Enter number of weeks. Example: <strong>26</strong> for 26 weeks
                                    </p>
                                  )}
                                  {!key.includes('days') && !key.includes('percent') && !key.includes('overtime') && !key.includes('weeks') && (
                                    <p className="text-xs text-muted-foreground">
                                      💡 Enter a numeric value. Example: <strong>{getExample() || '0'}</strong>
                                    </p>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <Input
                                  id="value"
                                  type="text"
                                  value={formData.value}
                                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                  placeholder={getExample() || "Enter text value"}
                                  required
                                />
                                <p className="text-xs text-muted-foreground">
                                  💡 Enter a text value. Example: <strong>{getExample() || '"Monthly"'}</strong>
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="effective_from">Effective From *</Label>
                  <Input
                    id="effective_from"
                    type="date"
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effective_to">Effective To (Optional)</Label>
                  <Input
                    id="effective_to"
                    type="date"
                    value={formData.effective_to}
                    onChange={(e) => setFormData({ ...formData, effective_to: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editPolicy ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

