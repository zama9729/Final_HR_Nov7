import { useEffect, useMemo, useState } from "react";
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
import { Plus, FileText, Loader2 } from "lucide-react";
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

interface BackgroundCheckReport extends BackgroundCheck {
  result_summary?: Record<string, any>;
  events?: {
    id: string;
    event_type: string;
    actor?: string;
    created_at: string;
    note?: string;
  }[];
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

  useEffect(() => {
    fetchChecks();
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

  const openReport = async (id: string) => {
    try {
      const result = await api.getBackgroundCheckReport(id);
      setReport(result);
    } catch (error: any) {
      toast({
        title: "Unable to fetch report",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
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

      <Dialog open={!!report} onOpenChange={(open) => !open && setReport(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Background Check Report</DialogTitle>
            <DialogDescription>Audit trail, vendor notes, and summarized findings.</DialogDescription>
          </DialogHeader>
          {report ? (
            <div className="space-y-4">
              <div>
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
                <p className="text-sm text-muted-foreground">
                  Initiated: {format(new Date(report.created_at), "dd MMM yyyy")}
                  {report.completed_at && ` • Completed: ${format(new Date(report.completed_at), "dd MMM yyyy")}`}
                </p>
              </div>
              {report.result_summary && (
                <div className="rounded-md border bg-muted/50 p-3 text-xs">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(report.result_summary, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <h4 className="text-sm font-semibold mb-2">Timeline</h4>
                <ScrollArea className="max-h-52 rounded-md border p-3 text-sm">
                  {report.events && report.events.length > 0 ? (
                    report.events.map((event) => (
                      <div key={event.id} className="border-b pb-2 mb-2 last:pb-0 last:border-0 last:mb-0">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-semibold">{event.event_type}</span>
                          <span>{format(new Date(event.created_at), "dd MMM yyyy HH:mm")}</span>
                        </div>
                        {event.note && <p className="mt-1">{event.note}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No events recorded.</p>
                  )}
                </ScrollArea>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-muted-foreground">Loading report…</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReport(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
