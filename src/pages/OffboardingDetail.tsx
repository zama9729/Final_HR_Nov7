import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { CheckCircle, XCircle, FileText, Download, CheckCircle2, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface OffboardingRequest {
  id: string;
  employee_id: string;
  status: string;
  requested_at: string;
  last_working_day: string;
  fnf_pay_date?: string;
  letter_url?: string;
  reason?: string;
  survey_json?: any;
  approvals?: any[];
  checklist?: any;
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

export default function OffboardingDetail() {
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [request, setRequest] = useState<OffboardingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [denyDialogOpen, setDenyDialogOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [checklist, setChecklist] = useState({
    leaves_remaining: 0,
    financials_due: 0,
    assets_pending: 0,
    compliance_clear: false,
    finance_clear: false,
    it_clear: false,
    notes: '',
  });

  useEffect(() => {
    if (id) {
      fetchRequest();
    }
  }, [id]);

  const fetchRequest = async () => {
    try {
      setLoading(true);
      const data = await api.getOffboardingRequest(id!);
      setRequest(data);
      if (data.checklist) {
        setChecklist(data.checklist);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      await api.approveOffboarding(id!, comment);
      toast({
        title: "Success",
        description: "Request approved successfully",
      });
      setApproveDialogOpen(false);
      setComment('');
      fetchRequest();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve request",
        variant: "destructive",
      });
    }
  };

  const handleDeny = async () => {
    if (!comment.trim()) {
      toast({
        title: "Error",
        description: "Comment is required for denial",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.denyOffboarding(id!, comment);
      toast({
        title: "Success",
        description: "Request denied successfully",
      });
      setDenyDialogOpen(false);
      setComment('');
      fetchRequest();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to deny request",
        variant: "destructive",
      });
    }
  };

  const handleUpdateChecklist = async () => {
    try {
      await api.updateChecklist(id!, checklist);
      toast({
        title: "Success",
        description: "Checklist updated successfully",
      });
      fetchRequest();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update checklist",
        variant: "destructive",
      });
    }
  };

  const handleGenerateLetter = async () => {
    try {
      const result = await api.generateLetter(id!);
      toast({
        title: "Success",
        description: result.message || "Letter generated successfully",
      });
      fetchRequest();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate letter",
        variant: "destructive",
      });
    }
  };

  const handleFinalize = async () => {
    if (!confirm('Are you sure you want to finalize this offboarding? This will minimize data and move to retention.')) {
      return;
    }

    try {
      await api.finalizeOffboarding(id!);
      toast({
        title: "Success",
        description: "Offboarding finalized successfully",
      });
      navigate('/offboarding');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize offboarding",
        variant: "destructive",
      });
    }
  };

  const canApprove = ['manager', 'hr', 'ceo', 'admin'].includes(userRole || '');
  const canUpdateChecklist = ['hr', 'admin', 'accountant'].includes(userRole || '');
  const canGenerateLetter = ['hr', 'admin'].includes(userRole || '');
  const canFinalize = ['hr', 'admin'].includes(userRole || '');

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!request) {
    return (
      <AppLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Request not found</p>
        </div>
      </AppLayout>
    );
  }

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

  const allApprovalsComplete = request.approvals?.every(a => a.decision === 'approved') || false;
  const checklistComplete = request.checklist && 
    request.checklist.finance_clear && 
    request.checklist.compliance_clear && 
    request.checklist.it_clear && 
    request.checklist.assets_pending === 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Offboarding Request</h1>
            <p className="text-muted-foreground">
              {request.employee_profile?.first_name} {request.employee_profile?.last_name}
            </p>
          </div>
          <Badge className={getStatusColor(request.status)}>
            {request.status}
          </Badge>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Employee Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><span className="font-medium">Employee ID:</span> {request.employee?.employee_id}</p>
              <p><span className="font-medium">Department:</span> {request.employee?.department}</p>
              <p><span className="font-medium">Position:</span> {request.employee?.position}</p>
              <p><span className="font-medium">Email:</span> {request.employee_profile?.email}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p><span className="font-medium">Requested:</span> {format(new Date(request.requested_at), 'MMM d, yyyy')}</p>
              <p><span className="font-medium">Last Working Day:</span> {format(new Date(request.last_working_day), 'MMM d, yyyy')}</p>
              {request.fnf_pay_date && (
                <p><span className="font-medium">F&F Date:</span> {format(new Date(request.fnf_pay_date), 'MMM d, yyyy')}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {request.reason && (
          <Card>
            <CardHeader>
              <CardTitle>Reason for Leaving</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{request.reason}</p>
            </CardContent>
          </Card>
        )}

        {request.survey_json && (
          <Card>
            <CardHeader>
              <CardTitle>Exit Survey</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {request.survey_json.experience_rating && (
                <p><span className="font-medium">Experience Rating:</span> {request.survey_json.experience_rating}/5</p>
              )}
              {request.survey_json.culture_feedback && (
                <div>
                  <p className="font-medium">Culture Feedback:</p>
                  <p className="text-sm text-muted-foreground">{request.survey_json.culture_feedback}</p>
                </div>
              )}
              {request.survey_json.manager_feedback && (
                <div>
                  <p className="font-medium">Manager Feedback:</p>
                  <p className="text-sm text-muted-foreground">{request.survey_json.manager_feedback}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {request.approvals?.map((approval) => (
                <div key={approval.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium capitalize">{approval.role}</p>
                    {approval.approver_profile && (
                      <p className="text-sm text-muted-foreground">
                        {approval.approver_profile.first_name} {approval.approver_profile.last_name}
                      </p>
                    )}
                    {approval.comment && (
                      <p className="text-sm text-muted-foreground mt-1">{approval.comment}</p>
                    )}
                  </div>
                  <div>
                    {approval.decision === 'approved' && (
                      <Badge className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Approved
                      </Badge>
                    )}
                    {approval.decision === 'denied' && (
                      <Badge className="bg-red-500">
                        <XCircle className="h-3 w-3 mr-1" />
                        Denied
                      </Badge>
                    )}
                    {approval.decision === 'pending' && (
                      <Badge className="bg-yellow-500">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canApprove && request.status === 'in_review' && (
              <div className="flex gap-2 mt-4">
                <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Approve Request</DialogTitle>
                      <DialogDescription>Add a comment (optional)</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Comment..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleApprove}>Approve</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={denyDialogOpen} onOpenChange={setDenyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <XCircle className="h-4 w-4 mr-1" />
                      Deny
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Deny Request</DialogTitle>
                      <DialogDescription>Comment is required for denial</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Reason for denial..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        required
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDenyDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDeny} disabled={!comment.trim()}>
                        Deny
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </CardContent>
        </Card>

        {canUpdateChecklist && (
          <Card>
            <CardHeader>
              <CardTitle>Exit Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leaves Remaining</Label>
                  <Input
                    type="number"
                    value={checklist.leaves_remaining}
                    onChange={(e) => setChecklist(prev => ({ ...prev, leaves_remaining: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Financials Due (₹)</Label>
                  <Input
                    type="number"
                    value={checklist.financials_due}
                    onChange={(e) => setChecklist(prev => ({ ...prev, financials_due: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assets Pending</Label>
                  <Input
                    type="number"
                    value={checklist.assets_pending}
                    onChange={(e) => setChecklist(prev => ({ ...prev, assets_pending: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checklist.compliance_clear}
                    onChange={(e) => setChecklist(prev => ({ ...prev, compliance_clear: e.target.checked }))}
                  />
                  <Label>Compliance Clear</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checklist.finance_clear}
                    onChange={(e) => setChecklist(prev => ({ ...prev, finance_clear: e.target.checked }))}
                  />
                  <Label>Finance Clear</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checklist.it_clear}
                    onChange={(e) => setChecklist(prev => ({ ...prev, it_clear: e.target.checked }))}
                  />
                  <Label>IT Clear</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={checklist.notes}
                  onChange={(e) => setChecklist(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                />
              </div>
              <Button onClick={handleUpdateChecklist}>
                Update Checklist
              </Button>
            </CardContent>
          </Card>
        )}

        {canGenerateLetter && allApprovalsComplete && request.status === 'approved' && (
          <Card>
            <CardHeader>
              <CardTitle>Letter Generation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {request.letter_url ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Letter has been generated</p>
                  <Button
                    variant="outline"
                    onClick={() => window.open(request.letter_url, '_blank')}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    View Letter
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Generate experience letter for this employee</p>
                  <Button onClick={handleGenerateLetter}>
                    <FileText className="h-4 w-4 mr-1" />
                    Generate Letter
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {canFinalize && allApprovalsComplete && checklistComplete && request.letter_url && (
          <Card>
            <CardHeader>
              <CardTitle>Finalize Offboarding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                This will minimize data and move employee information to retention. This action cannot be undone.
              </p>
              <Button variant="destructive" onClick={handleFinalize}>
                Finalize Offboarding
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

