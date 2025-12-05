import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Trash2, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function EmployeeSkillsEditor({ employeeId, canEdit = false }: { employeeId: string; canEdit?: boolean }) {
  const [skills, setSkills] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', level: 3, years_experience: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (!employeeId) return;
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills`, { 
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } 
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        setSkills(data);
      } else {
        console.error('Failed to load skills:', data);
        setSkills([]);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      setSkills([]);
    }
  };

  useEffect(() => { load(); }, [employeeId]);

  const addSkill = async () => {
    if (!employeeId || !form.name) return;
    const payload = { name: form.name, level: form.level, years_experience: form.years_experience || 0 };
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify(payload)
    });
    let data: any = null;
    try { data = await resp.json(); } catch {}
    if (resp.ok && data) {
      await load();
      setForm({ name: '', level: 3, years_experience: 0 });
      toast({
        title: 'Success',
        description: 'Skill added successfully',
      });
    } else {
      toast({
        title: 'Error',
        description: data?.error || 'Failed to add skill',
        variant: 'destructive',
      });
    }
  };

  const deleteSkill = async (skillId: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills/${skillId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` }
      });
      if (resp.ok) {
        await load();
        toast({
          title: 'Success',
          description: 'Skill deleted successfully',
        });
      } else {
        const data = await resp.json().catch(() => ({ error: 'Failed to delete skill' }));
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete skill',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete skill',
        variant: 'destructive',
      });
    }
  };

  const startEdit = (skill: any) => {
    setEditingId(skill.id);
    setForm({ name: skill.name, level: skill.level, years_experience: skill.years_experience || 0 });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: '', level: 3, years_experience: 0 });
  };

  const saveEdit = async () => {
    if (!employeeId || !form.name || !editingId) return;
    const payload = { name: form.name, level: form.level, years_experience: form.years_experience || 0 };
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify(payload)
    });
    let data: any = null;
    try { data = await resp.json(); } catch {}
    if (resp.ok && data) {
      await load();
      setEditingId(null);
      setForm({ name: '', level: 3, years_experience: 0 });
      toast({
        title: 'Success',
        description: 'Skill updated successfully',
      });
    } else {
      toast({
        title: 'Error',
        description: data?.error || 'Failed to update skill',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>{editingId ? 'Edit Skill' : 'Add Skill'}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Input 
              placeholder="Skill name" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
              className="flex-1 min-w-[200px]"
            />
            <Select value={String(form.level)} onValueChange={(v)=>setForm({ ...form, level: Number(v) })}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5].map(n => (<SelectItem key={n} value={String(n)}>Level {n}</SelectItem>))}
              </SelectContent>
            </Select>
            <Input 
              type="number" 
              className="w-28" 
              placeholder="Years" 
              value={form.years_experience} 
              onChange={e => setForm({ ...form, years_experience: Number(e.target.value) || 0 })} 
            />
            {editingId ? (
              <>
                <Button onClick={saveEdit} className="shadow-none hover:shadow-none">Save</Button>
                <Button variant="outline" onClick={cancelEdit} className="shadow-none hover:shadow-none">Cancel</Button>
              </>
            ) : (
              <Button onClick={addSkill} className="shadow-none hover:shadow-none">Add</Button>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Skills ({skills.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skills.map((s) => (
              <div key={s.id} className="border rounded p-3 text-sm flex items-center justify-between hover:bg-muted/50 hover-lift transition-colors">
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">
                    Level {s.level} {s.years_experience > 0 && `• ${s.years_experience} yrs`}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => startEdit(s)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => deleteSkill(s.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {skills.length === 0 && (
              <div className="col-span-2 text-sm text-muted-foreground text-center py-8">
                No skills yet. {canEdit && 'Add your first skill above!'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


