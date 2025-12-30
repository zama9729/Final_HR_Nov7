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
import { ArrowLeft, UserPlus, Calendar, MapPin, Users, Briefcase, Building2, Edit } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { SmartMemoAI } from '@/components/smartmemo/SmartMemoAI';

interface ProjectAllocation {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  allocation_type: 'FULL_TIME' | 'PART_TIME' | 'AD_HOC';
  percent_allocation?: number;
  start_date: string;
  end_date?: string;
  role_on_project?: string;
  position?: string;
  department?: string;
  primary_team_name?: string;
  primary_manager_name?: string;
}

interface Project {
  id: string;
  name: string;
  code?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  status: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  project_manager_name?: string;
  project_manager_email?: string;
  team_name?: string;
  priority: number;
  location?: string;
  required_skills?: any[];
  required_certifications?: string[];
  allocations: ProjectAllocation[];
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userRole, user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [addAllocationDialogOpen, setAddAllocationDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    employee_id: '',
    allocation_type: 'PART_TIME' as 'FULL_TIME' | 'PART_TIME' | 'AD_HOC',
    percent_allocation: 50,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    role_on_project: '',
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'PLANNED' as 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED',
    project_manager_id: '',
    team_id: '',
  });
  const [teams, setTeams] = useState<any[]>([]);

  // Check if user has HR/admin permissions (case-insensitive)
  // Check both userRole from context and user.role as fallback
  const roleToCheck = userRole || user?.role || '';
  const isHrUser = roleToCheck ? ['hr', 'director', 'ceo', 'admin', 'super_user'].includes(roleToCheck.toLowerCase()) : false;
  
  // Debug: Log role check (remove in production)
  useEffect(() => {
    if (id) {
      console.log('ProjectDetail - userRole:', userRole, 'user?.role:', user?.role, 'isHrUser:', isHrUser);
    }
  }, [userRole, user?.role, isHrUser, id]);

  useEffect(() => {
    if (id) {
      fetchProject();
      // Always fetch employees so they're available in the dropdown
      // The button visibility is controlled by isHrUser
      fetchEmployees();
      if (isHrUser) {
        fetchTeams();
      }
    }
  }, [id, isHrUser]);

  const fetchTeams = async () => {
    try {
      const data = await api.getTeams({ type: 'PROJECT' });
      setTeams(data);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    }
  };

  const fetchProject = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getProject(id);
      setProject(data);
      // Set edit form data - handle both direct fields and nested response
      setEditFormData({
        name: data.name || '',
        description: data.description || '',
        start_date: data.start_date ? data.start_date.split('T')[0] : '',
        end_date: data.end_date ? data.end_date.split('T')[0] : '',
        status: data.status || 'PLANNED',
        project_manager_id: data.project_manager_id || data.project_manager?.id || '',
        team_id: data.team_id || data.team?.id || '',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch project',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditProject = async () => {
    if (!id) return;
    try {
      // Convert __none__ back to empty string or null for the API
      const dataToSave = {
        ...editFormData,
        project_manager_id: editFormData.project_manager_id === '__none__' ? '' : editFormData.project_manager_id,
        team_id: editFormData.team_id === '__none__' ? '' : editFormData.team_id,
      };
      
      await api.updateProject(id, dataToSave);
      toast({
        title: 'Success',
        description: 'Project updated successfully',
      });
      setEditDialogOpen(false);
      fetchProject();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project',
        variant: 'destructive',
      });
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const handleAddAllocation = async () => {
    if (!id || !formData.employee_id) {
      toast({
        title: 'Error',
        description: 'Please select an employee',
        variant: 'destructive',
      });
      return;
    }
    try {
      // Prepare data, converting empty strings to null/undefined for optional fields
      const allocationData = {
        employee_id: formData.employee_id,
        allocation_type: formData.allocation_type,
        percent_allocation: formData.percent_allocation || undefined,
        start_date: formData.start_date || new Date().toISOString().split('T')[0],
        end_date: formData.end_date || undefined,
        role_on_project: formData.role_on_project || undefined,
      };
      
      await api.createProjectAllocation(id, allocationData);
      toast({
        title: 'Success',
        description: 'Employee allocated to project successfully',
      });
      setAddAllocationDialogOpen(false);
      setFormData({
        employee_id: '',
        allocation_type: 'PART_TIME',
        percent_allocation: 50,
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        role_on_project: '',
      });
      fetchProject();
    } catch (error: any) {
      console.error('Error adding allocation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add allocation',
        variant: 'destructive',
      });
    }
  };

  const handleEndAllocation = async (allocId: string) => {
    if (!id) return;
    try {
      await api.updateProjectAllocation(id, allocId, {
        end_date: new Date().toISOString().split('T')[0],
      });
      toast({
        title: 'Success',
        description: 'Allocation ended successfully',
      });
      fetchProject();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to end allocation',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      PLANNED: { variant: 'secondary' as const, label: 'Planned' },
      ACTIVE: { variant: 'default' as const, label: 'Active' },
      ON_HOLD: { variant: 'outline' as const, label: 'On Hold' },
      COMPLETED: { variant: 'default' as const, label: 'Completed' },
    };
    const config = variants[status] || variants.PLANNED;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-8">Loading project...</div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="text-center py-8">Project not found</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Smart Memo Widget - Contextual to Project */}
        {id && project && (
          <Card className="border-purple-200 bg-purple-50/30">
            <CardContent className="pt-4">
              <SmartMemoAI
                embedded={true}
                currentEntityId={id}
                currentEntityType="project"
                currentEntityName={project.name}
                onEventsCreated={() => {
                  fetchProject();
                }}
              />
            </CardContent>
          </Card>
        )}

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{project.name}</h1>
              {getStatusBadge(project.status)}
            </div>
            {project.code && <p className="text-muted-foreground">{project.code}</p>}
          </div>
          {isHrUser && (
            <Button onClick={() => setEditDialogOpen(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Project
            </Button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {project.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1">{project.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {project.start_date && (
                  <div>
                    <Label className="text-muted-foreground">Start Date</Label>
                    <p className="mt-1">{format(new Date(project.start_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {project.end_date && (
                  <div>
                    <Label className="text-muted-foreground">End Date</Label>
                    <p className="mt-1">{format(new Date(project.end_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {project.location && (
                  <div>
                    <Label className="text-muted-foreground">Location</Label>
                    <p className="mt-1">{project.location}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Priority</Label>
                  <p className="mt-1">{project.priority}</p>
                </div>
              </div>
              {project.project_manager_name && (
                <div>
                  <Label className="text-muted-foreground">Project Manager</Label>
                  <p className="mt-1">{project.project_manager_name}</p>
                  {project.project_manager_email && (
                    <p className="text-sm text-muted-foreground">
                      {project.project_manager_email}
                    </p>
                  )}
                </div>
              )}
              {project.team_name && (
                <div>
                  <Label className="text-muted-foreground">Project Team</Label>
                  <p className="mt-1">{project.team_name}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Team Allocations</CardTitle>
                {isHrUser && (
                  <Button
                    size="sm"
                    onClick={() => setAddAllocationDialogOpen(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Member
                  </Button>
                )}
              </div>
              <CardDescription>
                {project.allocations?.length || 0} active allocations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {project.allocations && project.allocations.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Allocation</TableHead>
                      <TableHead>Functional Team</TableHead>
                      {isHrUser && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.allocations.map((alloc) => (
                      <TableRow key={alloc.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{alloc.employee_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {alloc.employee_email}
                            </div>
                            {alloc.primary_manager_name && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Reports to: {alloc.primary_manager_name}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{alloc.role_on_project || 'Member'}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <Badge variant="secondary">{alloc.allocation_type}</Badge>
                            {alloc.percent_allocation && (
                              <div className="text-sm text-muted-foreground mt-1">
                                {alloc.percent_allocation}%
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {alloc.primary_team_name ? (
                            <span>{alloc.primary_team_name}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {isHrUser && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEndAllocation(alloc.id)}
                            >
                              End
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No allocations yet</p>
                  {isHrUser && (
                    <Button
                      onClick={() => setAddAllocationDialogOpen(true)}
                      variant="outline"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add First Employee
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Add Allocation Dialog */}
        <Dialog open={addAllocationDialogOpen} onOpenChange={setAddAllocationDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Project Allocation</DialogTitle>
              <DialogDescription>
                Allocate an employee to this project
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
                      .filter(
                        (emp) =>
                          !project.allocations?.some(
                            (a) => a.employee_id === emp.id && !a.end_date
                          )
                      )
                      .map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.profiles?.first_name} {emp.profiles?.last_name} (
                          {emp.profiles?.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="allocation_type">Allocation Type</Label>
                <Select
                  value={formData.allocation_type}
                  onValueChange={(v: any) =>
                    setFormData({ ...formData, allocation_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">Full Time</SelectItem>
                    <SelectItem value="PART_TIME">Part Time</SelectItem>
                    <SelectItem value="AD_HOC">Ad Hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="percent_allocation">Allocation %</Label>
                <Input
                  id="percent_allocation"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.percent_allocation}
                  onChange={(e) =>
                    setFormData({ ...formData, percent_allocation: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label htmlFor="role_on_project">Role on Project</Label>
                <Input
                  id="role_on_project"
                  value={formData.role_on_project}
                  onChange={(e) =>
                    setFormData({ ...formData, role_on_project: e.target.value })
                  }
                  placeholder="e.g., Developer, QA, BA"
                />
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
              <div>
                <Label htmlFor="end_date">End Date (Optional)</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddAllocationDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddAllocation}>Add Allocation</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Project Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
              <DialogDescription>
                Update project information, manager, and team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit_name">Project Name *</Label>
                <Input
                  id="edit_name"
                  value={editFormData.name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit_description">Description</Label>
                <Textarea
                  id="edit_description"
                  value={editFormData.description}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_start_date">Start Date</Label>
                  <Input
                    id="edit_start_date"
                    type="date"
                    value={editFormData.start_date}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, start_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit_end_date">End Date</Label>
                  <Input
                    id="edit_end_date"
                    type="date"
                    value={editFormData.end_date}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, end_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_status">Status</Label>
                  <Select
                    value={editFormData.status}
                    onValueChange={(v: any) =>
                      setEditFormData({ ...editFormData, status: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PLANNED">Planned</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="ON_HOLD">On Hold</SelectItem>
                      <SelectItem value="COMPLETED">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit_project_manager_id">Project Manager</Label>
                  <Select
                    value={editFormData.project_manager_id}
                    onValueChange={(v) =>
                      setEditFormData({ ...editFormData, project_manager_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project manager" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.profiles?.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit_team_id">Project Team</Label>
                  <Select
                    value={editFormData.team_id}
                    onValueChange={(v) =>
                      setEditFormData({ ...editFormData, team_id: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name} ({team.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditProject}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

