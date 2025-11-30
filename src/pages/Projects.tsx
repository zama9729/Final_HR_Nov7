import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Plus, Search, Briefcase, Calendar, MapPin, Users, Eye, Edit, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  allocation_count: number;
  total_allocation: number;
  priority: number;
  location?: string;
  created_at: string;
}

export default function Projects() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const isHrUser = user?.roles?.some(r => ['hr', 'director', 'ceo', 'admin'].includes(r.role));

  useEffect(() => {
    fetchProjects();
  }, [searchQuery, statusFilter]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery) params.search = searchQuery;
      const data = await api.getProjects(params);
      setProjects(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch projects',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleView = (projectId: string) => {
    navigate(`/projects/${projectId}`);
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Manage projects and team allocations
            </p>
          </div>
          {isHrUser && (
            <Button onClick={() => navigate('/projects/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Projects</CardTitle>
                <CardDescription>All organization projects</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="PLANNED">Planned</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ON_HOLD">On Hold</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No projects found
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{project.name}</CardTitle>
                          {project.code && (
                            <CardDescription>{project.code}</CardDescription>
                          )}
                        </div>
                        {getStatusBadge(project.status)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      <div className="space-y-2 text-sm">
                        {project.start_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {format(new Date(project.start_date), 'MMM d, yyyy')}
                              {project.end_date &&
                                ` - ${format(new Date(project.end_date), 'MMM d, yyyy')}`}
                            </span>
                          </div>
                        )}
                        {project.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{project.location}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {project.allocation_count} members ({project.total_allocation}% total)
                          </span>
                        </div>
                        {project.project_manager_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">PM:</span>
                            <span>{project.project_manager_name}</span>
                          </div>
                        )}
                        {project.team_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Team:</span>
                            <span>{project.team_name}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleView(project.id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </Button>
                        {isHrUser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/projects/${project.id}/suggestions`)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

