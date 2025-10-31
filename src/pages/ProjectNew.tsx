import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/lib/api';
import MultiSelectSkills from '@/components/MultiSelectSkills';

export default function ProjectNew() {
  const nav = useNavigate();
  const [form, setForm] = useState<any>({ name: '', expected_allocation_percent: 50, priority: 0, required_skills: [] });
  const [skillName, setSkillName] = useState('');
  const [skillLevel, setSkillLevel] = useState(3);

  const addSkill = () => {
    if (!skillName) return;
    setForm((f: any) => ({ ...f, required_skills: [...(f.required_skills || []), { name: skillName, min_level: skillLevel }] }));
    setSkillName('');
    setSkillLevel(3);
  };

  const submit = async () => {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify(form)
    });
    const data = await resp.json();
    if (resp.ok) nav(`/projects/${data.id}/suggestions`);
    else alert(data?.error || 'Failed to create project');
  };

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Create Project</h1>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Project name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              <Input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              <Input type="number" placeholder="Allocation %" value={form.expected_allocation_percent} onChange={e => setForm({ ...form, expected_allocation_percent: Number(e.target.value) })} />
            </div>
            <MultiSelectSkills value={form.required_skills} onChange={(v)=>setForm((f:any)=>({ ...f, required_skills: v }))} />
            <Button onClick={submit}>Create & Suggest</Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


