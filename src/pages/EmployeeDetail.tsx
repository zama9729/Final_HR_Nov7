import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeeCertificationsEditor from '@/components/EmployeeCertificationsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

export default function EmployeeDetail() {
  const { id } = useParams();
  const { userRole } = useAuth();
  const [myEmployeeId, setMyEmployeeId] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getEmployeeId();
        setMyEmployeeId(me?.id || '');
      } catch {}
    })();
  }, []);

  const canEdit = userRole === 'employee' && myEmployeeId && id === myEmployeeId;
  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-2xl font-bold">Employee Profile</h1>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="certs">Certifications</TabsTrigger>
            <TabsTrigger value="projects">Past Projects</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Basic profile details coming soon.</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="skills">{id && <EmployeeSkillsEditor employeeId={id} canEdit={canEdit} />}</TabsContent>
          <TabsContent value="certs">{id && <EmployeeCertificationsEditor employeeId={id} canEdit={canEdit} />}</TabsContent>
          <TabsContent value="projects">{id && <EmployeePastProjectsEditor employeeId={id} canEdit={canEdit} />}</TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}


