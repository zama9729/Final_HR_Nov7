import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BranchForm = {
  id?: string;
  name: string;
  code?: string;
  timezone: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

type DepartmentForm = {
  id?: string;
  name: string;
  branchId?: string;
};

type TeamForm = {
  id?: string;
  name: string;
  branchId?: string;
  departmentId?: string;
};

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
];

export default function OrganizationSetup() {
  const { status, loading, refresh } = useOrgSetup();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeStep, setActiveStep] = useState<string>("org-details");
  const [showSplash, setShowSplash] = useState(true);
  const [branchForm, setBranchForm] = useState<BranchForm>({
    name: "",
    timezone: "Asia/Kolkata",
  });
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: "",
  });
  const [teamForm, setTeamForm] = useState<TeamForm>({ name: "" });
  const [hierarchy, setHierarchy] = useState<any>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [attendanceSettings, setAttendanceSettings] = useState<any | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [policyTemplates, setPolicyTemplates] = useState<any[]>([]);
  const [policySearch, setPolicySearch] = useState("");
  const [orgPolicies, setOrgPolicies] = useState<any[]>([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [policyVariables, setPolicyVariables] = useState<Record<string, any>>({});
  const [publishingPolicy, setPublishingPolicy] = useState(false);

  useEffect(() => {
    if (status?.currentStep) {
      setActiveStep(status.currentStep);
    }
  }, [status?.currentStep]);

  useEffect(() => {
    if (!status?.steps) return;
    const stepData = status.steps["branches"]?.data || {};
    setBranchForm((prev) => ({
      ...prev,
      ...stepData.draftBranch,
    }));
    const deptData = status.steps["departments"]?.data || {};
    setDepartmentForm((prev) => ({ ...prev, ...deptData.draftDepartment }));
    setTeamForm((prev) => ({ ...prev, ...deptData.draftTeam }));
  }, [status?.steps]);

  useEffect(() => {
    if (!status || status.isCompleted) {
      setShowSplash(false);
      return;
    }
    const storageKey = `org_setup_intro_${status.orgId}`;
    if (localStorage.getItem(storageKey)) {
      setShowSplash(false);
      return;
    }
    const timer = setTimeout(() => {
      localStorage.setItem(storageKey, Date.now().toString());
      setShowSplash(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [status?.orgId, status?.isCompleted]);

  const loadHierarchy = async () => {
    setHierarchyLoading(true);
    try {
      const data = await api.getBranchHierarchy();
      setHierarchy(data);
    } catch (err: any) {
      toast({
        title: "Unable to load branches",
        description: err?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setHierarchyLoading(false);
    }
  };

  useEffect(() => {
    if (!status?.isCompleted) {
      loadHierarchy();
    }
  }, [status?.orgId]);

  useEffect(() => {
    let mounted = true;
    const loadAttendanceSettings = async () => {
      try {
        setAttendanceLoading(true);
        const data = await api.getAttendanceSettings();
        if (mounted) {
          setAttendanceSettings(data);
        }
      } catch (error: any) {
        toast({
          title: "Unable to load attendance settings",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      } finally {
        if (mounted) setAttendanceLoading(false);
      }
    };
    loadAttendanceSettings();
    return () => {
      mounted = false;
    };
  }, []);

  const loadPolicyData = async () => {
    try {
      setPolicyLoading(true);
      const [templates, policies] = await Promise.all([
        api.getPolicyTemplates({ country: "IN", search: policySearch || undefined }),
        api.getPolicyPlatformPolicies(),
      ]);
      setPolicyTemplates(templates || []);
      setOrgPolicies(policies || []);
    } catch (error: any) {
      toast({
        title: "Unable to load policies",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setPolicyLoading(false);
    }
  };

  useEffect(() => {
    loadPolicyData();
  }, [policySearch]);

  const steps = status?.stepOrder || [];
  const stepStates = status?.steps || {};
  const completedCount = useMemo(() => {
    return steps.filter((step) => stepStates[step.key]?.completed).length;
  }, [steps, stepStates]);
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  const persistDraft = async (stepKey: string, draft: Record<string, any>) => {
    try {
      await api.updateSetupStep(stepKey, { data: draft });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Unable to save draft",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleMarkComplete = async (stepKey: string, payload?: Record<string, any>) => {
    setSavingStep(true);
    try {
      await api.updateSetupStep(stepKey, { completed: true, data: payload || {} });
      await refresh();
      toast({ title: "Step saved", description: "Progress updated successfully." });
    } catch (err: any) {
      toast({
        title: "Unable to save step",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingStep(false);
    }
  };

  const handleSkipStep = async (stepKey: string) => {
    setSavingStep(true);
    try {
      await api.updateSetupStep(stepKey, { skipped: true });
      await refresh();
    } catch (err: any) {
      toast({
        title: "Unable to skip",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingStep(false);
    }
  };

  const handleFinish = async () => {
  const handleAttendanceSave = async (markComplete = false) => {
  const handleSelectTemplate = (template: any) => {
    setSelectedTemplate(template);
    const defaults = Object.entries(template?.variables || {}).reduce(
      (acc, [key, meta]: [string, any]) => {
        acc[key] = meta?.default ?? "";
        return acc;
      },
      {} as Record<string, any>
    );
    setPolicyVariables(defaults);
  };

  const handlePublishPolicy = async () => {
    if (!selectedTemplate) return;
    setPublishingPolicy(true);
    try {
      const saved = await api.savePolicyPlatformPolicy({
        templateId: selectedTemplate.id,
        name: selectedTemplate.name,
        tags: selectedTemplate.tags,
      });
      await api.publishPolicyPlatformPolicy(saved.id, {
        variables: policyVariables,
      });
      await loadPolicyData();
      setSelectedTemplate(null);
      toast({ title: "Policy published" });
      await handleMarkComplete("policies", { publishedPolicyId: saved.id });
    } catch (error: any) {
      toast({
        title: "Unable to publish policy",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setPublishingPolicy(false);
    }
  };

    if (!attendanceSettings) return;
    setSavingStep(true);
    try {
      const updated = await api.updateAttendanceSettings(attendanceSettings);
      setAttendanceSettings(updated);
      if (markComplete) {
        await handleMarkComplete("attendance", { attendanceSettings: updated });
      } else {
        toast({ title: "Attendance settings saved" });
      }
    } catch (error: any) {
      toast({
        title: "Unable to save attendance settings",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingStep(false);
    }
  };

    setSavingStep(true);
    try {
      await api.updateSetupStep("review", { completed: true, finish: true });
      await refresh();
      toast({ title: "Setup completed", description: "Redirecting to dashboard." });
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        title: "Unable to finish setup",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingStep(false);
    }
  };

  const renderSplash = () => (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-emerald-200">Initializing</p>
        <h1 className="text-3xl md:text-4xl font-semibold">Setting up your organization…</h1>
        <p className="text-base text-slate-300 max-w-md">
          We are preparing your workspace and ensuring policies, payroll, and attendance tools are ready.
        </p>
        <div className="w-48 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden">
          <div className="bg-emerald-400 h-full w-full origin-left animate-pulse"></div>
        </div>
      </div>
    </div>
  );

  if (loading || !status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading setup...</div>
      </div>
    );
  }

  if (showSplash) {
    return renderSplash();
  }

  if (status.isCompleted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <Card className="max-w-xl text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Organization setup completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Your workspace is ready. Continue to your dashboard to start managing your teams.</p>
            <Button onClick={() => navigate("/dashboard", { replace: true })}>Go to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderLinkOut = (label: string, link: string) => (
    <Button variant="outline" onClick={() => navigate(link)} className="w-full sm:w-auto">
      {label}
    </Button>
  );

  const renderBranchesStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg">Add your primary location</h3>
        <p className="text-sm text-muted-foreground">
          Branches help organize attendance windows, holiday calendars, and payroll groups per geography.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="branch-name">Branch name</Label>
          <Input
            id="branch-name"
            placeholder="e.g. Bengaluru HQ"
            value={branchForm.name}
            onChange={(event) => setBranchForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="branch-code">Code (optional)</Label>
          <Input
            id="branch-code"
            placeholder="BLR-HQ"
            value={branchForm.code || ""}
            onChange={(event) => setBranchForm((prev) => ({ ...prev, code: event.target.value }))}
          />
        </div>
        <div className="space-y-3">
          <Label htmlFor="branch-timezone">Timezone</Label>
          <select
            id="branch-timezone"
            className="border rounded-md px-3 py-2 text-sm"
            value={branchForm.timezone}
            onChange={(event) => setBranchForm((prev) => ({ ...prev, timezone: event.target.value }))}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <Label>Country</Label>
          <Input
            placeholder="India"
            value={branchForm.country || ""}
            onChange={(event) => setBranchForm((prev) => ({ ...prev, country: event.target.value }))}
          />
        </div>
        <div className="space-y-3 md:col-span-2">
          <Label>Address</Label>
          <Textarea
            placeholder="Address line, city, postal code"
            value={branchForm.address_line1 || ""}
            onChange={(event) => setBranchForm((prev) => ({ ...prev, address_line1: event.target.value }))}
          />
        </div>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Button
          disabled={!branchForm.name || hierarchyLoading}
          onClick={async () => {
            try {
              await api.upsertBranch({
                id: branchForm.id,
                name: branchForm.name,
                code: branchForm.code,
                timezone: branchForm.timezone,
                address: {
                  line1: branchForm.address_line1,
                  line2: branchForm.address_line2,
                  city: branchForm.city,
                  state: branchForm.state,
                  postal_code: branchForm.postal_code,
                  country: branchForm.country,
                },
              });
              await persistDraft("branches", { draftBranch: branchForm });
              toast({ title: "Branch saved" });
              setBranchForm({ name: "", timezone: branchForm.timezone });
              await loadHierarchy();
            } catch (err: any) {
              toast({
                title: "Unable to save branch",
                description: err?.message || "Try again.",
                variant: "destructive",
              });
            }
          }}
        >
          Save branch
        </Button>
        <Button variant="outline" onClick={() => persistDraft("branches", { draftBranch: branchForm })}>
          Save draft
        </Button>
      </div>
      <Separator />
      <div>
        <h4 className="font-medium mb-2">Existing branches</h4>
        {hierarchyLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : hierarchy?.branches?.length ? (
          <div className="grid gap-3">
            {hierarchy.branches.map((branch: any) => (
              <div key={branch.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    <p className="text-xs text-muted-foreground">{branch.timezone}</p>
                  </div>
                  <Badge variant={branch.is_active ? "secondary" : "outline"}>
                    {branch.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No branches yet.</p>
        )}
      </div>
    </div>
  );

  const renderDepartmentsStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-lg">Create departments and teams</h3>
        <p className="text-sm text-muted-foreground">
          Departments roll up to branches and help scope approvals, analytics, and attendance groups.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Department name</Label>
          <Input
            placeholder="Engineering"
            value={departmentForm.name}
            onChange={(event) => setDepartmentForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Branch</Label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={departmentForm.branchId || ""}
            onChange={(event) => setDepartmentForm((prev) => ({ ...prev, branchId: event.target.value || undefined }))}
          >
            <option value="">Unassigned</option>
            {hierarchy?.branches?.map((branch: any) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!departmentForm.name}
          onClick={async () => {
            try {
              await api.upsertDepartment({
                id: departmentForm.id,
                name: departmentForm.name,
                branchId: departmentForm.branchId,
              });
              await persistDraft("departments", { draftDepartment: departmentForm, draftTeam: teamForm });
              toast({ title: "Department saved" });
              setDepartmentForm({ name: "" });
              await loadHierarchy();
            } catch (err: any) {
              toast({
                title: "Unable to save department",
                description: err?.message || "Try again.",
                variant: "destructive",
              });
            }
          }}
        >
          Save department
        </Button>
        <Button variant="outline" onClick={() => persistDraft("departments", { draftDepartment: departmentForm })}>
          Save draft
        </Button>
      </div>
      <Separator />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Team name</Label>
          <Input
            placeholder="Platform squad"
            value={teamForm.name}
            onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Department</Label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={teamForm.departmentId || ""}
            onChange={(event) => setTeamForm((prev) => ({ ...prev, departmentId: event.target.value || undefined }))}
          >
            <option value="">Unassigned</option>
            {hierarchy?.departments?.map((dept: any) => (
              <option value={dept.id} key={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Host branch</Label>
          <select
            className="border rounded-md px-3 py-2 text-sm"
            value={teamForm.branchId || ""}
            onChange={(event) => setTeamForm((prev) => ({ ...prev, branchId: event.target.value || undefined }))}
          >
            <option value="">Unassigned</option>
            {hierarchy?.branches?.map((branch: any) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          disabled={!teamForm.name}
          variant="outline"
          onClick={async () => {
            try {
              await api.upsertTeam({
                id: teamForm.id,
                name: teamForm.name,
                branchId: teamForm.branchId || teamForm.hostBranchId,
                departmentId: teamForm.departmentId,
                hostBranchId: teamForm.branchId,
              });
              await persistDraft("departments", { draftDepartment: departmentForm, draftTeam: teamForm });
              toast({ title: "Team saved" });
              setTeamForm({ name: "" });
              await loadHierarchy();
            } catch (err: any) {
              toast({
                title: "Unable to save team",
                description: err?.message || "Try again.",
                variant: "destructive",
              });
            }
          }}
        >
          Save team
        </Button>
        <Button variant="ghost" onClick={() => persistDraft("departments", { draftTeam: teamForm })}>
          Store team draft
        </Button>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (activeStep) {
      case "org-details":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirm legal name, domain, headquarters address, and contact information. These values inform payroll
              filings and branded communication.
            </p>
            <div className="flex flex-wrap gap-3">
              {renderLinkOut("Open Organization Settings", "/settings?tab=organization")}
              {renderLinkOut("Manage Contact Info", "/settings")}
            </div>
          </div>
        );
      case "branches":
        return renderBranchesStep();
      case "departments":
        return renderDepartmentsStep();
      case "policies":
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex-1 min-w-[220px]">
                <Input
                  value={policySearch}
                  onChange={(event) => setPolicySearch(event.target.value)}
                  placeholder="Search templates"
                />
              </div>
              <Button variant="outline" onClick={loadPolicyData} disabled={policyLoading}>
                Refresh
              </Button>
              {renderLinkOut("Open Policies", "/policies/management")}
            </div>
            {policyLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading policy templates...</div>
            ) : policyTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No policy templates found. Try adjusting your search or check back later.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {policyTemplates.map((template) => {
                  const published = orgPolicies.find(
                    (policy) => policy.template_id === template.id && policy.status === "active"
                  );
                  return (
                    <Card 
                      key={template.id} 
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        selectedTemplate?.id === template.id && "ring-2 ring-primary"
                      )}
                      onClick={() => handleSelectTemplate(template)}
                    >
                      <CardHeader>
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{template.name}</span>
                          {published ? <Badge variant="secondary">Published</Badge> : null}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                        <div className="flex gap-1 flex-wrap">
                          {(template.tags || []).map((tag: string) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTemplate(template);
                          }}
                        >
                          {selectedTemplate?.id === template.id ? "Selected" : "Configure"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {selectedTemplate && (
              <Card className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="font-semibold">{selectedTemplate.name}</h3>
                    <p className="text-sm text-muted-foreground">Adjust variables and publish for the org.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
                    Cancel
                  </Button>
                </div>
                <ScrollArea className="max-h-72 pr-3">
                  <div className="space-y-4">
                    {Object.entries(selectedTemplate.variables || {}).map(([key, meta]: [string, any]) => (
                      <div key={key} className="space-y-2">
                        <Label htmlFor={`var-${key}`} className="text-sm font-medium">
                          {meta?.label || key}
                        </Label>
                        <Input
                          id={`var-${key}`}
                          type={meta?.type === "number" ? "number" : "text"}
                          value={policyVariables[key] ?? ""}
                          onChange={(event) =>
                            setPolicyVariables((prev) => ({
                              ...prev,
                              [key]: event.target.value,
                            }))
                          }
                        />
                        {meta?.description && (
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex justify-end gap-2">
                  <Button onClick={handlePublishPolicy} disabled={publishingPolicy}>
                    {publishingPolicy ? "Publishing..." : "Publish Policy"}
                  </Button>
                </div>
              </Card>
            )}
            <div>
              <h4 className="font-semibold mb-2">Published policies</h4>
              <div className="space-y-2">
                {orgPolicies
                  .filter((policy) => policy.status === "active")
                  .map((policy) => (
                    <div key={policy.id} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{policy.name}</p>
                        {policy.version && (
                          <p className="text-xs text-muted-foreground">
                            Effective {policy.effective_from} · v{policy.version}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  ))}
                {orgPolicies.filter((p) => p.status === "active").length === 0 && (
                  <p className="text-sm text-muted-foreground">No active policies yet.</p>
                )}
              </div>
            </div>
          </div>
        );
      case "employee-import":
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Import employees via CSV. Existing importer already maps to payroll fields and will auto-assign the home
              branch you select below.
            </p>
            {renderLinkOut("Launch Importer", "/employees/import")}
          </div>
        );
      case "attendance":
        return (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Choose how employees submit hours. Timesheets remain available even if you enable clock-in/out.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Capture method</Label>
              <RadioGroup
                value={attendanceSettings?.capture_method || "timesheets"}
                onValueChange={(val) =>
                  setAttendanceSettings((prev: any) => ({ ...(prev || {}), capture_method: val }))
                }
                className="grid gap-3 md:grid-cols-2"
              >
                <div className="border rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="timesheets" id="timesheets" />
                    <Label htmlFor="timesheets" className="font-semibold">
                      Timesheets (default)
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Keep weekly timesheets as the primary capture source.
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="clock_in_out" id="clock-in-out" />
                    <Label htmlFor="clock-in-out" className="font-semibold">
                      Clock In / Clock Out
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Enable kiosks or mobile punches and we will continue generating timesheets automatically.
                  </p>
                </div>
              </RadioGroup>
            </div>
            {attendanceSettings?.capture_method === "clock_in_out" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Geofencing</p>
                    <p className="text-xs text-muted-foreground">Restrict punches to approved coordinates.</p>
                  </div>
                  <Switch
                    disabled={attendanceLoading}
                    checked={Boolean(attendanceSettings?.enable_geofence)}
                    onCheckedChange={(checked) =>
                      setAttendanceSettings((prev: any) => ({ ...(prev || {}), enable_geofence: checked }))
                    }
                  />
                </div>
                <div className="border rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Kiosk mode</p>
                    <p className="text-xs text-muted-foreground">Allow tablets or shared devices for punching.</p>
                  </div>
                  <Switch
                    disabled={attendanceLoading}
                    checked={Boolean(attendanceSettings?.enable_kiosk)}
                    onCheckedChange={(checked) =>
                      setAttendanceSettings((prev: any) => ({ ...(prev || {}), enable_kiosk: checked }))
                    }
                  />
                </div>
              </div>
            )}
            <div className="border rounded-lg p-4">
              <Label className="text-sm">Week starts on</Label>
              <select
                className="mt-2 border rounded-md px-3 py-2 text-sm"
                value={attendanceSettings?.default_week_start ?? 1}
                disabled={attendanceLoading}
                onChange={(e) =>
                  setAttendanceSettings((prev: any) => ({
                    ...(prev || {}),
                    default_week_start: Number(e.target.value),
                  }))
                }
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" disabled={attendanceLoading || savingStep} onClick={() => handleAttendanceSave(false)}>
                Save changes
              </Button>
              <Button disabled={attendanceLoading || savingStep} onClick={() => handleAttendanceSave(true)}>
                Save & mark complete
              </Button>
            </div>
          </div>
        );
      case "review":
      default:
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Review selections</h3>
            <div className="space-y-3">
              {steps.map((step) => (
                <div key={step.key} className="border rounded-lg px-3 py-2 flex items-center justify-between">
                  <span>{step.label}</span>
                  {stepStates[step.key]?.completed ? (
                    <Badge variant="secondary">Done</Badge>
                  ) : stepStates[step.key]?.skipped ? (
                    <Badge variant="outline">Skipped</Badge>
                  ) : (
                    <Badge variant="destructive">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
            <Button disabled={savingStep} onClick={handleFinish}>
              Finish setup
            </Button>
          </div>
        );
    }
  };

  const currentStep = steps.find((step) => step.key === activeStep);
  const optionalStep = currentStep?.optional;

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl py-6 px-3 lg:px-0 space-y-6">
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">Organization setup</p>
              <h1 className="text-2xl font-semibold">Guided wizard</h1>
              <p className="text-sm text-muted-foreground">
                Complete the steps below. You can save and finish later, and we will resume from where you left off.
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold">{progress}%</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {steps.map((step) => {
              const state = stepStates[step.key];
              const isActive = activeStep === step.key;
              const completed = state?.completed;
              return (
                <button
                  key={step.key}
                  className={cn(
                    "px-4 py-2 rounded-full border text-sm whitespace-nowrap transition",
                    completed
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : isActive
                      ? "border-primary text-primary bg-primary/10"
                      : "border-muted text-muted-foreground"
                  )}
                  onClick={() => setActiveStep(step.key)}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-wide text-muted-foreground">Step</p>
              <h2 className="text-xl font-semibold">{currentStep?.label || "Setup"}</h2>
            </div>
            {optionalStep && <Badge variant="outline">Optional</Badge>}
          </div>
          <Separator />
          {renderStepContent()}
          <div className="flex flex-wrap gap-3 justify-between pt-4 border-t">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  const draftPayload =
                    activeStep === "branches"
                      ? { draftBranch: branchForm }
                      : activeStep === "departments"
                      ? { draftDepartment: departmentForm, draftTeam: teamForm }
                      : {};
                  persistDraft(activeStep, draftPayload);
                  toast({ title: "Draft saved", description: "You can resume anytime." });
                }}
              >
                Save & continue later
              </Button>
              {optionalStep && (
                <Button variant="outline" disabled={savingStep} onClick={() => handleSkipStep(activeStep)}>
                  Skip for now
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {activeStep !== "review" && (
                <Button disabled={savingStep} onClick={() => handleMarkComplete(activeStep)}>
                  Mark step complete
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}


