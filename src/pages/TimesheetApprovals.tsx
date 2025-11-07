import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Clock, Calendar, User, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";

interface TimesheetEntry {
  id: string;
  work_date: string;
  hours: number;
  description: string;
}

interface Timesheet {
  id: string;
  week_start_date: string;
  week_end_date: string;
  total_hours: number;
  status: string;
  submitted_at: string;
  rejection_reason?: string;
  employee: {
    id: string;
    employee_id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  entries: TimesheetEntry[];
}

export default function TimesheetApprovals() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedTimesheet, setSelectedTimesheet] = useState<Timesheet | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchPendingTimesheets();
    }
  }, [user]);

  const fetchPendingTimesheets = async () => {
    try {
      setLoading(true);
      const data = await api.getPendingTimesheets();
      setTimesheets(data || []);
    } catch (error) {
      console.error("Error fetching pending timesheets:", error);
      toast({
        title: "Error",
        description: "Failed to fetch pending timesheets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (timesheetId: string) => {
    try {
      await api.approveTimesheet(timesheetId, "approve");
      toast({
        title: "Success",
        description: "Timesheet approved successfully",
      });
      fetchPendingTimesheets();
    } catch (error: any) {
      console.error("Error approving timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve timesheet",
        variant: "destructive",
      });
    }
  };

  const handleRejectClick = (timesheet: Timesheet) => {
    setSelectedTimesheet(timesheet);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedTimesheet || !rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.approveTimesheet(selectedTimesheet.id, "reject", rejectionReason.trim());
      toast({
        title: "Success",
        description: "Timesheet rejected",
      });
      setRejectDialogOpen(false);
      setSelectedTimesheet(null);
      setRejectionReason("");
      fetchPendingTimesheets();
    } catch (error: any) {
      console.error("Error rejecting timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject timesheet",
        variant: "destructive",
      });
    }
  };

  const handleReturnClick = (timesheet: Timesheet) => {
    setSelectedTimesheet(timesheet);
    setReturnReason("");
    setReturnDialogOpen(true);
  };

  const handleReturn = async () => {
    if (!selectedTimesheet || !returnReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide feedback for returning",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.approveTimesheet(selectedTimesheet.id, "return", returnReason.trim());
      toast({
        title: "Success",
        description: "Timesheet returned for editing",
      });
      setReturnDialogOpen(false);
      setSelectedTimesheet(null);
      setReturnReason("");
      fetchPendingTimesheets();
    } catch (error: any) {
      console.error("Error returning timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to return timesheet",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-12">Loading pending timesheets...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Timesheet Approvals</h1>
          <p className="text-muted-foreground">Review and approve pending timesheets from your team</p>
        </div>

        {timesheets.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No pending timesheets</p>
              <p className="text-sm text-muted-foreground mt-2">
                All timesheets have been reviewed
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {timesheets.map((timesheet) => (
              <Card key={timesheet.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        {timesheet.employee.first_name} {timesheet.employee.last_name}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Week of {format(parseISO(timesheet.week_start_date), "MMM dd")} -{" "}
                          {format(parseISO(timesheet.week_end_date), "MMM dd, yyyy")}
                        </span>
                        <Badge variant="secondary">
                          {timesheet.total_hours} hours
                        </Badge>
                        <span className="text-xs">
                          Submitted {format(parseISO(timesheet.submitted_at), "MMM dd, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleApprove(timesheet.id)}
                        className="gap-2"
                      >
                        <Check className="h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReturnClick(timesheet)}
                        className="gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Return for Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRejectClick(timesheet)}
                        className="gap-2"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Daily Breakdown</h4>
                      <div className="grid gap-2">
                        {timesheet.entries && timesheet.entries.length > 0 ? (
                          timesheet.entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between p-2 bg-muted rounded-md"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium">
                                  {format(parseISO(entry.work_date), "EEE, MMM dd")}
                                </span>
                                <Badge variant="outline">{entry.hours} hrs</Badge>
                              </div>
                              {entry.description && (
                                <span className="text-sm text-muted-foreground truncate max-w-md">
                                  {entry.description}
                                </span>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No entries</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this timesheet. This will be shared with the employee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTimesheet && (
              <div className="text-sm">
                <p className="font-medium">
                  {selectedTimesheet.employee.first_name} {selectedTimesheet.employee.last_name}
                </p>
                <p className="text-muted-foreground">
                  Week of {format(parseISO(selectedTimesheet.week_start_date), "MMM dd")} -{" "}
                  {format(parseISO(selectedTimesheet.week_end_date), "MMM dd, yyyy")}
                </p>
              </div>
            )}
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectionReason.trim()}>
              Reject Timesheet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return for Edit Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Timesheet for Editing</DialogTitle>
            <DialogDescription>
              Provide feedback to help the employee improve their timesheet. It will be returned to pending status so they can make corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedTimesheet && (
              <div className="text-sm">
                <p className="font-medium">
                  {selectedTimesheet.employee.first_name} {selectedTimesheet.employee.last_name}
                </p>
                <p className="text-muted-foreground">
                  Week of {format(parseISO(selectedTimesheet.week_start_date), "MMM dd")} -{" "}
                  {format(parseISO(selectedTimesheet.week_end_date), "MMM dd, yyyy")}
                </p>
              </div>
            )}
            <Textarea
              placeholder="Provide feedback on what needs to be corrected..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReturn} disabled={!returnReason.trim()}>
              Return for Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

