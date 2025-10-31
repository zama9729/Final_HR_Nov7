import { Button } from '@/components/ui/button';

export default function CandidateCard({ c, onAssign }: { c: any; onAssign: (c: any) => void }) {
  return (
    <div className="border rounded p-3 flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-medium">{c.name}</div>
        <div className="text-xs text-muted-foreground">Availability: {c.availability}% • Current: {c.current_allocations}%</div>
        <div className="mt-2">
          <div className="h-2 bg-muted rounded">
            <div className="h-2 bg-green-600 rounded" style={{ width: `${Math.min(100, c.final_score)}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">Score {c.final_score}</div>
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">{Object.entries(c.breakdown || {}).map(([k,v])=>`${k}:${v}`).join(' • ')}</div>
      </div>
      <Button size="sm" onClick={() => onAssign(c)}>Assign</Button>
    </div>
  );
}


