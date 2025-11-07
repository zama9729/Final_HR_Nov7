import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeePastProjectsEditor({ employeeId, canEdit = false }: { employeeId: string; canEdit?: boolean }) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ project_name: '', role: '', start_date: '', end_date: '', technologies: '', description: '' });

  const load = async () => {
    if (!employeeId) return;
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/projects`, { 
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } 
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        setItems(data);
      } else {
        console.error('Failed to load past projects:', data);
        setItems([]);
      }
    } catch (error) {
      console.error('Error loading past projects:', error);
      setItems([]);
    }
  };
  useEffect(() => { if (employeeId) load(); }, [employeeId]);

  const add = async () => {
    const body = { ...form, technologies: form.technologies ? form.technologies.split(',').map(t => t.trim()) : [] };
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` }, body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (resp.ok) setItems(prev => [data, ...prev]);
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add Past Project</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Input placeholder="Project name" value={form.project_name} onChange={e => setForm({ ...form, project_name: e.target.value })} />
            <Input placeholder="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
            <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
            <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
            <Input placeholder="Technologies (comma-separated)" value={form.technologies} onChange={e => setForm({ ...form, technologies: e.target.value })} className="col-span-2" />
            <Textarea placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="col-span-2" />
            <div className="col-span-2"><Button onClick={add}>Add</Button></div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Past Projects</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {items.map((p, i) => (
              <div key={i} className="border rounded p-2 text-sm">
                <div className="font-medium">{p.project_name} — {p.role || ''}</div>
                <div className="text-muted-foreground">{p.start_date || '—'} → {p.end_date || '—'}</div>
                <div className="text-muted-foreground">{(p.technologies || []).join(', ')}</div>
                <div>{p.description}</div>
              </div>
            ))}
            {items.length === 0 && <div className="text-sm text-muted-foreground">No past projects yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


