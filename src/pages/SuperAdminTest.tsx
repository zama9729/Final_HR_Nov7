import { useAuth } from '@/contexts/AuthContext';
import { SuperAdminDebug } from '@/components/superadmin/SuperAdminDebug';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function SuperAdminTest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Super Admin Access Test</h1>
        <SuperAdminDebug />
        <div className="mt-4">
          <Button onClick={() => navigate('/superadmin')}>
            Try Accessing Super Admin Dashboard
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

