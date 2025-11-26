import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Plus,
  Redo2,
  RefreshCcw,
  Sparkles,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";

interface Employee {
  id: string;
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
  };
}

interface RosterTemplate {
  id: string;
  name: string;
  description?: string;
  timezone: string;
  coverage_plan: Array<Record<string, any>>;
  rest_rules?: Record<string, any>;
  updated_at: string;
}

interface RosterSchedule {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
  start_date: string;
  end_date: string;
  template_id?: string;
  template_name?: string;
  run_summary?: Record<string, any>;
  created_at: string;
}

interface RosterSlot {
  id: string;
  schedule_id: string;
  shift_date: string;
  shift_name?: string;
  start_time: string;
  end_time: string;
  assigned_employee_id?: string | null;
  assignment_status: "assigned" | "unassigned" | "conflict" | "warning";
  assignment_source: "auto" | "manual";
  conflict_flags?: string[];
  warning_flags?: string[];
  position_index: number;
  manual_lock: boolean;
}

interface RosterConflict {
  id: string;
  schedule_id: string;
  conflict_type: string;
  severity: string;
  details?: Record<string, any>;
}

interface CoverageRow {
  id: string;
  dayOfWeek: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  coverageRequired: number;
  requiredSkill?: string;
}

const defaultTimezone =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

const dayOptions = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 },
];

const timezoneOptions = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
];

const conflictHints: Record<string, string> = {
  no_available_candidate: "Everyone was either unavailable or on leave. Try manual assignment or adjust coverage.",
  no_employees_available: "No eligible employees for this slot. Consider loosening preferences.",
};

const makeRowId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ShiftManagement() {
  const { toast } = useToast();

  const [templates, setTemplates] = useState<RosterTemplate[]>([]);
  const [draftSchedules, setDraftSchedules] = useState<RosterSchedule[]>([]);
  const [publishedSchedules, setPublishedSchedules] = useState<RosterSchedule[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [selectedSchedule, setSelectedSchedule] = useState<RosterSchedule | null>(null);
  const [scheduleSlots, setScheduleSlots] = useState<RosterSlot[]>([]);
  const [scheduleConflicts, setScheduleConflicts] = useState<RosterConflict[]>([]);
  const [scheduleDetailLoading, setScheduleDetailLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"templates" | "drafts" | "published">("templates");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    timezone: defaultTimezone,
    description: "",
    restHours: 10,
    maxConsecutiveNights: 2,
  });

  const [coverageRows, setCoverageRows] = useState<CoverageRow[]>([
    {
      id: makeRowId(),
      dayOfWeek: 1,
      shiftName: "Day",
      startTime: "09:00",
      endTime: "17:00",
      coverageRequired: 1,
    },
  ]);

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    templateId: "",
    startDate: "",
    endDate: "",
    preserveManualEdits: true,
    seed: "",
  });
  const [runContextSchedule, setRunContextSchedule] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);

  const [assignmentHistory, setAssignmentHistory] = useState<
    Array<{ scheduleId: string; slotId: string; from: string | null; to: string | null }>
  >([]);
  const [redoStack, setRedoStack] = useState<
    Array<{ scheduleId: string; slotId: string; from: string | null; to: string | null }>
  >([]);
  const [undoBusy, setUndoBusy] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    await Promise.all([loadTemplates(), loadSchedules(), loadRuns(), loadEmployees()]);
  };

  const loadTemplates = async () => {
    try {
      const data = await api.getRosterTemplates();
      setTemplates(data || []);
    } catch (error) {
      console.error("Template load failed", error);
      toast({
        title: "Unable to load templates",
        description: "Please verify migrations are up to date.",
        variant: "destructive",
      });
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(
        (Array.isArray(data) ? data : []).filter((emp: any) => emp.status === "active")
      );
    } catch (error) {
      console.error("Employee load failed", error);
    }
  };

  const loadSchedules = async () => {
    try {
      const [draftRes, publishedRes] = await Promise.all([
        api.getRosterSchedules({ status: "draft" }),
        api.getRosterSchedules({ status: "published" }),
      ]);
      setDraftSchedules(draftRes || []);
      setPublishedSchedules(publishedRes || []);
    } catch (error) {
      console.error("Schedule load failed", error);
      toast({
        title: "Unable to load schedules",
        description: "Please refresh or try again.",
        variant: "destructive",
      });
    }
  };

  const loadRuns = async () => {
    try {
      const data = await api.getRosterRuns();
      setRuns(data || []);
    } catch (error) {
      console.error("Run load failed", error);
    }
  };

  const loadScheduleDetail = async (scheduleId: string) => {
    setScheduleDetailLoading(true);
    try {
      const detail = await api.getRosterSchedule(scheduleId);
      setSelectedSchedule(detail?.schedule || null);
      setScheduleSlots(detail?.slots || []);
      setScheduleConflicts(detail?.conflicts || []);
    } catch (error) {
      console.error("Schedule detail error", error);
      toast({
        title: "Unable to load schedule detail",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setScheduleDetailLoading(false);
    }
  };

  const handleTemplateField = (field: keyof typeof templateForm, value: string | number) => {
    setTemplateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCoverageChange = (rowId: string, field: keyof CoverageRow, value: string) => {
    setCoverageRows((rows) =>
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]:
                field === "dayOfWeek"
                  ? Number(value)
                  : field === "coverageRequired"
                    ? Number(value)
                    : value,
            }
          : row
      )
    );
  };

  const addCoverageRow = () => {
    setCoverageRows((rows) => [
      ...rows,
      {
        id: makeRowId(),
        dayOfWeek: 1,
        shiftName: "Day",
        startTime: "09:00",
        endTime: "17:00",
        coverageRequired: 1,
      },
    ]);
  };

  const removeCoverageRow = (rowId: string) => {
    setCoverageRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  };

  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast({
        title: "Template name required",
        description: "Please provide a name.",
        variant: "destructive",
      });
      return;
    }
    if (coverageRows.some((row) => !row.shiftName || !row.startTime || !row.endTime)) {
      toast({
        title: "Coverage rows incomplete",
        description: "Each coverage row needs a shift name, start and end time.",
        variant: "destructive",
      });
      return;
    }
    try {
      await api.createRosterTemplate({
        name: templateForm.name,
        description: templateForm.description || undefined,
        timezone: templateForm.timezone,
        coveragePlan: coverageRows.map((row) => ({
          day_of_week: [row.dayOfWeek],
          shift_name: row.shiftName,
          start_time: row.startTime,
          end_time: row.endTime,
          coverage_required: Number(row.coverageRequired) || 1,
          required_skill: row.requiredSkill || null,
        })),
        restRules: {
          min_rest_hours: Number(templateForm.restHours) || 8,
          max_consecutive_nights: Number(templateForm.maxConsecutiveNights) || 2,
        },
        constraintRules: {},
        preferenceRules: {},
      });
      toast({
        title: "Template saved",
        description: "Coverage rules are ready for scheduling.",
      });
      setTemplateForm({
        name: "",
        timezone: templateForm.timezone,
        description: "",
        restHours: templateForm.restHours,
        maxConsecutiveNights: templateForm.maxConsecutiveNights,
      });
      loadTemplates();
    } catch (error: any) {
      console.error("Template creation failed", error);
      toast({
        title: "Unable to save template",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteRosterTemplate(id);
      toast({ title: "Template removed" });
      loadTemplates();
    } catch (error) {
      console.error("Delete template failed", error);
      toast({
        title: "Unable to delete template",
        description: "Ensure no schedules reference this template.",
        variant: "destructive",
      });
    }
  };

  const openGenerateDialog = (schedule?: RosterSchedule) => {
    if (schedule) {
      setRunContextSchedule(schedule.id);
      setGenerateForm({
        templateId: schedule.template_id || "",
        startDate: schedule.start_date,
        endDate: schedule.end_date,
        preserveManualEdits: true,
        seed: schedule.run_summary?.seed ? String(schedule.run_summary.seed) : "",
      });
    } else {
      setRunContextSchedule(null);
      setGenerateForm({
        templateId: templates[0]?.id || "",
        startDate: "",
        endDate: "",
        preserveManualEdits: true,
        seed: "",
      });
    }
    setGenerateDialogOpen(true);
  };

  const handleGenerateRun = async () => {
    if (!generateForm.templateId || !generateForm.startDate || !generateForm.endDate) {
      toast({
        title: "Missing details",
        description: "Template and date range are required.",
        variant: "destructive",
      });
      return;
    }
    setGenerateLoading(true);
    try {
      const response = await api.startRosterRun({
        templateId: generateForm.templateId,
        startDate: generateForm.startDate,
        endDate: generateForm.endDate,
        preserveManualEdits: generateForm.preserveManualEdits,
        seed: generateForm.seed ? Number(generateForm.seed) : null,
        existingScheduleId: runContextSchedule,
      });
      setGenerateDialogOpen(false);
      toast({
        title: runContextSchedule ? "Schedule rerun queued" : "Draft schedule generated",
        description: "Review conflicts, adjust manually, then publish.",
      });
      setRunContextSchedule(null);
      await Promise.all([loadSchedules(), loadRuns()]);
      if (response?.schedule?.id) {
        await loadScheduleDetail(response.schedule.id);
        setActiveTab("drafts");
      }
    } catch (error: any) {
      console.error("Roster generation failed", error);
      toast({
        title: "Unable to generate roster",
        description: error?.message || "Check coverage rules and try again.",
        variant: "destructive",
      });
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleSlotAssignmentChange = async (slot: RosterSlot, employeeId: string | null) => {
    if (!selectedSchedule) return;
    if (slot.assigned_employee_id === employeeId) return;
    try {
      await api.updateRosterSlot(selectedSchedule.id, slot.id, {
        assigned_employee_id: employeeId,
        manual_lock: Boolean(employeeId),
      });
      toast({
        title: employeeId ? "Employee assigned" : "Slot cleared",
      });
      setAssignmentHistory((history) => [
        ...history,
        {
          scheduleId: selectedSchedule.id,
          slotId: slot.id,
          from: slot.assigned_employee_id || null,
          to: employeeId,
        },
      ]);
      setRedoStack([]);
      loadScheduleDetail(selectedSchedule.id);
    } catch (error) {
      console.error("Slot update failed", error);
      toast({
        title: "Unable to update slot",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUndo = async () => {
    if (!assignmentHistory.length) return;
    const last = assignmentHistory[assignmentHistory.length - 1];
    setUndoBusy(true);
    try {
      await api.updateRosterSlot(last.scheduleId, last.slotId, {
        assigned_employee_id: last.from,
        manual_lock: Boolean(last.from),
      });
      setAssignmentHistory((history) => history.slice(0, -1));
      setRedoStack((stack) => [...stack, last]);
      if (selectedSchedule?.id === last.scheduleId) {
        await loadScheduleDetail(last.scheduleId);
      }
      toast({ title: "Change undone" });
    } catch (error) {
      console.error("Undo failed", error);
      toast({ title: "Unable to undo", variant: "destructive" });
    } finally {
      setUndoBusy(false);
    }
  };

  const handleRedo = async () => {
    if (!redoStack.length) return;
    const last = redoStack[redoStack.length - 1];
    setUndoBusy(true);
    try {
      await api.updateRosterSlot(last.scheduleId, last.slotId, {
        assigned_employee_id: last.to,
        manual_lock: Boolean(last.to),
      });
      setRedoStack((stack) => stack.slice(0, -1));
      setAssignmentHistory((history) => [...history, last]);
      if (selectedSchedule?.id === last.scheduleId) {
        await loadScheduleDetail(last.scheduleId);
      }
      toast({ title: "Change redone" });
    } catch (error) {
      console.error("Redo failed", error);
      toast({ title: "Unable to redo", variant: "destructive" });
    } finally {
      setUndoBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedSchedule) return;
    try {
      await api.publishRosterSchedule(selectedSchedule.id);
      toast({
        title: "Schedule published",
        description: "Employees will now see their assigned shifts.",
      });
      await loadSchedules();
      await loadScheduleDetail(selectedSchedule.id);
      setActiveTab("published");
    } catch (error) {
      console.error("Publish failed", error);
      toast({
        title: "Unable to publish",
        description: "Resolve outstanding conflicts and try again.",
        variant: "destructive",
      });
    }
  };

  const scheduleEvents = useMemo(() => {
    const map: Record<string, RosterSlot[]> = {};
    scheduleSlots.forEach((slot) => {
      map[slot.shift_date] = [...(map[slot.shift_date] || []), slot];
    });
    return map;
  }, [scheduleSlots]);

  const getSlotStyle = (slot: RosterSlot) => {
    if (slot.assignment_status === "unassigned") {
      return "border-red-200 bg-red-50";
    }
    if ((slot.conflict_flags?.length || 0) > 0 || (slot.warning_flags?.length || 0) > 0) {
      return "border-amber-200 bg-amber-50";
    }
    return "border-emerald-200 bg-emerald-50";
  };

  const getEmployeeLabel = (employeeId?: string | null) => {
    if (!employeeId) return "Unassigned";
    const match = employees.find((emp) => emp.id === employeeId);
    const first = match?.first_name || match?.profiles?.first_name || "";
    const last = match?.last_name || match?.profiles?.last_name || "";
    return `${first} ${last}`.trim() || match?.employee_id || "Employee";
  };

  const renderScheduleCards = (schedules: RosterSchedule[], isDrafts = false) => {
    if (!schedules.length) {
      return (
        <Alert>
          <AlertDescription>
            {isDrafts
              ? "No draft schedules yet. Generate one using the Templates tab."
              : "No published schedules available."}
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="space-y-3">
        {schedules.map((schedule) => (
          <Card
            key={schedule.id}
            className={`border ${
              selectedSchedule?.id === schedule.id ? "border-primary" : "border-muted"
            }`}
          >
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{schedule.name}</CardTitle>
                  <CardDescription>
                    {format(parseISO(schedule.start_date), "MMM dd")} -{" "}
                    {format(parseISO(schedule.end_date), "MMM dd, yyyy")}
                  </CardDescription>
                </div>
                <Badge variant={schedule.status === "published" ? "default" : "secondary"}>
                  {schedule.status}
                </Badge>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  Template: {schedule.template_name || "Custom"} •{" "}
                  {schedule.run_summary?.totalSlots || 0} slots
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedSchedule(schedule);
                      loadScheduleDetail(schedule.id);
                      setActiveTab(schedule.status === "draft" ? "drafts" : "published");
                    }}
                  >
                    Review
                  </Button>
                  {isDrafts && (
                    <Button size="sm" variant="secondary" onClick={() => openGenerateDialog(schedule)}>
                      <RefreshCcw className="h-4 w-4 mr-1" />
                      Rerun
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Daily Roster & Shift Scheduler</h1>
            <p className="text-muted-foreground">
              Build templates, generate drafts with constraint awareness, resolve conflicts, and
              publish to employees.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openGenerateDialog()} disabled={!templates.length}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Roster
            </Button>
            <Button variant="default" onClick={() => setActiveTab("templates")}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value: "templates" | "drafts" | "published") => setActiveTab(value)}>
          <TabsList>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="drafts">Drafts & Conflicts</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Template builder</CardTitle>
                <CardDescription>Define coverage needs, rest rules, and preferred constraints.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={templateForm.name}
                      onChange={(e) => handleTemplateField("name", e.target.value)}
                      placeholder="Night shift coverage"
                    />
                  </div>
                  <div>
                    <Label>Timezone</Label>
                    <Select
                      value={templateForm.timezone}
                      onValueChange={(val) => handleTemplateField("timezone", val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {timezoneOptions.map((zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={templateForm.description}
                    onChange={(e) => handleTemplateField("description", e.target.value)}
                    placeholder="Who this coverage is for, constraints, etc."
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Minimum rest hours</Label>
                    <Input
                      type="number"
                      min={4}
                      value={templateForm.restHours}
                      onChange={(e) => handleTemplateField("restHours", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Max consecutive nights</Label>
                    <Input
                      type="number"
                      min={1}
                      value={templateForm.maxConsecutiveNights}
                      onChange={(e) =>
                        handleTemplateField("maxConsecutiveNights", Number(e.target.value))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Coverage rules</Label>
                    <Button variant="outline" size="sm" onClick={addCoverageRow}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add rule
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {coverageRows.map((row) => (
                      <div
                        key={row.id}
                        className="grid gap-3 rounded-lg border p-3 md:grid-cols-12 md:items-end"
                      >
                        <div className="md:col-span-2">
                          <Label>Day</Label>
                          <Select
                            value={String(row.dayOfWeek)}
                            onValueChange={(val) => handleCoverageChange(row.id, "dayOfWeek", val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Day" />
                            </SelectTrigger>
                            <SelectContent>
                              {dayOptions.map((day) => (
                                <SelectItem key={day.value} value={String(day.value)}>
                                  {day.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2">
                          <Label>Shift name</Label>
                          <Input
                            value={row.shiftName}
                            onChange={(e) => handleCoverageChange(row.id, "shiftName", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Start</Label>
                          <Input
                            type="time"
                            value={row.startTime}
                            onChange={(e) => handleCoverageChange(row.id, "startTime", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>End</Label>
                          <Input
                            type="time"
                            value={row.endTime}
                            onChange={(e) => handleCoverageChange(row.id, "endTime", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label>Required</Label>
                          <Input
                            type="number"
                            min={1}
                            value={row.coverageRequired}
                            onChange={(e) =>
                              handleCoverageChange(row.id, "coverageRequired", e.target.value)
                            }
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label>Required skill (optional)</Label>
                          <Input
                            value={row.requiredSkill || ""}
                            onChange={(e) =>
                              handleCoverageChange(row.id, "requiredSkill", e.target.value)
                            }
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeCoverageRow(row.id)}
                            disabled={coverageRows.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleCreateTemplate}>Save template</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing templates</CardTitle>
                <CardDescription>Review or delete templates you no longer need.</CardDescription>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <Alert>
                    <AlertDescription>No templates available. Create one to get started.</AlertDescription>
                  </Alert>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Timezone</TableHead>
                        <TableHead>Coverage rows</TableHead>
                        <TableHead>Rest rule</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div className="font-medium">{template.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Updated {format(parseISO(template.updated_at), "MMM dd")}
                            </div>
                          </TableCell>
                          <TableCell>{template.timezone}</TableCell>
                          <TableCell>{template.coverage_plan?.length || 0}</TableCell>
                          <TableCell>
                            Min rest{" "}
                            {template.rest_rules?.min_rest_hours ?? templateForm.restHours}h / Max
                            nights {template.rest_rules?.max_consecutive_nights ?? 2}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTemplate(template.id)}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="drafts" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Draft schedules</CardTitle>
                  <CardDescription>Review conflicts, reassign, and publish.</CardDescription>
                </CardHeader>
                <CardContent>{renderScheduleCards(draftSchedules, true)}</CardContent>
              </Card>

              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle>
                        {selectedSchedule ? selectedSchedule.name : "Select a draft schedule"}
                      </CardTitle>
                      {selectedSchedule && (
                        <CardDescription>
                          {format(parseISO(selectedSchedule.start_date), "MMM dd")} -{" "}
                          {format(parseISO(selectedSchedule.end_date), "MMM dd, yyyy")} • Template:{" "}
                          {selectedSchedule.template_name || "Custom"}
                        </CardDescription>
                      )}
                    </div>
                    {selectedSchedule && selectedSchedule.status === "draft" && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUndo}
                          disabled={!assignmentHistory.length || undoBusy}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Undo
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRedo}
                          disabled={!redoStack.length || undoBusy}
                        >
                          <Redo2 className="h-4 w-4 mr-1" />
                          Redo
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handlePublish}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Publish
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {!selectedSchedule ? (
                      <Alert>
                        <AlertDescription>Select a draft schedule to inspect slots.</AlertDescription>
                      </Alert>
                    ) : scheduleDetailLoading ? (
                      <p className="text-muted-foreground">Loading schedule details…</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.keys(scheduleEvents).length === 0 ? (
                          <Alert>
                            <AlertDescription>No slots generated. Try rerunning the scheduler.</AlertDescription>
                          </Alert>
                        ) : (
                          Object.entries(scheduleEvents).map(([date, slots]) => (
                            <div key={date} className="rounded-lg border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-medium">
                                  {format(parseISO(date), "EEEE, MMM dd")}
                                </div>
                                <Badge variant="outline">
                                  {slots.filter((slot) => slot.assignment_status === "assigned").length}
                                  /{slots.length} assigned
                                </Badge>
                              </div>
                              <div className="mt-3 space-y-2">
                                {slots.map((slot) => (
                                  <div
                                    key={slot.id}
                                    className={`rounded border p-3 ${getSlotStyle(slot)}`}
                                  >
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                      <div>
                                        <p className="font-medium">
                                          {slot.shift_name || "Shift"} • {slot.start_time} -{" "}
                                          {slot.end_time}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Position #{slot.position_index + 1} • Source:{" "}
                                          {slot.assignment_source}
                                        </p>
                                      </div>
                                      <div className="md:min-w-[220px]">
                                        <Select
                                          value={slot.assigned_employee_id || ""}
                                          onValueChange={(value) =>
                                            handleSlotAssignmentChange(
                                              slot,
                                              value === "" ? null : value
                                            )
                                          }
                                          disabled={selectedSchedule.status !== "draft"}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Assign employee">
                                              {getEmployeeLabel(slot.assigned_employee_id)}
                                            </SelectValue>
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="">Unassigned</SelectItem>
                                            {employees.map((emp) => (
                                              <SelectItem key={emp.id} value={emp.id}>
                                                {getEmployeeLabel(emp.id)} (
                                                {emp.employee_id || "ID"})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    {(slot.conflict_flags?.length || 0) > 0 && (
                                      <p className="text-xs text-amber-700 mt-2">
                                        {slot.conflict_flags?.join(", ")}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Conflicts & suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!scheduleConflicts.length ? (
                      <Alert>
                        <AlertDescription>No open conflicts. You can publish once assignments look good.</AlertDescription>
                      </Alert>
                    ) : (
                      scheduleConflicts.map((conflict) => (
                        <div
                          key={conflict.id}
                          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"
                        >
                          <p className="font-medium capitalize">{conflict.conflict_type}</p>
                          <p className="text-muted-foreground">
                            {conflict.details?.shift_date
                              ? `${conflict.details.shift_date} • ${conflict.details.shift_name || ""}`
                              : "Slot"}
                          </p>
                          <p className="mt-1">
                            {conflictHints[conflict.conflict_type] ||
                              "Adjust template coverage or manually assign an available employee."}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="h-5 w-5" />
                      Recent scheduler runs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {runs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No runs yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Template</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Conflicts</TableHead>
                            <TableHead>Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runs.slice(0, 5).map((run) => (
                            <TableRow key={run.id}>
                              <TableCell>{run.template_name || "Template"}</TableCell>
                              <TableCell>{run.status}</TableCell>
                              <TableCell>{run.conflict_count}</TableCell>
                              <TableCell>
                                {format(parseISO(run.created_at), "MMM dd, HH:mm")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="published" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Published schedules</CardTitle>
                <CardDescription>Locked rosters visible to employees.</CardDescription>
              </CardHeader>
              <CardContent>{renderScheduleCards(publishedSchedules)}</CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {runContextSchedule ? "Rerun scheduler (preserve edits?)" : "Generate schedule"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <Select
                value={generateForm.templateId}
                onValueChange={(val) => setGenerateForm((prev) => ({ ...prev, templateId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={generateForm.startDate}
                  onChange={(e) =>
                    setGenerateForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>End date</Label>
                <Input
                  type="date"
                  value={generateForm.endDate}
                  onChange={(e) => setGenerateForm((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Preserve manual edits
                </Label>
                <p className="text-xs text-muted-foreground">
                  Locked slots stay untouched when rerunning the solver.
                </p>
              </div>
              <Switch
                checked={generateForm.preserveManualEdits}
                onCheckedChange={(checked) =>
                  setGenerateForm((prev) => ({ ...prev, preserveManualEdits: checked }))
                }
              />
            </div>
            <div>
              <Label>Deterministic seed (optional)</Label>
              <Input
                type="number"
                value={generateForm.seed}
                onChange={(e) => setGenerateForm((prev) => ({ ...prev, seed: e.target.value }))}
                placeholder="Use the same seed for identical results"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateRun} disabled={generateLoading || !templates.length}>
              {generateLoading ? "Generating..." : runContextSchedule ? "Rerun" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
