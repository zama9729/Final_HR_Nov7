import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

interface ProfileChangeRequest {
  id: string;
  employee_id: string;
  changed_fields: Record<string, any>;
  status: string;
  reason?: string;
  employee_profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  created_at: string;
}

export default function HrProfileRequests() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ProfileChangeRequest | null>(null);
  const [note, setNote] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await api.get("/api/employees/profile/requests");
      setRequests(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch profile change requests",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleOpenRequest = (request: ProfileChangeRequest) => {
    setSelectedRequest(request);
    setNote("");
    setIsDialogOpen(true);
  };

  const handleReview = async (action: "approve" | "deny") => {
    if (!selectedRequest) return;
    try {
      setActionLoading(true);
      await api.request(`/api/employees/profile/requests/${selectedRequest.id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, note }),
      });
      toast({
        title: `Request ${action}d`,
        description: "The employee will be notified.",
      });
      setIsDialogOpen(false);
      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to review request",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const renderChangedFields = (fields: Record<string, any>) => {
    return Object.entries(fields).map(([key, value]) => (
      <div key={key} className="border rounded p-2 text-sm">
        <p className="font-medium">{key}</p>
        <p className="text-muted-foreground">{String(value)}</p>
      </div>
    ));
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Change Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">Loading requests...</div>
            ) : requests.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">No requests found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Requested Changes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div className="font-medium">
                          {req.employee_profile?.first_name} {req.employee_profile?.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{req.employee_profile?.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {Object.keys(req.changed_fields || {}).join(", ")}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{req.status}</TableCell>
                      <TableCell>{new Date(req.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => handleOpenRequest(req)}>
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Profile Change</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Requested Fields</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {renderChangedFields(selectedRequest.changed_fields || {})}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Reviewer Note</label>
                  <Textarea
                    placeholder="Optional note to include with this decision"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleReview("deny")}
                    disabled={actionLoading}
                  >
                    Deny
                  </Button>
                  <Button onClick={() => handleReview("approve")} disabled={actionLoading}>
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}



