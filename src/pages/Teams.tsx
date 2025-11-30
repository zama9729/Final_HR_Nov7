import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { Plus, Search, Users, Building2, Edit, Trash2, Eye, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface Team {
  id: string;
  name: string;
  code: string;
  description?: string;
  team_type: 'FUNCTIONAL' | 'PROJECT';
  owner_manager_name?: string;
  owner_manager_email?: string;
  member_count: number;
  is_active: boolean;
  parent_team_name?: string;
}

export default function Teams() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'functional' | 'project'>('functional');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    team_type: 'FUNCTIONAL' as 'FUNCTIONAL' | 'PROJECT',
    parent_team_id: '',
    owner_manager_id: '',
  });
  const [employees, setEmployees] = useState<any[]>([]);

  const isHrUser = user?.roles?.some(r => ['hr', 'director', 'ceo', 'admin'].includes(r.role));

  useEffect(() => {
    fetchTeams();
    if (isHrUser) {
      fetchEmployees();
    }
  }, [activeTab, searchQuery, isHrUser]);

  const fetchTeams = async () => {
    setLoading(true);
    try {
      const type = activeTab === 'functional' ? 'FUNCTIONAL' : 'PROJECT';
      const data = await api.getTeams({ type, search: searchQuery || undefined, active: true });
      setTeams(data);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch teams',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
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

  const handleCreate = () => {
    setEditingTeam(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      team_type: activeTab === 'functional' ? 'FUNCTIONAL' : 'PROJECT',
      parent_team_id: '',
      owner_manager_id: '',
    });
    setDialogOpen(true);
  };

  const handleEdit = (team: Team) => {
    setEditingTeam(team);
    setFormData({
      name: team.name,
      code: team.code || '',
      description: team.description || '',
      team_type: team.team_type,
      parent_team_id: '',
      owner_manager_id: '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingTeam) {
        await api.updateTeam(editingTeam.id, formData);
        toast({
          title: 'Success',
          description: 'Team updated successfully',
        });
      } else {
        await api.createTeam(formData);
        toast({
          title: 'Success',
          description: 'Team created successfully',
        });
      }
      setDialogOpen(false);
      fetchTeams();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save team',
        variant: 'destructive',
      });
    }
  };

  const handleView = (teamId: string) => {
    navigate(`/teams/${teamId}`);
  };

  const handleToggleActive = async (team: Team) => {
    try {
      if (team.is_active) {
        await api.deactivateTeam(team.id);
      } else {
        await api.activateTeam(team.id);
      }
      toast({
        title: 'Success',
        description: `Team ${team.is_active ? 'deactivated' : 'activated'} successfully`,
      });
      fetchTeams();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update team',
        variant: 'destructive',
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Teams</h1>
            <p className="text-muted-foreground">
              Manage functional and project teams
            </p>
          </div>
          {isHrUser && (
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  {activeTab === 'functional' ? 'Functional teams' : 'Project teams'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search teams..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="functional">
                  <Building2 className="mr-2 h-4 w-4" />
                  Functional Teams
                </TabsTrigger>
                <TabsTrigger value="project">
                  <Users className="mr-2 h-4 w-4" />
                  Project Teams
                </TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab} className="mt-4">
                {loading ? (
                  <div className="text-center py-8">Loading teams...</div>
                ) : teams.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No teams found
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {teams.map((team) => (
                      <Card key={team.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">{team.name}</CardTitle>
                              <CardDescription>{team.code}</CardDescription>
                            </div>
                            <Badge variant={team.is_active ? 'default' : 'secondary'}>
                              {team.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {team.description && (
                            <p className="text-sm text-muted-foreground mb-4">
                              {team.description}
                            </p>
                          )}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span>{team.member_count} members</span>
                            </div>
                            {team.owner_manager_name && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Manager:</span>
                                <span>{team.owner_manager_name}</span>
                              </div>
                            )}
                            {team.parent_team_name && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Parent:</span>
                                <span>{team.parent_team_name}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleView(team.id)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                            {isHrUser && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(team)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleActive(team)}
                                >
                                  {team.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTeam ? 'Edit Team' : 'Create Team'}
              </DialogTitle>
              <DialogDescription>
                {editingTeam
                  ? 'Update team information'
                  : 'Create a new functional or project team'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Team Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="e.g., Engineering Frontend"
                />
              </div>
              <div>
                <Label htmlFor="code">Team Code</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                  placeholder="e.g., ENG-FE"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Team description..."
                  rows={3}
                />
              </div>
              {!editingTeam && (
                <div>
                  <Label htmlFor="team_type">Team Type</Label>
                  <Select
                    value={formData.team_type}
                    onValueChange={(v: any) =>
                      setFormData({ ...formData, team_type: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FUNCTIONAL">Functional</SelectItem>
                      <SelectItem value="PROJECT">Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor="owner_manager_id">Team Manager</Label>
                <Select
                  value={formData.owner_manager_id}
                  onValueChange={(v) =>
                    setFormData({ ...formData, owner_manager_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.profiles?.first_name} {emp.profiles?.last_name} ({emp.profiles?.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingTeam ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

