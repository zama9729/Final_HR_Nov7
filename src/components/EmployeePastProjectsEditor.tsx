import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeePastProjectsEditor({
  employeeId,
  canEdit = false,
}: {
  employeeId: string;
  canEdit?: boolean;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    project_name: '',
    role: '',
    start_date: '',
    end_date: '',
    technologies: '',
    description: '',
  });

  const load = async () => {
    if (!employeeId) return;
    try {
      // Use API client and explicitly request past projects
      const data = await api.get(
        `/api/v1/employees/${employeeId}/projects?type=past`,
      );
      if (Array.isArray(data)) {
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

  useEffect(() => {
    if (employeeId) load();
  }, [employeeId]);

  const add = async () => {
    if (!employeeId || !form.project_name.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        technologies: form.technologies
          ? form.technologies.split(',').map((t) => t.trim())
          : [],
      };

      const data = await api.request(
        `/api/v1/employees/${employeeId}/projects`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );

      if (data) {
        setItems((prev) => [data, ...prev]);
        // Clear form after successful add
        setForm({
          project_name: '',
          role: '',
          start_date: '',
          end_date: '',
          technologies: '',
          description: '',
        });
      }
    } catch (error) {
      console.error('Error adding past project:', error);
    } finally {
      setSaving(false);
    }
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
            <Textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="col-span-2"
            />
            <div className="col-span-2">
              <Button onClick={add} disabled={saving || !form.project_name}>
                {saving ? 'Saving...' : 'Add'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Past Projects</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {items.map((p, i) => {
              const formatDate = (dateStr: string | null | undefined) => {
                if (!dateStr) return '—';
                try {
                  const date = new Date(dateStr);
                  if (isNaN(date.getTime())) return dateStr;
                  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                } catch {
                  return dateStr;
                }
              };
              return (
                <div key={i} className="border rounded p-2 text-sm">
                  <div className="font-medium">{p.project_name} — {p.role || ''}</div>
                  <div className="text-muted-foreground">{formatDate(p.start_date)} → {formatDate(p.end_date)}</div>
                  <div className="text-muted-foreground">{(p.technologies || []).join(', ')}</div>
                  <div>{p.description}</div>
                </div>
              );
            })}
            {items.length === 0 && <div className="text-sm text-muted-foreground">No past projects yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


