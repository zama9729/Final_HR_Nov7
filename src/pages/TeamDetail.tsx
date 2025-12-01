import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { ArrowLeft, UserPlus, Edit, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TeamMember {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  role: 'MEMBER' | 'MANAGER' | 'LEAD' | 'COORDINATOR';
  is_primary: boolean;
  start_date: string;
  end_date?: string;
  position?: string;
  department?: string;
}

interface Team {
  id: string;
  name: string;
  code: string;
  description?: string;
  team_type: 'FUNCTIONAL' | 'PROJECT';
  owner_manager_name?: string;
  owner_manager_email?: string;
  parent_team_name?: string;
  members: TeamMember[];
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userRole, user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(false);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    employee_id: '',
    role: 'MEMBER' as 'MEMBER' | 'MANAGER' | 'LEAD' | 'COORDINATOR',
    is_primary: false,
    start_date: new Date().toISOString().split('T')[0],
    manual_override: false,
  });

  // Check if user has HR/admin permissions (case-insensitive)
  // Check both userRole from context and user.role as fallback
  const roleToCheck = userRole || user?.role || '';
  const isHrUser = roleToCheck ? ['hr', 'director', 'ceo', 'admin', 'super_user'].includes(roleToCheck.toLowerCase()) : false;
  
  // Debug: Log role check (remove in production)
  useEffect(() => {
    if (id) {
      console.log('TeamDetail - userRole:', userRole, 'user?.role:', user?.role, 'isHrUser:', isHrUser);
    }
  }, [userRole, user?.role, isHrUser, id]);

  useEffect(() => {
    if (id) {
      fetchTeam();
      if (isHrUser) {
        fetchEmployees();
      }
    }
  }, [id, isHrUser]);

  const fetchTeam = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getTeam(id);
      setTeam(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch team',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!id) return;
    try {
      // Use the new endpoint that includes project allocation info
      const data = await api.getAvailableEmployeesForTeam(id);
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      // Fallback to regular getEmployees if the new endpoint fails
      try {
        const fallbackData = await api.getEmployees();
        setEmployees(fallbackData);
      } catch (fallbackError) {
        console.error('Failed to fetch employees (fallback):', fallbackError);
      }
    }
  };

  const handleAddMember = async () => {
    if (!id || !formData.employee_id) return;
    
    // Check if employee has active project allocation (unless manual override)
    const selectedEmployee = employees.find(emp => emp.id === formData.employee_id);
    if (!formData.manual_override && selectedEmployee?.has_active_project_allocation) {
      toast({
        title: 'Warning',
        description: 'This employee is already allocated to a project. Enable "Manual Override" to add them anyway.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await api.addTeamMember(id, {
        employee_id: formData.employee_id,
        role: formData.role,
        is_primary: formData.is_primary,
        start_date: formData.start_date,
        manual_override: formData.manual_override,
      });
      toast({
        title: 'Success',
        description: 'Member added successfully',
      });
      setAddMemberDialogOpen(false);
      setFormData({
        employee_id: '',
        role: 'MEMBER',
        is_primary: false,
        start_date: new Date().toISOString().split('T')[0],
        manual_override: false,
      });
      fetchTeam();
      fetchEmployees(); // Refresh available employees
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add member',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return;
    try {
      await api.updateTeamMembership(id, memberId, {
        end_date: new Date().toISOString().split('T')[0],
      });
      toast({
        title: 'Success',
        description: 'Member removed successfully',
      });
      fetchTeam();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove member',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-8">Loading team...</div>
      </AppLayout>
    );
  }

  if (!team) {
    return (
      <AppLayout>
        <div className="text-center py-8">Team not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/teams')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{team.name}</h1>
            <p className="text-muted-foreground">{team.code}</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Team Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Type</Label>
                <Badge variant="outline" className="ml-2">
                  {team.team_type}
                </Badge>
              </div>
              {team.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1">{team.description}</p>
                </div>
              )}
              {team.owner_manager_name && (
                <div>
                  <Label className="text-muted-foreground">Manager</Label>
                  <p className="mt-1">{team.owner_manager_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {team.owner_manager_email}
                  </p>
                </div>
              )}
              {team.parent_team_name && (
                <div>
                  <Label className="text-muted-foreground">Parent Team</Label>
                  <p className="mt-1">{team.parent_team_name}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Team Members</CardTitle>
                {isHrUser && (
                  <Button
                    size="sm"
                    onClick={() => setAddMemberDialogOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                )}
              </div>
              <CardDescription>
                {team.members?.length || 0} active members
              </CardDescription>
            </CardHeader>
            <CardContent>
              {team.members && team.members.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Primary</TableHead>
                      {isHrUser && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{member.employee_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {member.employee_email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{member.role}</Badge>
                        </TableCell>
                        <TableCell>
                          {member.is_primary ? (
                            <Badge>Primary</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {isHrUser && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No members yet</p>
                  {isHrUser ? (
                    <Button
                      onClick={() => setAddMemberDialogOpen(true)}
                      variant="outline"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add First Member
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Contact HR/Admin to add members to this team
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Member Dialog */}
        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add an employee to this team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="employee_id">Employee *</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={(v) =>
                    setFormData({ ...formData, employee_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees
                      .filter((emp) => {
                        // Filter out employees already in the team
                        const alreadyInTeam = team.members?.some(
                          (m) => m.employee_id === emp.id && !m.end_date
                        );
                        if (alreadyInTeam) return false;
                        
                        // If manual override is not enabled, hide employees with active project allocations
                        if (!formData.manual_override && emp.has_active_project_allocation) {
                          return false;
                        }
                        
                        return true;
                      })
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name || `${emp.profiles?.first_name} ${emp.profiles?.last_name}`} (
                          {emp.email || emp.profiles?.email})
                          {emp.has_active_project_allocation && (
                            <span className="text-xs text-muted-foreground ml-2">(In Project)</span>
                          )}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v: any) =>
                    setFormData({ ...formData, role: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="LEAD">Lead</SelectItem>
                    <SelectItem value="COORDINATOR">Coordinator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {team.team_type === 'FUNCTIONAL' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_primary"
                    checked={formData.is_primary}
                    onChange={(e) =>
                      setFormData({ ...formData, is_primary: e.target.checked })
                    }
                    className="rounded"
                  />
                  <Label htmlFor="is_primary">Set as primary team</Label>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="manual_override"
                  checked={formData.manual_override}
                  onChange={(e) =>
                    setFormData({ ...formData, manual_override: e.target.checked })
                  }
                  className="rounded"
                />
                <Label htmlFor="manual_override">
                  Manual Override (allow adding employees already in projects)
                </Label>
              </div>
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddMemberDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddMember}>Add Member</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}


