import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';

export default function CEODashboard() {
  return (
    <AppLayout>
      <div className="max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold">CEO Staffing Dashboard</h1>
        <Card>
          <CardHeader><CardTitle>Next steps</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Create a project and run suggestions.</div>
            <div>
              <Link to="/projects/new" className="underline">Create Project</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


