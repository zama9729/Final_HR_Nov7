import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { CheckCircle2, XCircle, Clock, AlertCircle, Download, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface BackgroundCheckPanelProps {
  employeeId: string;
}

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  document_status: string;
  verification_status: string;
  hr_comment: string | null;
  is_required: boolean;
  uploaded_at: string;
  uploaded_by: any;
  verified_by: any;
  verified_at: string | null;
  download_url: string | null;
}

interface BackgroundCheck {
  id: string;
  employee_id: string;
  status: string;
  has_prior_background_check: boolean;
  prior_bg_check_verified_by: string | null;
  prior_bg_check_verified_at: string | null;
  prior_bg_check_notes: string | null;
  initiated_at: string;
  completed_at: string | null;
  notes: string | null;
}

export function BackgroundCheckPanel({ employeeId }: BackgroundCheckPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [backgroundCheck, setBackgroundCheck] = useState<BackgroundCheck | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [statusCounts, setStatusCounts] = useState({ pending: 0, approved: 0, hold: 0, completed: 0 });
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'hold' | null>(null);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [priorBgCheckVerified, setPriorBgCheckVerified] = useState(false);
  const [priorBgCheckNotes, setPriorBgCheckNotes] = useState('');

  useEffect(() => {
    fetchBackgroundCheck();
  }, [employeeId]);

  const fetchBackgroundCheck = async () => {
    try {
      setLoading(true);
      const response = await api.customRequest(`/api/onboarding/${employeeId}/background-check`);
      setBackgroundCheck(response.background_check);
      setDocuments(response.documents || []);
      setStatusCounts(response.status_counts || { pending: 0, approved: 0, hold: 0, completed: 0 });
    } catch (error: any) {
      console.error('Error fetching background check:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load background check',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (doc: Document) => {
    setSelectedDoc(doc);
    setActionType('approve');
    setComment(doc.hr_comment || '');
    setActionDialogOpen(true);
  };

  const handleHold = (doc: Document) => {
    setSelectedDoc(doc);
    setActionType('hold');
    setComment('');
    setActionDialogOpen(true);
  };

  const handleActionSubmit = async () => {
    if (!selectedDoc || !actionType) return;
    
    if (actionType === 'hold' && !comment.trim()) {
      toast({
        title: 'Comment required',
        description: 'Please provide a reason for putting this document on hold',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      const endpoint = actionType === 'approve' 
        ? `/api/onboarding/${employeeId}/background-check/documents/${selectedDoc.id}/approve`
        : `/api/onboarding/${employeeId}/background-check/documents/${selectedDoc.id}/hold`;
      
      await api.customRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() || null }),
      });

      toast({
        title: 'Success',
        description: `Document ${actionType === 'approve' ? 'approved' : 'put on hold'} successfully`,
      });

      setActionDialogOpen(false);
      setSelectedDoc(null);
      setActionType(null);
      setComment('');
      fetchBackgroundCheck();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || `Failed to ${actionType} document`,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async () => {
    if (priorBgCheckVerified && !priorBgCheckNotes.trim()) {
      toast({
        title: 'Notes required',
        description: 'Please provide notes when marking prior background check as verified',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      await api.customRequest(`/api/onboarding/${employeeId}/background-check/complete`, {
        method: 'POST',
        body: JSON.stringify({
          prior_bg_check_verified: priorBgCheckVerified,
          notes: priorBgCheckNotes.trim() || null,
        }),
      });

      toast({
        title: 'Success',
        description: 'Background check marked as completed',
      });

      setCompleteDialogOpen(false);
      setPriorBgCheckVerified(false);
      setPriorBgCheckNotes('');
      fetchBackgroundCheck();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete background check',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'HOLD':
        return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" />On Hold</Badge>;
      case 'REJECTED':
        return <Badge className="bg-red-500"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getBgCheckStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'ON_HOLD':
        return <Badge className="bg-yellow-500">On Hold</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-500">In Progress</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-2">Loading background check...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Background Check Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Background Check Status</CardTitle>
              {backgroundCheck && (
                <div className="mt-2">
                  {getBgCheckStatusBadge(backgroundCheck.status)}
                </div>
              )}
            </div>
            {backgroundCheck && backgroundCheck.status !== 'COMPLETED' && (
              <Button onClick={() => setCompleteDialogOpen(true)} variant="outline">
                Mark as Complete
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {backgroundCheck && (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-blue-600">{statusCounts.pending}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{statusCounts.approved}</p>
              </div>
              <div>
                <p className="text-muted-foreground">On Hold</p>
                <p className="text-2xl font-bold text-yellow-600">{statusCounts.hold}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{statusCounts.completed}</p>
              </div>
            </div>
          )}
          {backgroundCheck?.has_prior_background_check && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm font-medium">Prior Background Check Verified</p>
              <p className="text-xs text-muted-foreground mt-1">
                Verified by: {backgroundCheck.prior_bg_check_verified_by} on{' '}
                {backgroundCheck.prior_bg_check_verified_at 
                  ? new Date(backgroundCheck.prior_bg_check_verified_at).toLocaleDateString()
                  : 'N/A'}
              </p>
              {backgroundCheck.prior_bg_check_notes && (
                <p className="text-xs text-muted-foreground mt-1">
                  Notes: {backgroundCheck.prior_bg_check_notes}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No documents uploaded yet
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{doc.file_name}</span>
                        {doc.is_required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                        {getStatusBadge(doc.verification_status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Type: {doc.document_type} • 
                        Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                      {doc.hr_comment && (
                        <p className="text-sm mt-2 p-2 bg-muted rounded">
                          <strong>Comment:</strong> {doc.hr_comment}
                        </p>
                      )}
                      {doc.verified_by && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Verified by: {doc.verified_by.first_name} {doc.verified_by.last_name} on{' '}
                          {doc.verified_at ? new Date(doc.verified_at).toLocaleDateString() : 'N/A'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.download_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(doc.download_url!, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {doc.verification_status === 'PENDING' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(doc)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleHold(doc)}
                          >
                            Hold
                          </Button>
                        </>
                      )}
                      {doc.verification_status === 'HOLD' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(doc)}
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Document' : 'Put Document on Hold'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' 
                ? 'Approve this document for background check. You can add an optional comment.'
                : 'Put this document on hold and request clarification from the candidate. A comment is required.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document</Label>
              <p className="text-sm font-medium">{selectedDoc?.file_name}</p>
            </div>
            <div>
              <Label htmlFor="comment">
                Comment {actionType === 'hold' && '(Required)'}
              </Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === 'approve' 
                  ? 'Optional comment...'
                  : 'Reason for putting on hold...'}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleActionSubmit} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                actionType === 'approve' ? 'Approve' : 'Put on Hold'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Background Check</DialogTitle>
            <DialogDescription>
              Mark this background check as completed. If the candidate has a prior background check, you can verify it here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="priorBgCheck"
                checked={priorBgCheckVerified}
                onChange={(e) => setPriorBgCheckVerified(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="priorBgCheck">Candidate has prior background check verified</Label>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={priorBgCheckNotes}
                onChange={(e) => setPriorBgCheckNotes(e.target.value)}
                placeholder="Optional notes about the background check completion..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleComplete} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Complete Background Check'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
