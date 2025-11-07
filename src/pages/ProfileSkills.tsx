import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function ProfileSkills() {
  const [employeeId, setEmployeeId] = useState<string>('');
  const [skills, setSkills] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', level: 3, years_experience: 1 });

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getEmployeeId();
        setEmployeeId(me.id);
        const s = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${me.id}/skills`, { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } })
          .then(r => r.json());
        setSkills(s);
      } catch {}
    })();
  }, []);

  const addSkill = async () => {
    if (!employeeId || !form.name) return;
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify(form)
    });
    const data = await resp.json();
    if (resp.ok) setSkills(prev => [data, ...prev]);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-bold">Skills & Certifications</h1>
        <Card>
          <CardHeader>
            <CardTitle>Add Skill</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input placeholder="Skill name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Select value={String(form.level)} onValueChange={v => setForm({ ...form, level: Number(v) })}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                {[1,2,3,4,5].map(n => (<SelectItem key={n} value={String(n)}>{n}</SelectItem>))}
              </SelectContent>
            </Select>
            <Input type="number" className="w-32" placeholder="Years" value={form.years_experience} onChange={e => setForm({ ...form, years_experience: Number(e.target.value) })} />
            <Button onClick={addSkill}>Add</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {skills.map((s, i) => (
                <div key={i} className="border rounded p-2 text-sm flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-muted-foreground">Level {s.level} • {s.years_experience || 0} yrs</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


