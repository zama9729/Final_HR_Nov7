import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Plus, Search, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";

interface BackgroundCheck {
  id: string;
  employee_id: string;
  status: string;
  check_type: string;
  initiated_at: string;
  completed_at: string;
  employee_profile: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function BackgroundChecks() {
  const { toast } = useToast();
  const [checks, setChecks] = useState<BackgroundCheck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChecks();
  }, []);

  const fetchChecks = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/background-checks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setChecks(data || []);
      }
    } catch (error: any) {
      console.error('Error fetching background checks:', error);
      toast({
        title: "Error",
        description: "Failed to load background checks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-yellow-500';
      case 'failed': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Background Checks</h1>
            <p className="text-muted-foreground">Manage employee background checks</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Background Check
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Background Checks</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : checks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No background checks found
              </div>
            ) : (
              <div className="space-y-4">
                {checks.map((check) => (
                  <div key={check.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">
                          {check.employee_profile?.first_name} {check.employee_profile?.last_name}
                        </h3>
                        <Badge className={getStatusColor(check.status)}>
                          {check.status}
                        </Badge>
                        <Badge variant="outline">{check.check_type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Initiated: {format(new Date(check.initiated_at), 'MMM d, yyyy')}
                        {check.completed_at && ` • Completed: ${format(new Date(check.completed_at), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                    <Button size="sm" variant="outline">
                      View Details
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

