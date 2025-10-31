import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CandidateCard from '@/components/CandidateCard';
import AssignModal from '@/components/AssignModal';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';

export default function ProjectSuggestions() {
  const { id } = useParams();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [filters, setFilters] = useState({ minAvail: 0, includeOverloaded: false });

  const load = async () => {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/projects/${id}/suggest-candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify({ include_overloaded: filters.includeOverloaded, util_threshold: filters.minAvail })
    });
    const data = await resp.json();
    if (resp.ok) setCandidates(data.candidates || []);
  };

  useEffect(() => { load(); }, [id, filters.minAvail, filters.includeOverloaded]);

  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold">Candidate Suggestions</h1>
        <Card>
          <CardHeader><CardTitle>Top candidates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-3 items-center text-sm">
              <div className="flex items-center gap-2">
                <span>Min availability %</span>
                <input type="number" className="w-20 border rounded px-2 py-1" value={filters.minAvail} onChange={e => setFilters({ ...filters, minAvail: Number(e.target.value) })} />
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={filters.includeOverloaded} onChange={e => setFilters({ ...filters, includeOverloaded: e.target.checked })} /> Include overloaded</label>
            </div>
            {candidates.map((c, idx) => (
              <CandidateCard key={idx} c={c} onAssign={setSelected} />
            ))}
            {candidates.length === 0 && <div className="text-sm text-muted-foreground">No candidates yet.</div>}
          </CardContent>
        </Card>
        <AssignModal open={!!selected} onOpenChange={(v)=>!v&&setSelected(null)} projectId={id!} candidate={selected} />
      </div>
    </AppLayout>
  );
}


