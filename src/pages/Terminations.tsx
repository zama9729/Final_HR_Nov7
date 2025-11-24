import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FileText, Loader2, ShieldCheck, UserCheck, UserX } from "lucide-react";

type StageKey = "initiated" | "manager_review" | "hr_review" | "legal_review" | "payroll_hold" | "completed" | "rejected";

interface TerminationRecord {
  id: string;
  employee_id: string;
  type: string;
  status: StageKey | string;
  proposed_lwd?: string;
  settlement_amount?: number;
  created_at: string;
  employee?: {
    id: string;
    employee_id: string;
    department?: string;
  };
  employee_profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface TerminationPreview {
  noticeDays: number;
  serviceYears: number;
  lines: { code: string; label: string; amount: number; meta?: Record<string, any> }[];
  totals: { gross: number; payable: number };
}

interface RehireRequest {
  id: string;
  ex_employee_id: string;
  requested_start_date?: string;
  prior_termination?: { id: string; type: string; final_lwd?: string };
  prior_termination_id?: string;
  eligibility_status: string;
  eligibility_reason?: string;
  status: string;
  created_at: string;
}

const WORKFLOW_BY_TYPE: Record<string, StageKey[]> = {
  resignation: ["manager_review", "hr_review", "payroll_hold", "completed"],
  mutual: ["hr_review", "payroll_hold", "completed"],
  cause: ["hr_review", "legal_review", "payroll_hold", "completed"],
  retrenchment: ["hr_review", "legal_review", "payroll_hold", "completed"],
  redundancy: ["hr_review", "legal_review", "payroll_hold", "completed"],
};

const STAGE_LABELS: Record<string, string> = {
  initiated: "Initiated",
  manager_review: "Manager",
  hr_review: "HR",
  legal_review: "Legal",
  payroll_hold: "Payroll",
  completed: "Completed",
  rejected: "Rejected",
};

const STATUS_BADGE_MAP: Record<string, string> = {
  completed: "bg-emerald-500 text-white",
  rejected: "bg-destructive text-white",
  hr_review: "bg-sky-500 text-white",
  legal_review: "bg-purple-500 text-white",
  payroll_hold: "bg-amber-500 text-white",
  manager_review: "bg-cyan-600 text-white",
};

const terminationTypes = [
  { value: "resignation", label: "Voluntary Resignation" },
  { value: "cause", label: "Termination for Cause" },
  { value: "mutual", label: "Mutual Separation / VSS" },
  { value: "redundancy", label: "Redundancy / Layoff" },
  { value: "retrenchment", label: "Retrenchment (IDA)" },
];

export default function Terminations() {
  const { toast } = useToast();
  const [terminations, setTerminations] = useState<TerminationRecord[]>([]);
  const [rehireRequests, setRehireRequests] = useState<RehireRequest[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewState, setPreviewState] = useState<{ id: string; data: TerminationPreview } | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rehireDialogOpen, setRehireDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    employee_id: "",
    type: "resignation",
    proposed_lwd: "",
    reason_text: "",
  });
  const [rehireForm, setRehireForm] = useState({
    ex_employee_id: "",
    requested_start_date: "",
    prior_termination_id: "",
    notes: "",
  });
  const [submittingTermination, setSubmittingTermination] = useState(false);
  const [submittingRehire, setSubmittingRehire] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        const [terminationData, employeeData, rehireData] = await Promise.all([
          api.getTerminations(),
          api.getEmployees(),
          api.getRehireRequests(),
        ]);
        setTerminations(Array.isArray(terminationData) ? terminationData : []);
        const empList = Array.isArray(employeeData)
          ? employeeData
          : Array.isArray(employeeData?.employees)
            ? employeeData.employees
            : [];
        setEmployees(empList);
        setRehireRequests(Array.isArray(rehireData) ? rehireData : []);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error?.message || "Unable to load records",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, [toast]);

  const refreshTerminations = async () => {
    try {
      const data = await api.getTerminations();
      setTerminations(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to refresh terminations",
        variant: "destructive",
      });
    }
  };

  const refreshRehireRequests = async () => {
    try {
      const data = await api.getRehireRequests();
      setRehireRequests(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to refresh rehire requests",
        variant: "destructive",
      });
    }
  };

  const workflowFor = (type: string) => WORKFLOW_BY_TYPE[type] || WORKFLOW_BY_TYPE.resignation;

  const createTermination = async () => {
    if (!createForm.employee_id) {
      toast({ title: "Select employee", variant: "destructive" });
      return;
    }
    setSubmittingTermination(true);
    try {
      await api.createTermination(createForm);
      toast({ title: "Termination initiated" });
      setCreateDialogOpen(false);
      setCreateForm({
        employee_id: "",
        type: "resignation",
        proposed_lwd: "",
        reason_text: "",
      });
      refreshTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create termination",
        variant: "destructive",
      });
    } finally {
      setSubmittingTermination(false);
    }
  };

  const advanceStage = async (terminationId: string) => {
    try {
      await api.approveTermination(terminationId, { action: "approve" });
      toast({ title: "Stage updated" });
      refreshTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to advance stage",
        variant: "destructive",
      });
    }
  };

  const rejectStage = async (terminationId: string) => {
    const note = window.prompt("Please capture the rationale for rejection");
    if (note === null) return;
    try {
      await api.approveTermination(terminationId, { action: "reject", note });
      toast({ title: "Termination rejected" });
      refreshTerminations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to reject termination",
        variant: "destructive",
      });
    }
  };

  const openPreview = async (terminationId: string) => {
    try {
      const data = await api.previewTermination(terminationId);
      setPreviewState({ id: terminationId, data });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to fetch settlement preview",
        variant: "destructive",
      });
    }
  };

  const createRehire = async () => {
    if (!rehireForm.ex_employee_id) {
      toast({ title: "Select a former employee", variant: "destructive" });
      return;
    }
    setSubmittingRehire(true);
    try {
      await api.createRehireRequest(rehireForm);
      toast({ title: "Rehire request created" });
      setRehireDialogOpen(false);
      setRehireForm({
        ex_employee_id: "",
        requested_start_date: "",
        prior_termination_id: "",
        notes: "",
      });
      refreshRehireRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to create rehire request",
        variant: "destructive",
      });
    } finally {
      setSubmittingRehire(false);
    }
  };

  const decideRehire = async (id: string, action: "approve" | "reject") => {
    const note = action === "reject" ? window.prompt("Reason for rejection?") : undefined;
    if (action === "reject" && note === null) return;
    try {
      await api.decideRehire(id, { action, note });
      toast({ title: `Rehire ${action === "approve" ? "advanced" : "rejected"}` });
      refreshRehireRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Unable to update rehire request",
        variant: "destructive",
      });
    }
  };

  const employeeOptions = useMemo(() => {
    return employees.map((emp) => ({
      id: emp.id,
      label:
        `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.trim() ||
        emp.employee_id ||
        "Unnamed",
      meta: emp.employee_id ? `(${emp.employee_id})` : "",
    }));
  }, [employees]);

  const rehireEligibleOptions = useMemo(() => {
    return employees
      .filter((emp) => (emp.status || "active").toLowerCase() !== "active")
      .map((emp) => ({
        id: emp.id,
        label:
          `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.trim() ||
          emp.employee_id ||
          "Unnamed",
        meta: emp.employee_id ? `(${emp.employee_id})` : "",
      }));
  }, [employees]);

  const renderStageBar = (record: TerminationRecord) => {
    const workflow = workflowFor(record.type);
    const stages: StageKey[] = ["initiated", ...workflow];
    return (
      <div className="flex flex-wrap gap-2">
        {stages.map((stage) => {
          const isActive = record.status === stage;
          const isCompleted = stages.indexOf(stage) < stages.indexOf(record.status);
          const base = STATUS_BADGE_MAP[stage] || "bg-slate-700 text-white";
          return (
            <Badge
              key={`${record.id}-${stage}`}
              className={cn(
                "text-xs px-2 py-1",
                isCompleted && "bg-emerald-500 text-white",
                isActive && "ring-2 ring-offset-2 ring-primary",
                !isActive && !isCompleted && "bg-muted text-muted-foreground",
                stage === "rejected" && "bg-destructive text-white",
                stage === "completed" && "bg-emerald-600 text-white",
                stage !== "completed" && stage !== "rejected" && base
              )}
            >
              {STAGE_LABELS[stage] ?? stage}
            </Badge>
          );
        })}
      </div>
    );
  };

  const renderTerminationCards = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading termination workflows…
        </div>
      );
    }

    if (!terminations.length) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          No termination workflows yet.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {terminations.map((record) => {
          const fullName = `${record.employee_profile?.first_name || ""} ${
            record.employee_profile?.last_name || ""
          }`.trim();
          const workflow = workflowFor(record.type);
          const isClosed = record.status === "completed" || record.status === "rejected";

          return (
            <Card key={record.id} className="border shadow-sm">
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{fullName || "Employee"}</h3>
                      <Badge variant="outline">{record.employee?.employee_id || "N/A"}</Badge>
                      <Badge className={cn("capitalize", STATUS_BADGE_MAP[record.status] || "bg-slate-700 text-white")}>
                        {record.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {record.employee?.department ? `${record.employee.department} · ` : ""}
                      {terminationTypes.find((t) => t.value === record.type)?.label || record.type}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {record.proposed_lwd && (
                        <span>
                          Proposed LWD: <strong>{format(new Date(record.proposed_lwd), "dd MMM yyyy")}</strong>
                        </span>
                      )}
                      {typeof record.settlement_amount === "number" && (
                        <span>Preview settlement: ₹{record.settlement_amount.toLocaleString("en-IN")}</span>
                      )}
                      <span>Workflow: {workflow.length} checkpoints</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openPreview(record.id)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Preview settlement
                    </Button>
                    {!isClosed && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => advanceStage(record.id)}>
                          Advance stage
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => rejectStage(record.id)}>
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {renderStageBar(record)}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderRehireCards = () => {
    if (!rehireRequests.length) {
      return (
        <div className="text-center py-10 text-muted-foreground">
          No rehire requests yet.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {rehireRequests.map((req) => (
          <Card key={req.id}>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base">
                      Former employee ID: {req.ex_employee_id}
                    </h3>
                    <Badge variant="outline">{req.status}</Badge>
                    <Badge className={cn(req.eligibility_status === "eligible" ? "bg-emerald-500" : "bg-amber-500", "text-white")}>
                      {req.eligibility_status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Requested start: {req.requested_start_date ? format(new Date(req.requested_start_date), "dd MMM yyyy") : "TBD"}
                  </p>
                  {req.eligibility_reason && (
                    <p className="text-xs text-muted-foreground">
                      Reason: {req.eligibility_reason.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => decideRehire(req.id, "approve")}>
                    Advance
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => decideRehire(req.id, "reject")}>
                    Reject
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Termination & Rehire Studio</h1>
            <p className="text-muted-foreground">
              Manage geo-compliant exits, settlements, reinstatements, and background verifications.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRehireDialogOpen(true)}>
              <UserCheck className="mr-2 h-4 w-4" />
              New Rehire Request
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <UserX className="mr-2 h-4 w-4" />
              New Termination
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Legal highlights (India)
            </div>
            <CardTitle className="text-lg">Compliance snapshot</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc pl-6 space-y-1">
              <li>
                Industrial Disputes Act retrenchment guidance: 15 days‘ average pay per completed year and mandatory labour notice for workmen in large establishments.
              </li>
              <li>
                Gratuity reference formula (illustrative): <code>(last drawn basic × 15 / 26) × years of service</code>. Ensure legal review before final payout.
              </li>
              <li>
                Consent + PF/ESIC closures must be recorded for background checks and rehires; final settlement PDFs need statutory schedules.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Tabs defaultValue="terminations" className="space-y-4">
          <TabsList>
            <TabsTrigger value="terminations">
              <UserX className="mr-2 h-4 w-4" />
              Terminations
            </TabsTrigger>
            <TabsTrigger value="rehires">
              <UserCheck className="mr-2 h-4 w-4" />
              Rehire Workflow
            </TabsTrigger>
          </TabsList>

          <TabsContent value="terminations" className="space-y-4">
            {renderTerminationCards()}
          </TabsContent>

          <TabsContent value="rehires">
            {renderRehireCards()}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Initiate termination</DialogTitle>
            <DialogDescription>
              Capture employee consent, last working day, and reason. Settlement preview is computed automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={createForm.employee_id} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, employee_id: value }))}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} {option.meta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Termination type</Label>
                <Select value={createForm.type} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminationTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Proposed last working day</Label>
                <Input
                  className="h-11"
                  type="date"
                  value={createForm.proposed_lwd}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, proposed_lwd: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Detailed notes / audit context</Label>
              <Textarea
                value={createForm.reason_text}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, reason_text: event.target.value }))}
                placeholder="Describe investigation findings, mutual separation terms, or legal considerations. This becomes part of the audit log."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTermination} disabled={submittingTermination}>
              {submittingTermination ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rehireDialogOpen} onOpenChange={setRehireDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Initiate rehire</DialogTitle>
            <DialogDescription>
              Eligibility checks (cool-off, DO NOT REHIRE flags, prior termination type) are computed automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Former employee</Label>
                <Select
                  value={rehireForm.ex_employee_id}
                  onValueChange={(value) => setRehireForm((prev) => ({ ...prev, ex_employee_id: value }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select former employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {rehireEligibleOptions.length === 0 && (
                      <SelectItem value="__none" disabled>
                        No terminated employees found
                      </SelectItem>
                    )}
                    {rehireEligibleOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label} {option.meta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rehire start date</Label>
                <Input
                  className="h-11"
                  type="date"
                  value={rehireForm.requested_start_date}
                  onChange={(event) => setRehireForm((prev) => ({ ...prev, requested_start_date: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Prior termination reference</Label>
                <Input
                  className="h-11"
                  placeholder="Termination record ID (optional)"
                  value={rehireForm.prior_termination_id}
                  onChange={(event) => setRehireForm((prev) => ({ ...prev, prior_termination_id: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes / business justification</Label>
              <Textarea
                rows={4}
                placeholder="Summarize rehire rationale, benefit reinstatement decisions, or policy exceptions here."
                value={rehireForm.notes}
                onChange={(event) => setRehireForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRehireDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={submittingRehire} onClick={createRehire}>
              {submittingRehire ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create rehire request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewState} onOpenChange={(open) => !open && setPreviewState(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Settlement preview</DialogTitle>
            <DialogDescription>
              Indicative view for HR/payroll; final PDFs add tax and statutory notices.
            </DialogDescription>
          </DialogHeader>
          {previewState ? (
            <div className="space-y-4">
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Notice period considered: <strong>{previewState.data.noticeDays} days</strong>
                </p>
                <p>
                  Service tenure (approx): <strong>{previewState.data.serviceYears} years</strong>
                </p>
              </div>
              <ScrollArea className="max-h-56 rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {previewState.data.lines.map((line) => (
                      <tr key={line.code} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{line.label}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          ₹{line.amount.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <span className="text-sm font-medium">Projected payout</span>
                <span className="text-lg font-semibold">
                  ₹{previewState.data.totals.payable.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Loading preview…</div>
          )}
          <DialogFooter>
            <Button onClick={() => setPreviewState(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
