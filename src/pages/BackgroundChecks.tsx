import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Plus, FileText, Loader2, Download, CheckCircle2, AlertCircle, Clock, PauseCircle, XCircle, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BackgroundCheck {
  id: string;
  employee_id?: string;
  type: string;
  status: string;
  created_at: string;
  completed_at?: string;
  employee_profile?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface BackgroundCheckAttachment {
  id: string;
  document_type: string;
  file_name: string;
  mime_type?: string;
  file_size?: number;
  status?: string;
  decision?: string;
  notes?: string;
  download_url?: string | null;
  uploaded_at?: string;
  verified_by?: string | null;
  verified_at?: string | null;
}

interface BackgroundCheckReport extends BackgroundCheck {
  result_summary?: Record<string, any>;
  events?: {
    id: string;
    event_type: string;
    actor?: string;
    created_at: string;
    note?: string;
  }[];
  attachments?: BackgroundCheckAttachment[];
}

interface EmployeeOption {
  id: string;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department?: string;
}

const statusClass = (status: string) => {
  switch (status) {
    case "completed_green":
      return "bg-emerald-500";
    case "completed_amber":
      return "bg-amber-500 text-black";
    case "completed_red":
      return "bg-red-500";
    case "in_progress":
      return "bg-blue-500";
    case "vendor_delay":
      return "bg-yellow-500 text-black";
    default:
      return "bg-gray-500";
  }
};

export default function BackgroundChecks() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checks, setChecks] = useState<BackgroundCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [checkType, setCheckType] = useState("prehire");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [scopeJson, setScopeJson] = useState('{"identity":true,"employment":true,"criminal":true}');
  const [consentText, setConsentText] = useState(
    "I authorise the employer to obtain identity, employment and criminal background information for lawful employment decisions."
  );
  const [consentIp, setConsentIp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<BackgroundCheckReport | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<BackgroundCheckAttachment | null>(null);
  const [attachmentAction, setAttachmentAction] = useState<"approve" | "hold" | "unhold" | null>(null);
  const [attachmentComment, setAttachmentComment] = useState("");
  const [attachmentProcessing, setAttachmentProcessing] = useState(false);
  const [onboardingCounts, setOnboardingCounts] = useState({ total: 0, notStarted: 0, inProgress: 0, completed: 0 });

  useEffect(() => {
    fetchChecks();
  }, []);

  useEffect(() => {
    fetchOnboardingCounts();
  }, []);

  useEffect(() => {
    if (dialogOpen && employees.length === 0 && !employeesLoading) {
      fetchEmployees();
    }
  }, [dialogOpen]);

  const fetchChecks = async () => {
    try {
      setLoading(true);
      const data = await api.getBackgroundChecks();
      setChecks(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load background checks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOnboardingCounts = async () => {
    try {
      const data = await api.getOnboardingEmployees();
      if (Array.isArray(data)) {
        const notStarted = data.filter((item: any) => ['not_started', 'pending'].includes(item.onboarding_status)).length;
        const inProgress = data.filter((item: any) => item.onboarding_status === 'in_progress').length;
        const completed = data.filter((item: any) => item.onboarding_status === 'completed').length;
        setOnboardingCounts({
          total: data.length,
          notStarted,
          inProgress,
          completed,
        });
      } else {
        setOnboardingCounts({ total: 0, notStarted: 0, inProgress: 0, completed: 0 });
      }
    } catch (error) {
      console.error('Error fetching onboarding counts:', error);
      setOnboardingCounts({ total: 0, notStarted: 0, inProgress: 0, completed: 0 });
    }
  };

  const fetchEmployees = async () => {
    try {
      setEmployeesLoading(true);
      const data = await api.getEmployees();
      const list = Array.isArray(data) ? data : data?.employees || [];
      setEmployees(list);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to load employees",
        variant: "destructive",
      });
    } finally {
      setEmployeesLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const term = employeeSearch.toLowerCase();
    return employees.filter((emp) => {
      const name = `${emp.first_name || ""} ${emp.last_name || ""}`.toLowerCase();
      return (
        name.includes(term) ||
        emp.email?.toLowerCase().includes(term) ||
        emp.employee_id?.toLowerCase().includes(term)
      );
    });
  }, [employees, employeeSearch]);

  const resetForm = () => {
    setSelectedEmployee("");
    setCheckType("prehire");
    setProvider("");
    setNotes("");
    setScopeJson('{"identity":true,"employment":true,"criminal":true}');
    setConsentIp("");
    setConsentText(
      "I authorise the employer to obtain identity, employment and criminal background information for lawful employment decisions."
    );
    setEmployeeSearch("");
  };

  const handleCreate = async () => {
    if (!selectedEmployee) {
      toast({
        title: "Select employee",
        description: "Choose an employee to continue.",
        variant: "destructive",
      });
      return;
    }
    let parsedScope: any = undefined;
    if (scopeJson.trim()) {
      try {
        parsedScope = JSON.parse(scopeJson);
      } catch (error) {
        toast({
          title: "Invalid scope JSON",
          description: "Please provide valid JSON.",
          variant: "destructive",
        });
        return;
      }
    }
    try {
      setSubmitting(true);
      await api.createBackgroundCheck({
        employee_id: selectedEmployee,
        type: checkType as any,
        vendor_id: provider || undefined,
        notes: notes || undefined,
        scope: parsedScope,
        consent: {
          text: consentText,
          ip_address: consentIp || undefined,
          captured: new Date().toISOString(),
        },
      });
      toast({
        title: "Background check created",
        description: "Consent snapshot saved and vendor notified.",
      });
      setDialogOpen(false);
      resetForm();
      fetchChecks();
    } catch (error: any) {
      toast({
        title: "Failed to create check",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (size?: number | null) => {
    if (!size || size <= 0) return "";
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const statusSummary = useMemo(() => {
    return checks.reduce(
      (acc, check) => {
        const status = (check.status || '').toLowerCase();
        switch (status) {
          case 'pending':
            acc.pending += 1;
            break;
          case 'in_progress':
          case 'vendor_delay':
          case 'completed_amber':
          case 'completed_green':
            acc.inProgress += 1;
            break;
          case 'on_hold':
            acc.onHold += 1;
            break;
          case 'failed':
          case 'rejected':
          case 'completed_red':
          case 'cancelled':
            acc.rejected += 1;
            break;
          default:
            break;
        }
        return acc;
      },
      { pending: 0, inProgress: 0, onHold: 0, rejected: 0 }
    );
  }, [checks]);

  const onboardingActiveCount = onboardingCounts.notStarted + onboardingCounts.inProgress;

  const getAttachmentStatusBadge = (status?: string | null) => {
    const normalized = (status || "PENDING").toUpperCase();
    switch (normalized) {
      case "APPROVED":
        return (
          <Badge className="bg-emerald-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "HOLD":
        return (
          <Badge className="bg-amber-500 text-black">
            <AlertCircle className="h-3 w-3 mr-1" />
            On Hold
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const handleAttachmentAction = (attachment: BackgroundCheckAttachment, action: "approve" | "hold" | "unhold") => {
    setSelectedAttachment(attachment);
    setAttachmentAction(action);
    setAttachmentComment(action === "hold" ? "" : attachment.notes || "");
    setAttachmentDialogOpen(true);
  };

  const submitAttachmentAction = async () => {
    if (!selectedAttachment || !attachmentAction || !report?.employee_id || !activeReportId) {
      return;
    }

    if (attachmentAction === "hold" && !attachmentComment.trim()) {
      toast({
        title: "Comment required",
        description: "Please add a note when placing a document on hold.",
        variant: "destructive",
      });
      return;
    }

    try {
      setAttachmentProcessing(true);
      const endpoint =
        `/api/onboarding/${report.employee_id}/background-check/documents/${selectedAttachment.id}/` +
        (attachmentAction === "approve"
          ? "approve"
          : attachmentAction === "unhold"
          ? "unhold"
          : "hold");

      await api.customRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ comment: attachmentComment.trim() || null }),
      });

      toast({
        title: "Updated",
        description:
          attachmentAction === "approve"
            ? "Document approved."
            : attachmentAction === "hold"
            ? "Document placed on hold."
            : "Document moved back to pending.",
      });

      setAttachmentDialogOpen(false);
      setSelectedAttachment(null);
      setAttachmentAction(null);
      setAttachmentComment("");
      fetchReport(activeReportId);
    } catch (error: any) {
      toast({
        title: "Unable to update",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAttachmentProcessing(false);
    }
  };

  const fetchReport = async (id: string) => {
    try {
      setReportLoading(true);
      const result = await api.getBackgroundCheckReport(id, { legacy: true });
      setReport(result);
    } catch (error: any) {
      toast({
        title: "Unable to fetch report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
      setActiveReportId(null);
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const openReport = (id: string) => {
    setActiveReportId(id);
    fetchReport(id);
  };

  const closeReport = () => {
    setActiveReportId(null);
    setReport(null);
    setAttachmentDialogOpen(false);
    setSelectedAttachment(null);
    setAttachmentAction(null);
    setAttachmentComment("");
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Background Checks</h1>
            <p className="text-muted-foreground">
              Capture consent, invoke vendors, and review red/amber/green outcomes for India-compliant hiring.
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Background Check
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card className="shadow-sm border-blue-100 bg-blue-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-900">{statusSummary.pending}</p>
              <p className="text-xs text-muted-foreground">Awaiting HR review</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-indigo-100 bg-indigo-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-indigo-700 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-indigo-900">{statusSummary.inProgress}</p>
              <p className="text-xs text-muted-foreground">Vendor or HR in progress</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-amber-100 bg-amber-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <PauseCircle className="h-4 w-4" />
                On Hold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-900">{statusSummary.onHold}</p>
              <p className="text-xs text-muted-foreground">Waiting for clarifications</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-rose-100 bg-rose-50/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-rose-700 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-rose-900">{statusSummary.rejected}</p>
              <p className="text-xs text-muted-foreground">Failed / adverse outcomes</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-emerald-100 bg-emerald-50/60">
            <CardHeader className="pb-2 flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-emerald-700 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Onboarding
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/onboarding-tracker')}>
                View
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-900">{onboardingActiveCount}</p>
              <p className="text-xs text-muted-foreground">
                Total onboarding ({onboardingCounts.total} overall)
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Verifications</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-10 text-muted-foreground">Loading records…</div>
            ) : checks.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No background checks yet.</div>
            ) : (
              <div className="space-y-4">
                {checks.map((check) => (
                  <div key={check.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {check.employee_profile
                            ? `${check.employee_profile.first_name} ${check.employee_profile.last_name}`
                            : "Candidate"}
                        </h3>
                        <Badge className={`${statusClass(check.status)} text-white capitalize`}>
                          {check.status.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline">{check.type}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Initiated: {format(new Date(check.created_at), "dd MMM yyyy")}
                        {check.completed_at && ` • Completed: ${format(new Date(check.completed_at), "dd MMM yyyy")}`}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openReport(check.id)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View report
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Start Background Check</DialogTitle>
            <DialogDescription>
              Consent, scope, and vendor metadata are saved for legal defensibility and adverse action workflows.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Search Employee</Label>
              <Input
                placeholder="Search by name, email or employee ID"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
              />
              <div className="rounded-md border h-40">
                <ScrollArea className="h-40">
                  {employeesLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">Loading employees…</div>
                  ) : filteredEmployees.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">No matches</div>
                  ) : (
                    <div className="divide-y">
                      {filteredEmployees.map((emp) => {
                        const value = emp.id;
                        const isActive = value === selectedEmployee;
                        return (
                          <button
                            key={emp.id}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${
                              isActive ? "bg-muted" : ""
                            }`}
                            onClick={() => setSelectedEmployee(value)}
                          >
                            <div className="font-medium">
                              {emp.first_name} {emp.last_name}{" "}
                              {emp.employee_id && (
                                <span className="text-muted-foreground">· {emp.employee_id}</span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{emp.email}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Check Type</Label>
              <Select value={checkType} onValueChange={setCheckType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prehire">Pre-hire</SelectItem>
                  <SelectItem value="rehire">Rehire</SelectItem>
                  <SelectItem value="periodic">Periodic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vendor / Provider (optional)</Label>
              <Input
                placeholder="Vendor or BGV partner name"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={3}
                placeholder="Scope exceptions, SLA reminders, contact escalation, etc."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Consent Text</Label>
              <Textarea
                rows={4}
                value={consentText}
                onChange={(event) => setConsentText(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored with timestamp for fairness + DPDP compliance.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Consent IP / Location Token</Label>
              <Input
                placeholder="Optional IP address"
                value={consentIp}
                onChange={(event) => setConsentIp(event.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Scope JSON</Label>
              <Textarea
                rows={4}
                value={scopeJson}
                onChange={(event) => setScopeJson(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Example: {"{\"identity\":true,\"employment\":true,\"criminal\":true,\"education\":false}"}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !selectedEmployee}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create background check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(activeReportId)}
        onOpenChange={(open) => {
          if (!open) closeReport();
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Background Check Report</DialogTitle>
            <DialogDescription>Timeline of actions and every document submitted for this check.</DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading report…</div>
          ) : report ? (
            <div className="grid gap-6 md:grid-cols-[1fr,1.3fr] max-h-[75vh] overflow-y-auto pr-1">
              <div className="space-y-4">
                <div className="rounded border bg-muted/30 p-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">
                      {report.employee_profile
                        ? `${report.employee_profile.first_name} ${report.employee_profile.last_name}`
                        : "Candidate"}
                    </h3>
                    <Badge className={`${statusClass(report.status)} text-white capitalize`}>
                      {report.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline">{report.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Initiated: {format(new Date(report.created_at), "dd MMM yyyy")}
                    {report.completed_at && ` • Completed: ${format(new Date(report.completed_at), "dd MMM yyyy")}`}
                  </p>
                </div>

                {report.result_summary && (
                  <div className="rounded border bg-muted/40 p-3 text-xs">
                    <p className="text-[10px] tracking-wide text-muted-foreground uppercase mb-1">Result summary</p>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(report.result_summary, null, 2)}</pre>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Timeline</span>
                    <span className="text-xs text-muted-foreground">
                      {report.events?.length ? `${report.events.length} entries` : "No events"}
                    </span>
                  </div>
                  <ScrollArea className="max-h-[280px] rounded border bg-background">
                    <div className="p-3 text-sm space-y-3">
                      {report.events && report.events.length > 0 ? (
                        report.events.map((event) => (
                          <div key={event.id} className="border-l-2 border-primary/60 pl-3">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-semibold">{event.event_type}</span>
                              <span>{format(new Date(event.created_at), "dd MMM yyyy HH:mm")}</span>
                            </div>
                            {event.note && <p className="mt-1 text-sm">{event.note}</p>}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-sm text-center py-6">No events recorded.</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Documents</span>
                  <span className="text-xs text-muted-foreground">
                    {report.attachments?.length ? `${report.attachments.length} files` : "No files"}
                  </span>
                </div>
                {report.attachments && report.attachments.length > 0 ? (
                  <ScrollArea className="max-h-[65vh] pr-2">
                    <div className="space-y-3">
                      {report.attachments.map((doc, index) => {
                        const decision = (doc.decision || doc.status || "pending").toUpperCase();
                        const canAct = !!report.employee_id && (decision === "PENDING" || decision === "HOLD");

                        return (
                          <div key={doc.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold">
                                  {index + 1}. {doc.file_name || "Unnamed file"}
                                </p>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                    {doc.document_type}
                                  </Badge>
                                  <span>{doc.uploaded_at ? format(new Date(doc.uploaded_at), "dd MMM yyyy") : "Unknown"}</span>
                                  {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {getAttachmentStatusBadge(decision)}
                                {doc.download_url && (
                                  <Button variant="ghost" size="icon" onClick={() => window.open(doc.download_url!, "_blank")}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {doc.notes && (
                              <p className="text-xs text-muted-foreground bg-background rounded px-2 py-1">
                                Comment: {doc.notes}
                              </p>
                            )}
                            {canAct && (
                              <div className="flex flex-wrap gap-2">
                                {decision === "HOLD" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAttachmentAction(doc, "unhold")}
                                  >
                                    Unhold
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAttachmentAction(doc, "approve")}
                                >
                                  Approve
                                </Button>
                                {decision === "PENDING" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAttachmentAction(doc, "hold")}
                                  >
                                    Hold
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="rounded border bg-muted/20 p-4 text-sm text-muted-foreground">
                    No documents have been linked to this background check.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">Select a background check to view details.</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeReport}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={attachmentDialogOpen}
        onOpenChange={(open) => {
          setAttachmentDialogOpen(open);
          if (!open) {
            setSelectedAttachment(null);
            setAttachmentAction(null);
            setAttachmentComment("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {attachmentAction === "approve"
                ? "Approve document"
                : attachmentAction === "unhold"
                ? "Move document back to pending"
                : "Put document on hold"}
            </DialogTitle>
            <DialogDescription>
              {attachmentAction === "approve"
                ? "Confirm this document looks good. You can leave an optional note."
                : attachmentAction === "unhold"
                ? "Move this document from On Hold back to Pending so it can be reviewed again."
                : "Share why this document needs clarification. The candidate will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Document</Label>
              <p className="text-sm font-medium">{selectedAttachment?.file_name || selectedAttachment?.document_type}</p>
            </div>
            <div>
              <Label htmlFor="attachment-comment">
                Comment {attachmentAction === "hold" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="attachment-comment"
                rows={4}
                value={attachmentComment}
                onChange={(event) => setAttachmentComment(event.target.value)}
                placeholder={attachmentAction === "hold" ? "Explain what needs to be fixed…" : "Add an optional note…"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachmentDialogOpen(false)} disabled={attachmentProcessing}>
              Cancel
            </Button>
            <Button onClick={submitAttachmentAction} disabled={attachmentProcessing}>
              {attachmentProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {attachmentAction === "approve"
                ? "Approve"
                : attachmentAction === "unhold"
                ? "Unhold"
                : "Hold"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
