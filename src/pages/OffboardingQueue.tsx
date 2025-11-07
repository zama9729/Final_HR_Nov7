import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { CheckCircle, XCircle, Clock, FileText, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OffboardingRequest {
  id: string;
  employee_id: string;
  status: string;
  requested_at: string;
  last_working_day: string;
  fnf_pay_date?: string;
  letter_url?: string;
  employee?: {
    employee_id: string;
    department: string;
    position: string;
  };
  employee_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function OffboardingQueue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<OffboardingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await api.getOffboardingRequests();
      setRequests(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'auto_approved': return 'bg-blue-500';
      case 'pending': return 'bg-yellow-500';
      case 'in_review': return 'bg-orange-500';
      case 'denied': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(r => r.status === filter);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Offboarding Queue</h1>
            <p className="text-muted-foreground">Manage employee offboarding requests</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button 
            variant={filter === 'pending' ? 'default' : 'outline'}
            onClick={() => setFilter('pending')}
          >
            Pending
          </Button>
          <Button 
            variant={filter === 'in_review' ? 'default' : 'outline'}
            onClick={() => setFilter('in_review')}
          >
            In Review
          </Button>
          <Button 
            variant={filter === 'approved' ? 'default' : 'outline'}
            onClick={() => setFilter('approved')}
          >
            Approved
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Offboarding Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No requests found
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((request) => (
                  <div 
                    key={request.id} 
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/offboarding/${request.id}`)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">
                          {request.employee_profile?.first_name} {request.employee_profile?.last_name}
                        </h3>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status}
                        </Badge>
                        {request.employee && (
                          <Badge variant="outline">{request.employee.employee_id}</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {request.employee && (
                          <p><span className="font-medium">Department:</span> {request.employee.department}</p>
                        )}
                        <p>
                          <span className="font-medium">Requested:</span> {format(new Date(request.requested_at), 'MMM d, yyyy')}
                        </p>
                        <p>
                          <span className="font-medium">Last Working Day:</span> {format(new Date(request.last_working_day), 'MMM d, yyyy')}
                        </p>
                        {request.fnf_pay_date && (
                          <p>
                            <span className="font-medium">F&F Date:</span> {format(new Date(request.fnf_pay_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {request.letter_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(request.letter_url, '_blank');
                          }}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          View Letter
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/offboarding/${request.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
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

