import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle, XCircle, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  employee: {
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
  reviewer?: {
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
  leave_type: {
    name: string;
  } | null;
}

interface LeavePolicy {
  id: string;
  name: string;
  annual_entitlement: number;
}

export default function LeaveRequests() {
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [teamRequests, setTeamRequests] = useState<LeaveRequest[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<LeaveRequest[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<{
    total: number;
    used: number;
    remaining: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const { user, userRole } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch leave policies using API
      try {
        const policiesData = await api.getLeavePolicies();
        setPolicies(policiesData || []);
      } catch (error) {
        console.error("Error fetching leave policies:", error);
        toast({
          title: "Warning",
          description: "Failed to load leave policies",
          variant: "destructive",
        });
      }

      // Fetch leave requests using API
      const requestsData = await api.getLeaveRequests();
      setMyRequests(requestsData.myRequests || []);
      setTeamRequests(requestsData.teamRequests || []);
      setApprovedRequests(requestsData.approvedRequests || []);

      // Fetch leave balance for real-time view
      try {
        const balance = await api.getLeaveBalance();
        const remaining = balance.leaveBalance || 0;
        const used = balance.approvedLeaves || 0;
        const total = balance.totalLeaves || remaining + used;
        setLeaveBalance({
          total,
          used,
          remaining: Math.max(0, remaining),
        });
      } catch (error) {
        console.error("Error fetching leave balance for leave page:", error);
      }
    } catch (error: any) {
      console.error("Error fetching leave requests:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load leave requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    try {
      await api.approveLeaveRequest(requestId);
      toast({ title: "Success", description: "Leave request approved" });
      fetchData();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to approve request", 
        variant: "destructive" 
      });
    }
  };

  const handleReject = async (requestId: string, reason: string) => {
    try {
      await api.rejectLeaveRequest(requestId, reason);
      toast({ title: "Success", description: "Leave request rejected" });
      fetchData();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reject request", 
        variant: "destructive" 
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!selectedPolicyId) {
      toast({
        title: "Error",
        description: "Please select a leave type",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData(e.currentTarget);

    try {
      await api.createLeaveRequest({
        leave_type_id: selectedPolicyId,
        start_date: formData.get("start_date") as string,
        end_date: formData.get("end_date") as string,
        reason: (formData.get("reason") as string) || undefined,
      });

      toast({ title: "Success", description: "Leave request submitted" });
      setDialogOpen(false);
      setSelectedPolicyId("");
      fetchData();
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to submit leave request", 
        variant: "destructive" 
      });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-12">Loading leave requests...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leave Requests</h1>
            <p className="text-muted-foreground">Manage leave applications and approvals</p>
          </div>
          {leaveBalance && (
            <Card className="min-w-[260px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">My Leave Balance</CardTitle>
                <CardDescription>Real-time approved leave usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-2xl font-bold">
                      {leaveBalance.remaining} <span className="text-sm font-normal text-muted-foreground">days remaining</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {leaveBalance.used} used · {leaveBalance.total} total
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs defaultValue={userRole && ["manager", "hr", "director", "ceo"].includes(userRole) ? "pending" : "my-requests"}>
          <TabsList>
            {userRole && ["manager", "hr", "director", "ceo"].includes(userRole) && (
              <>
                <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
                <TabsTrigger value="approved">Approved Requests</TabsTrigger>
              </>
            )}
            <TabsTrigger value="my-requests">My Requests</TabsTrigger>
          </TabsList>

          {userRole && ["manager", "hr", "director", "ceo"].includes(userRole) && (
            <TabsContent value="pending" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Pending Approvals</CardTitle>
                  <CardDescription>Review and approve team leave requests</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {teamRequests.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No pending leave requests</p>
                    </div>
                  ) : (
                    teamRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 hover-lift transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Calendar className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {request.employee?.profiles?.first_name || "Unknown"} {request.employee?.profiles?.last_name || "Employee"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.total_days} days • {request.leave_type?.name || "General Leave"}
                            </p>
                            {request.reason && <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reason = prompt("Enter rejection reason:");
                              if (reason) handleReject(request.id, reason);
                            }}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button size="sm" onClick={() => handleApprove(request.id)}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {userRole && ["manager", "hr", "director", "ceo"].includes(userRole) && (
            <TabsContent value="approved" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Approved Requests</CardTitle>
                  <CardDescription>Team leave requests that have been approved</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {approvedRequests.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <p>No approved leave requests</p>
                    </div>
                  ) : (
                    approvedRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 hover-lift transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {request.employee?.profiles?.first_name || "Unknown"} {request.employee?.profiles?.last_name || "Employee"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.total_days} days • {request.leave_type?.name || "General Leave"}
                            </p>
                            {request.reason && <p className="text-xs text-muted-foreground mt-1">{request.reason}</p>}
                          </div>
                        </div>
                        <Badge variant="default">Approved</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="my-requests" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>My Leave Requests</CardTitle>
                    <CardDescription>Your leave request history</CardDescription>
                  </div>
                  <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setSelectedPolicyId("");
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        New Request
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Submit Leave Request</DialogTitle>
                        <CardDescription>
                          Select your leave type and dates. Approved requests will immediately update your leave balance.
                        </CardDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                          <Label htmlFor="leave_type_id">Leave Type</Label>
                          {policies.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-2">
                              No leave policies available. Please contact HR to set up leave policies.
                            </p>
                          ) : (
                            <Select 
                              value={selectedPolicyId} 
                              onValueChange={setSelectedPolicyId}
                              required
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select leave type" />
                              </SelectTrigger>
                              <SelectContent>
                                {policies.map((policy) => (
                                  <SelectItem key={policy.id} value={policy.id}>
                                    {policy.name} ({policy.annual_entitlement} days/year)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="start_date">Start Date</Label>
                          <Input type="date" name="start_date" required />
                        </div>
                        <div>
                          <Label htmlFor="end_date">End Date</Label>
                          <Input type="date" name="end_date" required />
                        </div>
                        <div>
                          <Label htmlFor="reason">Reason</Label>
                          <Textarea name="reason" placeholder="Optional" />
                        </div>
                        <Button type="submit" className="w-full">Submit Request</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {myRequests.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No leave requests yet</p>
                    <p className="text-sm mt-2">Submit your first leave request to get started</p>
                  </div>
                ) : (
                  myRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {request.total_days} days • {request.leave_type?.name || "General Leave"}
                          </p>
                          {request.status === "approved" && request.reviewer?.profiles && (
                            <p className="text-xs text-muted-foreground">
                              Approved by {request.reviewer.profiles.first_name} {request.reviewer.profiles.last_name}
                            </p>
                          )}
                          {request.status === "rejected" && (
                            <p className="text-xs text-destructive">{request.rejection_reason}</p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={
                          request.status === "approved"
                            ? "default"
                            : request.status === "rejected"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {request.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
