import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function AssignModal({ open, onOpenChange, projectId, candidate }: { open: boolean; onOpenChange: (v:boolean)=>void; projectId: string; candidate: any }) {
  const [allocation, setAllocation] = useState(50);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');

  const submit = async () => {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/projects/${projectId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` },
      body: JSON.stringify({ employee_id: candidate.employee_id, allocation_percent: allocation, override, override_reason: reason })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data?.error || 'Assignment failed');
    onOpenChange(false);
  };

  if (!candidate) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Assign {candidate.name}</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div>Current allocation: {candidate.current_allocations}%</div>
          <Input type="number" value={allocation} onChange={e => setAllocation(Number(e.target.value))} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> HR Override</label>
          {override && (<Input placeholder="Override reason" value={reason} onChange={e => setReason(e.target.value)} />)}
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={submit}>Confirm Assign</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


