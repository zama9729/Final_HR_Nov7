import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function EmployeeCertificationsEditor({ employeeId, canEdit = false }: { employeeId: string; canEdit?: boolean }) {
  const [certs, setCerts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', issuer: '', issue_date: '', expiry_date: '', file_url: '' });

  const load = async () => {
    if (!employeeId) return;
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications`, { 
        headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } 
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data)) {
        setCerts(data);
      } else {
        console.error('Failed to load certifications:', data);
        setCerts([]);
      }
    } catch (error) {
      console.error('Error loading certifications:', error);
      setCerts([]);
    }
  };
  useEffect(() => { load(); }, [employeeId]);

  const add = async () => {
    if (!form.name) return;
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/employees/${employeeId}/certifications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` }, body: JSON.stringify(form)
    });
    const data = await resp.json();
    if (resp.ok) setCerts(prev => [data, ...prev]);
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add Certification</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Issuer" value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} />
            <Input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
            <Input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
            <Input placeholder="Certificate URL" value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} />
            <div className="col-span-2"><Button onClick={add}>Add</Button></div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Certifications</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {certs.map((c, i) => (
              <div key={i} className="border rounded p-2 text-sm">
                <div className="font-medium">{c.name} {c.file_url && (<a href={c.file_url} target="_blank" className="underline ml-2">link</a>)}</div>
                <div className="text-muted-foreground">{c.issuer || '—'} • {c.issue_date || '—'} → {c.expiry_date || '—'}</div>
              </div>
            ))}
            {certs.length === 0 && <div className="text-sm text-muted-foreground">No certifications yet.</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


