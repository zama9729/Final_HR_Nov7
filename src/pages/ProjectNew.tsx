import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import MultiSelectSkills from '@/components/MultiSelectSkills';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

export default function ProjectNew() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState<any>({ 
    name: '', 
    expected_allocation_percent: 50, 
    priority: 0, 
    required_skills: [],
    status: 'PLANNED'
  });
  const [employees, setEmployees] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
    fetchTeams();
  }, []);

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchTeams = async () => {
    try {
      const data = await api.getTeams({ type: 'PROJECT' });
      setTeams(data);
    } catch (error) {
      console.error('Failed to fetch teams:', error);
    }
  };

  const submit = async () => {
    if (!form.name) {
      toast({
        title: 'Error',
        description: 'Project name is required',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const result = await api.createProject(form);
      toast({
        title: 'Success',
        description: 'Project created successfully',
      });
      nav(`/projects/${result.id}`);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Create Project</h1>
        <Card>
          <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Project Name *</Label>
              <Input 
                id="name"
                placeholder="Project name" 
                value={form.name} 
                onChange={e => setForm({ ...form, name: e.target.value })} 
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea 
                id="description"
                placeholder="Project description..."
                value={form.description || ''} 
                onChange={e => setForm({ ...form, description: e.target.value })} 
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Start Date</Label>
                <Input 
                  id="start_date"
                  type="date" 
                  value={form.start_date || ''} 
                  onChange={e => setForm({ ...form, start_date: e.target.value })} 
                />
              </div>
              <div>
                <Label htmlFor="end_date">End Date</Label>
                <Input 
                  id="end_date"
                  type="date" 
                  value={form.end_date || ''} 
                  onChange={e => setForm({ ...form, end_date: e.target.value })} 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="project_manager_id">Project Manager</Label>
                <Select
                  value={form.project_manager_id || ''}
                  onValueChange={(v) => setForm({ ...form, project_manager_id: v || undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project manager" />
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

              <div>
                <Label htmlFor="team_id">Project Team</Label>
                <Select
                  value={form.team_id || ''}
                  onValueChange={(v) => setForm({ ...form, team_id: v || undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select or create team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Create new team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} ({team.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status || 'PLANNED'}
                  onValueChange={(v) => setForm({ ...form, status: v })}
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

              <div>
                <Label htmlFor="expected_allocation_percent">Expected Allocation %</Label>
                <Input 
                  id="expected_allocation_percent"
                  type="number" 
                  min="0"
                  max="100"
                  placeholder="Allocation %" 
                  value={form.expected_allocation_percent} 
                  onChange={e => setForm({ ...form, expected_allocation_percent: Number(e.target.value) })} 
                />
              </div>
            </div>

            <div>
              <Label>Required Skills</Label>
              <MultiSelectSkills 
                value={form.required_skills} 
                onChange={(v)=>setForm((f:any)=>({ ...f, required_skills: v }))} 
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={loading}>
                {loading ? 'Creating...' : 'Create Project'}
              </Button>
              <Button variant="outline" onClick={() => nav('/projects')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


