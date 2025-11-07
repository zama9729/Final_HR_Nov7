import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Users, X, Calendar, MapPin, ArrowLeftRight, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  Dialog as AlertDialog,
  DialogContent as AlertDialogContent,
  DialogHeader as AlertDialogHeader,
  DialogTitle as AlertDialogTitle,
  DialogFooter as AlertDialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Assignment {
  assignment_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  role: string | null;
  allocation_percent: number;
  start_date: string;
  end_date: string | null;
  override: boolean;
  override_reason: string | null;
  department: string | null;
  position: string | null;
  state: string | null;
  work_mode: string | null;
}

interface ViewAssignedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onUpdate?: () => void;
}

export default function ViewAssignedModal({
  open,
  onOpenChange,
  projectId,
  projectName,
  onUpdate,
}: ViewAssignedModalProps) {
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deallocateDialogOpen, setDeallocateDialogOpen] = useState(false);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [replaceForm, setReplaceForm] = useState({
    new_employee_id: '',
    allocation_percent: 50,
    role: '',
    start_date: '',
    end_date: '',
    reason: '',
  });

  useEffect(() => {
    if (open) {
      fetchAssignments();
      fetchEmployees();
    }
  }, [open, projectId]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const data = await api.getProjectAssignments(projectId);
      setAssignments(data || []);
    } catch (error: any) {
      console.error('Error fetching assignments:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch assignments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  const handleDeallocate = async () => {
    if (!selectedAssignment) return;

    try {
      // Set end_date to yesterday to ensure it doesn't show in active assignments
      const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      await api.deallocateAssignment(
        projectId,
        selectedAssignment.assignment_id,
        yesterday
      );

      toast({
        title: 'Success',
        description: 'Assignment deallocated successfully',
      });

      setDeallocateDialogOpen(false);
      setSelectedAssignment(null);
      fetchAssignments();
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deallocate assignment',
        variant: 'destructive',
      });
    }
  };

  const handleReplace = async () => {
    if (!selectedAssignment || !replaceForm.new_employee_id) return;

    try {
      await api.replaceAssignment(projectId, {
        old_assignment_id: selectedAssignment.assignment_id,
        new_employee_id: replaceForm.new_employee_id,
        allocation_percent: replaceForm.allocation_percent,
        role: replaceForm.role || undefined,
        start_date: replaceForm.start_date || undefined,
        end_date: replaceForm.end_date || undefined,
        reason: replaceForm.reason || undefined,
      });

      toast({
        title: 'Success',
        description: 'Assignment replaced successfully',
      });

      setReplaceDialogOpen(false);
      setSelectedAssignment(null);
      setReplaceForm({
        new_employee_id: '',
        allocation_percent: 50,
        role: '',
        start_date: '',
        end_date: '',
        reason: '',
      });
      fetchAssignments();
      onUpdate?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to replace assignment',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assigned Employees - {projectName}</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No employees assigned to this project yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <div
                  key={assignment.assignment_id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{assignment.employee_name}</h4>
                        {assignment.override && (
                          <Badge variant="outline" className="text-xs">
                            Override
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{assignment.employee_email}</p>
                      {assignment.department && assignment.position && (
                        <p className="text-xs text-muted-foreground">
                          {assignment.position} - {assignment.department}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {assignment.allocation_percent}% allocated
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {assignment.role && (
                      <div>
                        <span className="text-muted-foreground">Role: </span>
                        <span>{assignment.role}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Period: </span>
                      <span>
                        {format(new Date(assignment.start_date), 'MMM dd, yyyy')}
                        {assignment.end_date
                          ? ` - ${format(new Date(assignment.end_date), 'MMM dd, yyyy')}`
                          : ' - Ongoing'}
                      </span>
                    </div>
                  </div>

                  {assignment.override_reason && (
                    <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                      Override reason: {assignment.override_reason}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAssignment(assignment);
                        setReplaceDialogOpen(true);
                      }}
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Replace
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedAssignment(assignment);
                        setDeallocateDialogOpen(true);
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Deallocate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deallocate Dialog */}
      <AlertDialog open={deallocateDialogOpen} onOpenChange={setDeallocateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deallocate Assignment</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to deallocate {selectedAssignment?.employee_name} from this project?
            This will end their assignment effective today.
          </p>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeallocateDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeallocate}>
              Deallocate
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace Dialog */}
      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Assignment</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Employee</Label>
              <Input
                value={selectedAssignment?.employee_name || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label htmlFor="replace-employee">New Employee *</Label>
              <Select
                value={replaceForm.new_employee_id}
                onValueChange={(value) => setReplaceForm({ ...replaceForm, new_employee_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((emp) => emp.id !== selectedAssignment?.employee_id)
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.profiles?.email})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="replace-allocation">Allocation % *</Label>
                <Input
                  id="replace-allocation"
                  type="number"
                  min="0"
                  max="100"
                  value={replaceForm.allocation_percent}
                  onChange={(e) =>
                    setReplaceForm({ ...replaceForm, allocation_percent: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="replace-role">Role</Label>
                <Input
                  id="replace-role"
                  value={replaceForm.role}
                  onChange={(e) => setReplaceForm({ ...replaceForm, role: e.target.value })}
                  placeholder="e.g., Developer, Lead"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="replace-start-date">Start Date</Label>
                <Input
                  id="replace-start-date"
                  type="date"
                  value={replaceForm.start_date}
                  onChange={(e) => setReplaceForm({ ...replaceForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="replace-end-date">End Date</Label>
                <Input
                  id="replace-end-date"
                  type="date"
                  value={replaceForm.end_date}
                  onChange={(e) => setReplaceForm({ ...replaceForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="replace-reason">Reason (Optional)</Label>
              <Input
                id="replace-reason"
                value={replaceForm.reason}
                onChange={(e) => setReplaceForm({ ...replaceForm, reason: e.target.value })}
                placeholder="Reason for replacement"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setReplaceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReplace} disabled={!replaceForm.new_employee_id}>
              Replace
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

