import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Plus, Calendar, MapPin, Users, TrendingUp, Loader2, Edit, Trash2, X, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import ViewAssignedModal from '@/components/ViewAssignedModal';

interface Project {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  expected_allocation_percent: number;
  location: string | null;
  required_skills: string[] | null;
  required_certifications: string[] | null;
  assignment_count: number;
  total_allocation: number;
  created_at: string;
}

export default function CEODashboard() {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewAssignedOpen, setViewAssignedOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    priority: 0,
    location: '',
    expected_allocation_percent: 50,
  });

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data || []);
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch projects',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (project: Project) => {
    setSelectedProject(project);
    setEditForm({
      name: project.name,
      start_date: project.start_date ? format(new Date(project.start_date), 'yyyy-MM-dd') : '',
      end_date: project.end_date ? format(new Date(project.end_date), 'yyyy-MM-dd') : '',
      priority: project.priority || 0,
      location: project.location || '',
      expected_allocation_percent: project.expected_allocation_percent || 50,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProject) return;
    
    try {
      await api.updateProject(selectedProject.id, {
        name: editForm.name,
        start_date: editForm.start_date || undefined,
        end_date: editForm.end_date || undefined,
        priority: editForm.priority,
        location: editForm.location || undefined,
        expected_allocation_percent: editForm.expected_allocation_percent,
      });
      
      toast({
        title: 'Success',
        description: 'Project updated successfully',
      });
      
      setEditDialogOpen(false);
      setSelectedProject(null);
      fetchProjects();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedProject) return;
    
    try {
      await api.deleteProject(selectedProject.id);
      
      toast({
        title: 'Success',
        description: 'Project deleted successfully',
      });
      
      setDeleteDialogOpen(false);
      setSelectedProject(null);
      fetchProjects();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete project',
        variant: 'destructive',
      });
    }
  };

  const handleViewAssigned = (project: Project) => {
    setSelectedProject(project);
    setViewAssignedOpen(true);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">CEO Staffing Dashboard</h1>
            <p className="text-muted-foreground">Manage projects and staffing allocations</p>
          </div>
          <a href="/projects/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </a>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first project
              </p>
              <a href="/projects/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg font-semibold">{project.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      {project.priority > 0 && (
                        <Badge variant={project.priority >= 8 ? 'destructive' : project.priority >= 5 ? 'default' : 'secondary'}>
                          Priority {project.priority}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(project)}
                        className="h-6 w-6 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedProject(project);
                          setDeleteDialogOpen(true);
                        }}
                        className="h-6 w-6 p-0 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(project.start_date || project.end_date) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {project.start_date && format(new Date(project.start_date), 'MMM dd, yyyy')}
                        {project.start_date && project.end_date && ' - '}
                        {project.end_date && format(new Date(project.end_date), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  )}

                  {project.location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{project.location}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{project.assignment_count || 0} assigned</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span>{Number(project.total_allocation || 0).toFixed(0)}% allocated</span>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      size="sm"
                      onClick={() => handleViewAssigned(project)}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      View Assigned
                    </Button>
                    <a href={`/projects/${project.id}/suggestions`} className="flex-1">
                      <Button variant="default" className="w-full" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Assign Candidates
                      </Button>
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Project Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Project Name *</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-start-date">Start Date</Label>
                  <Input
                    id="edit-start-date"
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end-date">End Date</Label>
                  <Input
                    id="edit-end-date"
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-priority">Priority (0-10)</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    min="0"
                    max="10"
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-allocation">Expected Allocation %</Label>
                  <Input
                    id="edit-allocation"
                    type="number"
                    min="0"
                    max="100"
                    value={editForm.expected_allocation_percent}
                    onChange={(e) => setEditForm({ ...editForm, expected_allocation_percent: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  placeholder="e.g., New York, Remote"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Project Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Project</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete "{selectedProject?.name}"? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Assigned Modal */}
        {selectedProject && (
          <ViewAssignedModal
            open={viewAssignedOpen}
            onOpenChange={setViewAssignedOpen}
            projectId={selectedProject.id}
            projectName={selectedProject.name}
            onUpdate={fetchProjects}
          />
        )}
      </div>
    </AppLayout>
  );
}
