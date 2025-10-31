import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Skill = { name: string; min_level: number };

export default function MultiSelectSkills({ value, onChange }: { value: Skill[]; onChange: (v: Skill[]) => void }) {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState(3);
  const suggestions = ['React', 'Node.js', 'PostgreSQL', 'AWS', 'Python', 'TypeScript', 'Kubernetes'];
  const filtered = suggestions.filter(s => s.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  const add = (name: string) => {
    if (!name) return;
    onChange([...(value || []), { name, min_level: level }]);
    setQuery(''); setLevel(3);
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <Input placeholder="Skill name" value={query} onChange={e => setQuery(e.target.value)} />
        <Input type="number" className="w-24" value={level} onChange={e => setLevel(Number(e.target.value))} />
        <Button variant="secondary" onClick={() => add(query)}>Add</Button>
      </div>
      {query && (
        <div className="border rounded p-2 text-xs">
          <div className="mb-1 text-muted-foreground">Suggestions</div>
          <div className="flex gap-2 flex-wrap">
            {filtered.map((s) => (
              <button key={s} className="px-2 py-1 border rounded hover:bg-muted" onClick={() => add(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 flex-wrap text-sm">
        {(value || []).map((s, idx) => (
          <span key={idx} className="px-2 py-1 rounded border bg-card">
            {s.name} (≥{s.min_level})
            <button className="ml-2 text-muted-foreground" onClick={() => remove(idx)}>×</button>
          </span>
        ))}
      </div>
    </div>
  );
}


