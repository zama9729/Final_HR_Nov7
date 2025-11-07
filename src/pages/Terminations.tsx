import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Plus, UserX, UserCheck, Edit, Trash2, CheckCircle, XCircle, MoreVertical } from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Termination {
  id: string;
  employee_id: string;
  termination_date: string;
  termination_type: string;
  reason?: string;
  notes?: string;
  approval_status: string;
  created_at: string;
  employee?: {
    id: string;
    employee_id: string;
    department: string;
  };
  employee_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  initiated_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
  };
  approved_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface Rehire {
  id: string;
  original_employee_id?: string;
  new_employee_id: string;
  rehire_date: string;
  reason?: string;
  previous_termination_id?: string;
  created_at: string;
  new_employee?: {
    id: string;
    employee_id: string;
  };
  initiated_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface Employee {
  id: string;
  employee_id: string;
  department?: string;
  position?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export default function Terminations() {
  const { toast } = useToast();
  const [terminations, setTerminations] = useState<Termination[]>([]);
  const [rehires, setRehires] = useState<Rehire[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Termination dialog state
  const [terminationDialogOpen, setTerminationDialogOpen] = useState(false);
  const [terminationForm, setTerminationForm] = useState({
    employee_id: '',
    termination_date: '',
    termination_type: 'voluntary',
    reason: '',
    notes: '',
  });
  const [editingTermination, setEditingTermination] = useState<Termination | null>(null);

  // Rehire dialog state
  const [rehireDialogOpen, setRehireDialogOpen] = useState(false);
  const [rehireForm, setRehireForm] = useState({
    original_employee_id: '',
    new_employee_id: '',
    rehire_date: '',
    reason: '',
    previous_termination_id: '',
  });
  const [editingRehire, setEditingRehire] = useState<Rehire | null>(null);

  useEffect(() => {
    fetchTerminations();
    fetchRehires();
    fetchEmployees();
  }, []);

  const fetchTerminations = async () => {
    try {
      setLoading(true);
      const data = await api.getTerminations();
      setTerminations(data || []);
    } catch (error: any) {
      console.error('Error fetching terminations:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load terminations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRehires = async () => {
    try {
      const data = await api.getRehires();
      setRehires(data || []);
    } catch (error: any) {
      console.error('Error fetching rehires:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to load rehires",
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

  const handleCreateTermination = async () => {
    try {
      if (!terminationForm.employee_id || !terminationForm.termination_date || !terminationForm.termination_type) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      await api.createTermination(terminationForm);
      toast({
        title: "Success",
        description: "Termination created successfully",
      });
      setTerminationDialogOpen(false);
      setTerminationForm({
        employee_id: '',
        termination_date: '',
        termination_type: 'voluntary',
        reason: '',
        notes: '',
      });
      fetchTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create termination",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTermination = async () => {
    if (!editingTermination) return;
    try {
      await api.updateTermination(editingTermination.id, {
        termination_date: terminationForm.termination_date,
        termination_type: terminationForm.termination_type,
        reason: terminationForm.reason,
        notes: terminationForm.notes,
      });
      toast({
        title: "Success",
        description: "Termination updated successfully",
      });
      setTerminationDialogOpen(false);
      setEditingTermination(null);
      setTerminationForm({
        employee_id: '',
        termination_date: '',
        termination_type: 'voluntary',
        reason: '',
        notes: '',
      });
      fetchTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update termination",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTermination = async (id: string) => {
    if (!confirm('Are you sure you want to delete this termination?')) return;
    try {
      await api.deleteTermination(id);
      toast({
        title: "Success",
        description: "Termination deleted successfully",
      });
      fetchTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete termination",
        variant: "destructive",
      });
    }
  };

  const handleApproveTermination = async (id: string) => {
    try {
      await api.approveTermination(id);
      toast({
        title: "Success",
        description: "Termination approved successfully",
      });
      fetchTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve termination",
        variant: "destructive",
      });
    }
  };

  const handleCreateRehire = async () => {
    try {
      if (!rehireForm.new_employee_id || !rehireForm.rehire_date) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      await api.createRehire(rehireForm);
      toast({
        title: "Success",
        description: "Rehire created successfully",
      });
      setRehireDialogOpen(false);
      setRehireForm({
        original_employee_id: '',
        new_employee_id: '',
        rehire_date: '',
        reason: '',
        previous_termination_id: '',
      });
      fetchRehires();
      fetchTerminations(); // Refresh to show updated status
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create rehire",
        variant: "destructive",
      });
    }
  };

  const handleUpdateRehire = async () => {
    if (!editingRehire) return;
    try {
      await api.updateRehire(editingRehire.id, {
        rehire_date: rehireForm.rehire_date,
        reason: rehireForm.reason,
      });
      toast({
        title: "Success",
        description: "Rehire updated successfully",
      });
      setRehireDialogOpen(false);
      setEditingRehire(null);
      setRehireForm({
        original_employee_id: '',
        new_employee_id: '',
        rehire_date: '',
        reason: '',
        previous_termination_id: '',
      });
      fetchRehires();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update rehire",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRehire = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rehire?')) return;
    try {
      await api.deleteRehire(id);
      toast({
        title: "Success",
        description: "Rehire deleted successfully",
      });
      fetchRehires();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete rehire",
        variant: "destructive",
      });
    }
  };

  const openEditTermination = (termination: Termination) => {
    setEditingTermination(termination);
    setTerminationForm({
      employee_id: termination.employee_id,
      termination_date: termination.termination_date,
      termination_type: termination.termination_type,
      reason: termination.reason || '',
      notes: termination.notes || '',
    });
    setTerminationDialogOpen(true);
  };

  const openEditRehire = (rehire: Rehire) => {
    setEditingRehire(rehire);
    setRehireForm({
      original_employee_id: rehire.original_employee_id || '',
      new_employee_id: rehire.new_employee_id,
      rehire_date: rehire.rehire_date,
      reason: rehire.reason || '',
      previous_termination_id: rehire.previous_termination_id || '',
    });
    setRehireDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getTerminationTypeLabel = (type: string) => {
    switch (type) {
      case 'voluntary': return 'Voluntary';
      case 'involuntary': return 'Involuntary';
      case 'end_of_contract': return 'End of Contract';
      case 'redundancy': return 'Redundancy';
      default: return type;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Terminations & Rehires</h1>
            <p className="text-muted-foreground">Manage employee terminations and rehires</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={rehireDialogOpen} onOpenChange={setRehireDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserCheck className="mr-2 h-4 w-4" />
                  New Rehire
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingRehire ? 'Edit Rehire' : 'Create Rehire'}</DialogTitle>
                  <DialogDescription>
                    {editingRehire ? 'Update rehire information' : 'Create a new rehire record for an employee'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new_employee_id">Employee *</Label>
                    <Select
                      value={rehireForm.new_employee_id}
                      onValueChange={(value) => setRehireForm({ ...rehireForm, new_employee_id: value })}
                      disabled={!!editingRehire}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees
                          .filter(emp => !emp.status || emp.status === 'active' || emp.status === 'terminated')
                          .map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.employee_id})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rehire_date">Rehire Date *</Label>
                    <Input
                      id="rehire_date"
                      type="date"
                      value={rehireForm.rehire_date}
                      onChange={(e) => setRehireForm({ ...rehireForm, rehire_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      value={rehireForm.reason}
                      onChange={(e) => setRehireForm({ ...rehireForm, reason: e.target.value })}
                      placeholder="Enter reason for rehire..."
                      rows={3}
                    />
                  </div>
                  {terminations.length > 0 && (
                    <div className="grid gap-2">
                      <Label htmlFor="previous_termination_id">Previous Termination (Optional)</Label>
                      <Select
                        value={rehireForm.previous_termination_id}
                        onValueChange={(value) => setRehireForm({ ...rehireForm, previous_termination_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select previous termination" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {terminations.map((term) => (
                            <SelectItem key={term.id} value={term.id}>
                              {term.employee_profile?.first_name} {term.employee_profile?.last_name} - {format(new Date(term.termination_date), 'MMM d, yyyy')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setRehireDialogOpen(false);
                    setEditingRehire(null);
                    setRehireForm({
                      original_employee_id: '',
                      new_employee_id: '',
                      rehire_date: '',
                      reason: '',
                      previous_termination_id: '',
                    });
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={editingRehire ? handleUpdateRehire : handleCreateRehire}>
                    {editingRehire ? 'Update' : 'Create'} Rehire
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={terminationDialogOpen} onOpenChange={setTerminationDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Termination
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingTermination ? 'Edit Termination' : 'Create Termination'}</DialogTitle>
                  <DialogDescription>
                    {editingTermination ? 'Update termination information' : 'Initiate a new employee termination'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="employee_id">Employee *</Label>
                    <Select
                      value={terminationForm.employee_id}
                      onValueChange={(value) => setTerminationForm({ ...terminationForm, employee_id: value })}
                      disabled={!!editingTermination}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees
                          .filter(emp => !emp.status || emp.status === 'active')
                          .map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.employee_id}) - {emp.department || 'N/A'}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="termination_date">Termination Date *</Label>
                    <Input
                      id="termination_date"
                      type="date"
                      value={terminationForm.termination_date}
                      onChange={(e) => setTerminationForm({ ...terminationForm, termination_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="termination_type">Termination Type *</Label>
                    <Select
                      value={terminationForm.termination_type}
                      onValueChange={(value) => setTerminationForm({ ...terminationForm, termination_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="voluntary">Voluntary</SelectItem>
                        <SelectItem value="involuntary">Involuntary</SelectItem>
                        <SelectItem value="end_of_contract">End of Contract</SelectItem>
                        <SelectItem value="redundancy">Redundancy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea
                      id="reason"
                      value={terminationForm.reason}
                      onChange={(e) => setTerminationForm({ ...terminationForm, reason: e.target.value })}
                      placeholder="Enter reason for termination..."
                      rows={3}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={terminationForm.notes}
                      onChange={(e) => setTerminationForm({ ...terminationForm, notes: e.target.value })}
                      placeholder="Additional notes..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => {
                    setTerminationDialogOpen(false);
                    setEditingTermination(null);
                    setTerminationForm({
                      employee_id: '',
                      termination_date: '',
                      termination_type: 'voluntary',
                      reason: '',
                      notes: '',
                    });
                  }}>
                    Cancel
                  </Button>
                  <Button onClick={editingTermination ? handleUpdateTermination : handleCreateTermination}>
                    {editingTermination ? 'Update' : 'Create'} Termination
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="terminations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="terminations">
              <UserX className="mr-2 h-4 w-4" />
              Terminations
            </TabsTrigger>
            <TabsTrigger value="rehires">
              <UserCheck className="mr-2 h-4 w-4" />
              Rehires
            </TabsTrigger>
          </TabsList>

          <TabsContent value="terminations">
            <Card>
              <CardHeader>
                <CardTitle>Terminations</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : terminations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No terminations found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {terminations.map((term) => (
                      <div key={term.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">
                              {term.employee_profile?.first_name} {term.employee_profile?.last_name}
                            </h3>
                            <Badge className={getStatusColor(term.approval_status)}>
                              {term.approval_status}
                            </Badge>
                            <Badge variant="outline">{getTerminationTypeLabel(term.termination_type)}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              <span className="font-medium">Termination Date:</span> {format(new Date(term.termination_date), 'MMM d, yyyy')}
                            </p>
                            {term.employee?.department && (
                              <p><span className="font-medium">Department:</span> {term.employee.department}</p>
                            )}
                            {term.reason && (
                              <p><span className="font-medium">Reason:</span> {term.reason}</p>
                            )}
                            {term.initiated_by_user && (
                              <p><span className="font-medium">Initiated by:</span> {term.initiated_by_user.first_name} {term.initiated_by_user.last_name}</p>
                            )}
                            {term.approved_by_user && (
                              <p><span className="font-medium">Approved by:</span> {term.approved_by_user.first_name} {term.approved_by_user.last_name}</p>
                            )}
                            <p><span className="font-medium">Created:</span> {format(new Date(term.created_at), 'MMM d, yyyy HH:mm')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {term.approval_status === 'pending' && (
                            <Button size="sm" onClick={() => handleApproveTermination(term.id)}>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditTermination(term)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteTermination(term.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rehires">
            <Card>
              <CardHeader>
                <CardTitle>Rehires</CardTitle>
              </CardHeader>
              <CardContent>
                {rehires.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No rehires found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {rehires.map((rehire) => (
                      <div key={rehire.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">
                              Employee ID: {rehire.new_employee?.employee_id || 'N/A'}
                            </h3>
                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                              Rehired
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              <span className="font-medium">Rehire Date:</span> {format(new Date(rehire.rehire_date), 'MMM d, yyyy')}
                            </p>
                            {rehire.reason && (
                              <p><span className="font-medium">Reason:</span> {rehire.reason}</p>
                            )}
                            {rehire.initiated_by_user && (
                              <p><span className="font-medium">Initiated by:</span> {rehire.initiated_by_user.first_name} {rehire.initiated_by_user.last_name}</p>
                            )}
                            <p><span className="font-medium">Created:</span> {format(new Date(rehire.created_at), 'MMM d, yyyy HH:mm')}</p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditRehire(rehire)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteRehire(rehire.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
