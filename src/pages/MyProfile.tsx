import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmployeeSkillsEditor from '@/components/EmployeeSkillsEditor';
import EmployeeCertificationsEditor from '@/components/EmployeeCertificationsEditor';
import EmployeePastProjectsEditor from '@/components/EmployeePastProjectsEditor';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MyProfile() {
  const [employeeId, setEmployeeId] = useState<string>('');
  useEffect(() => { (async()=>{ try { const me = await api.getEmployeeId(); setEmployeeId(me?.id || ''); } catch {} })(); }, []);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <Tabs defaultValue="skills">
          <TabsList>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="certs">Certifications</TabsTrigger>
            <TabsTrigger value="projects">Past Projects</TabsTrigger>
          </TabsList>
          <TabsContent value="skills">{employeeId && <EmployeeSkillsEditor employeeId={employeeId} canEdit />}</TabsContent>
          <TabsContent value="certs">{employeeId && <EmployeeCertificationsEditor employeeId={employeeId} canEdit />}</TabsContent>
          <TabsContent value="projects">{employeeId && <EmployeePastProjectsEditor employeeId={employeeId} canEdit />}</TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}


