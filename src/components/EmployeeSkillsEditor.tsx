import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeeSkillsEditor({ employeeId, canEdit = false }: { employeeId: string; canEdit?: boolean }) {
  const [skills, setSkills] = useState<any[]>([]);
  // Simplified UI: name + rating (1-5)
  const [form, setForm] = useState({ name: '', rating: 3 });

  const load = async () => {
    if (!employeeId) return;
    const s = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills`, { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } })
      .then(r => r.json());
    setSkills(s);
  };

  useEffect(() => { load(); }, [employeeId]);

  const addSkill = async () => {
    if (!employeeId || !form.name) return;
    // Map rating -> level, omit years
    const payload = { name: form.name, level: form.rating, years_experience: null };
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify(payload)
    });
    let data: any = null;
    try { data = await resp.json(); } catch {}
    if (resp.ok && data) {
      // Reload to stay consistent with server (avoid dup/ordering issues)
      await load();
      setForm({ name: '', rating: 3 });
    } else {
      alert(data?.error || 'Failed to add skill');
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add Skill</CardTitle></CardHeader>
          <CardContent className="flex gap-2 items-center">
            <Input placeholder="Skill name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Select value={String(form.rating)} onValueChange={(v)=>setForm({ ...form, rating: Number(v) })}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Rating" /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5].map(n => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button onClick={addSkill}>Add</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Skills</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {skills.map((s, i) => (
              <div key={i} className="border rounded p-2 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">Rating {s.level}</div>
                </div>
              </div>
            ))}
            {skills.length === 0 && <div className="text-sm text-muted-foreground">No skills yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


