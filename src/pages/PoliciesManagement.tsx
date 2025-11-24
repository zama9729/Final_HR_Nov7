import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPolicy, setEditPolicy] = useState<OrgPolicy | null>(null);
  const [formData, setFormData] = useState({
    policy_key: "",
    value: "",
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: "",
  });

  useEffect(() => {
    fetchCatalog();
    fetchOrgPolicies();
    fetchEmployees();
  }, []);

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

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Policies Management</h1>
          <p className="text-muted-foreground">Manage organization and employee policies</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="org">Organization Policies</TabsTrigger>
            <TabsTrigger value="employee">Employee Overrides</TabsTrigger>
          </TabsList>

          <TabsContent value="org" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Organization Policies</CardTitle>
                    <CardDescription>Policies that apply to all employees</CardDescription>
                  </div>
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Policy
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {Object.entries(policiesByCategory(orgPolicies)).map(([category, categoryPolicies]) => (
                  <div key={category} className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">{category}</h3>
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
                          <TableRow key={policy.id}>
                            <TableCell className="font-medium">{policy.display_name}</TableCell>
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
                              {policy.effective_to ? new Date(policy.effective_to).toLocaleDateString() : 'Indefinite'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(policy as OrgPolicy)}
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
                      <p className="text-muted-foreground text-center py-8">No overrides for this employee.</p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-8">Select an employee to view their policy overrides.</p>
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

