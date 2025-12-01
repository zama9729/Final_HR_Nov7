/**
 * Staff Scheduling Module
 * Comprehensive rule-based scheduling with templates, rules, and multiple algorithms
 */

import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { RuleEditor } from "@/components/scheduling/RuleEditor";
import {
  Calendar,
  Clock,
  Settings,
  Play,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Edit,
  Plus,
  Trash2,
  Users,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { format, startOfWeek, addDays, parseISO, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  shift_type: 'day' | 'evening' | 'night' | 'custom';
  duration_hours?: number;
  crosses_midnight: boolean;
  is_default: boolean;
}

interface RuleSet {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  rules: Array<{
    id: string;
    name: string;
    type: 'hard' | 'soft';
    weight?: number;
    params?: Record<string, any>;
  }>;
}

interface ScheduleEmployee {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface FairnessSummary {
  priorNightCounts?: Record<string, number>;
  nightShiftDistribution?: Record<string, number>;
}

interface UnfilledSlot {
  date: string;
  template_id?: string;
  template_name?: string;
  requested?: number;
  filled?: number;
  reason?: string;
}

interface Schedule {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  score?: number;
  rule_set_id?: string;
  algorithm_used?: string;
  violated_hard_constraints?: any[];
  violated_soft_constraints?: any[];
  assignments?: ScheduleAssignment[];
  assignment_count?: number;
  employees?: ScheduleEmployee[];
  fairness_summary?: FairnessSummary | null;
  exception_suggestions?: UnfilledSlot[];
  evaluation?: {
    isValid: boolean;
    hardViolations: any[];
    softViolations: any[];
    score: number;
  };
}

interface ScheduleAssignment {
  id: string;
  employee_id: string;
  shift_date: string;
  shift_template_id: string;
  start_time: string;
  end_time: string;
  assigned_by: string;
  first_name?: string;
  last_name?: string;
  template_name?: string;
  shift_type?: string;
  assigned_by_user_id?: string;
  assigned_by_first_name?: string;
  assigned_by_last_name?: string;
}

const normalizeAssignments = (assignments: ScheduleAssignment[] | undefined) => {
  if (!assignments) return [];
  return assignments.map((assignment) => ({
    ...assignment,
    shift_date: (() => {
      if (!assignment.shift_date) return assignment.shift_date;
      if (typeof assignment.shift_date === "string") {
        return assignment.shift_date.split("T")[0];
      }
      try {
        return assignment.shift_date.toISOString().split("T")[0];
      } catch {
        return assignment.shift_date as unknown as string;
      }
    })(),
  }));
};

const formatShiftTime = (time?: string | null) => {
  if (!time) return '--';
  const [hours = '0', minutes = '00'] = time.split(':');
  let hourNum = parseInt(hours, 10);
  if (Number.isNaN(hourNum)) return time;
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  hourNum = hourNum % 12 || 12;
  return `${hourNum}:${minutes.padStart(2, '0')} ${ampm}`;
};

export default function StaffScheduling() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("schedules");
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<ScheduleAssignment[]>([]);
  const [manualReason, setManualReason] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  // Template form
  const [templateForm, setTemplateForm] = useState({
    name: "",
    start_time: "08:00",
    end_time: "16:00",
    shift_type: "day" as const,
    duration_hours: 8,
    crosses_midnight: false,
    is_default: false,
  });
  const [previewStartDate, setPreviewStartDate] = useState<Date | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);

  // Rule set form
  const [ruleSetForm, setRuleSetForm] = useState({
    name: "",
    description: "",
    is_default: false,
    rules: [] as RuleSet['rules'],
  });
  const [showRuleSetDialog, setShowRuleSetDialog] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<RuleSet | null>(null);

  // Scheduler form
  const [scheduleType, setScheduleType] = useState<"weekly" | "monthly">("weekly");
  const [schedulerForm, setSchedulerForm] = useState({
    week_start_date: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"),
    week_end_date: format(addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6), "yyyy-MM-dd"),
    month_start_date: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    month_end_date: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    rule_set_id: "",
    template_ids: [] as string[],
    employee_ids: [] as string[],
  });

  // ScoreRank Settings
  const [decayRate, setDecayRate] = useState(0.1);
  const [shiftWeights, setShiftWeights] = useState({
    morning: 1,
    evening: 1.5,
    night: 3
  });
  const [overwriteLocked, setOverwriteLocked] = useState(false);

  const [showSchedulerDialog, setShowSchedulerDialog] = useState(false);
  const [showRerunDialog, setShowRerunDialog] = useState(false);
  const [rerunScheduleId, setRerunScheduleId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchRuleSets();
    fetchSchedules();
  }, []);

  const fetchTemplates = async () => {
    try {
      const data = await api.getShiftTemplates();
      setTemplates(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load templates",
        variant: "destructive",
      });
    }
  };

  const fetchRuleSets = async () => {
    try {
      const data = await api.getRuleSets();
      setRuleSets(data);
      if (data.length > 0 && !schedulerForm.rule_set_id) {
        const defaultSet = data.find((rs: RuleSet) => rs.is_default) || data[0];
        setSchedulerForm(prev => ({ ...prev, rule_set_id: defaultSet.id }));
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load rule sets",
        variant: "destructive",
      });
    }
  };

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const data = await api.getSchedules();
      setSchedules(data);
      if (!selectedSchedule && data.length > 0) {
        await handleViewSchedule(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load schedules",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      if (editingTemplate) {
        await api.updateShiftTemplate(editingTemplate.id, templateForm);
        toast({ title: "Success", description: "Template updated" });
      } else {
        await api.createShiftTemplate(templateForm);
        toast({ title: "Success", description: "Template created" });
      }
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      setTemplateForm({
        name: "",
        start_time: "08:00",
        end_time: "16:00",
        shift_type: "day",
        duration_hours: 8,
        crosses_midnight: false,
        is_default: false,
      });
      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handleCreateRuleSet = async () => {
    try {
      if (editingRuleSet) {
        await api.updateRuleSet(editingRuleSet.id, ruleSetForm);
        toast({ title: "Success", description: "Rule set updated" });
      } else {
        await api.createRuleSet(ruleSetForm);
        toast({ title: "Success", description: "Rule set created" });
      }
      setShowRuleSetDialog(false);
      setEditingRuleSet(null);
      setRuleSetForm({
        name: "",
        description: "",
        is_default: false,
        rules: [],
      });
      fetchRuleSets();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save rule set",
        variant: "destructive",
      });
    }
  };

  const handleRunScheduler = async () => {
    if (!schedulerForm.rule_set_id) {
      toast({
        title: "Error",
        description: "Please select a rule set",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      // Add random seed for variation on each run
      const randomSeed = Math.floor(Math.random() * 1000000);

      const result = await api.runScheduler({
        week_start_date: scheduleType === "weekly" ? schedulerForm.week_start_date : schedulerForm.month_start_date,
        week_end_date: scheduleType === "weekly" ? schedulerForm.week_end_date : schedulerForm.month_end_date,
        rule_set_id: schedulerForm.rule_set_id,
        // algorithm: schedulerForm.algorithm, // Deprecated
        template_ids: schedulerForm.template_ids.length > 0 ? schedulerForm.template_ids : undefined,
        employee_ids: schedulerForm.employee_ids.length > 0 ? schedulerForm.employee_ids : undefined,
        seed: randomSeed, // Add random seed for variation
        replace_schedule_id: rerunScheduleId || undefined, // Replace existing schedule if rerunning
        decayRate,
        shiftWeights,
        overwriteLocked
      });

      toast({
        title: "Success",
        description: "Schedule generated successfully",
      });

      // Ensure dates are in correct format (yyyy-MM-dd) for date inputs
      if (result.week_start_date && typeof result.week_start_date === 'string' && result.week_start_date.includes('T')) {
        result.week_start_date = result.week_start_date.split('T')[0];
      }
      if (result.week_end_date && typeof result.week_end_date === 'string' && result.week_end_date.includes('T')) {
        result.week_end_date = result.week_end_date.split('T')[0];
      }

      setSelectedSchedule({
        ...result,
        assignments: normalizeAssignments(result.assignments),
        employees: result.employees || selectedSchedule?.employees || [],
        fairness_summary: result.fairness_summary || null,
        exception_suggestions: result.exception_suggestions || [],
      });
      setShowSchedulerDialog(false);
      setShowRerunDialog(false);
      fetchSchedules();
      setActiveTab("preview");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate schedule",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleRerunSchedule = async (scheduleId: string) => {
    if (!selectedSchedule) return;

    try {
      // Fetch full schedule details to get rule_set_id
      const fullSchedule = await api.getSchedule(scheduleId);

      // Format dates properly for HTML date inputs (yyyy-MM-dd)
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return "";
        try {
          // If it's already in yyyy-MM-dd format, return as is
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
          }
          // Otherwise parse and format
          const date = parseISO(dateStr);
          return format(date, "yyyy-MM-dd");
        } catch {
          return dateStr.split('T')[0]; // Fallback: take just the date part
        }
      };

      // Pre-fill the form with current schedule's parameters
      setSchedulerForm({
        week_start_date: formatDateForInput(fullSchedule.week_start_date || selectedSchedule.week_start_date),
        week_end_date: formatDateForInput(fullSchedule.week_end_date || selectedSchedule.week_end_date),
        rule_set_id: fullSchedule.rule_set_id || "",
        algorithm: fullSchedule.algorithm_used || "greedy",
        template_ids: [],
        employee_ids: [],
      });

      setRerunScheduleId(scheduleId);
      setShowRerunDialog(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load schedule details",
        variant: "destructive",
      });
    }
  };

  const handleRerun = async () => {
    if (!schedulerForm.rule_set_id) {
      toast({
        title: "Error",
        description: "Please select a rule set",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      // Add random seed for variation on each rerun
      const randomSeed = Math.floor(Math.random() * 1000000);

      const result = await api.runScheduler({
        week_start_date: scheduleType === "weekly" ? schedulerForm.week_start_date : schedulerForm.month_start_date,
        week_end_date: scheduleType === "weekly" ? schedulerForm.week_end_date : schedulerForm.month_end_date,
        rule_set_id: schedulerForm.rule_set_id,
        // algorithm: schedulerForm.algorithm, // Deprecated
        template_ids: schedulerForm.template_ids.length > 0 ? schedulerForm.template_ids : undefined,
        employee_ids: schedulerForm.employee_ids.length > 0 ? schedulerForm.employee_ids : undefined,
        seed: randomSeed, // Add random seed for variation
        replace_schedule_id: rerunScheduleId || undefined, // Replace existing schedule if rerunning
        decayRate,
        shiftWeights,
        overwriteLocked
      });

      toast({
        title: "Success",
        description: "Schedule regenerated successfully",
      });

      // Ensure dates are in correct format (yyyy-MM-dd) for date inputs
      if (result.week_start_date && typeof result.week_start_date === 'string' && result.week_start_date.includes('T')) {
        result.week_start_date = result.week_start_date.split('T')[0];
      }
      if (result.week_end_date && typeof result.week_end_date === 'string' && result.week_end_date.includes('T')) {
        result.week_end_date = result.week_end_date.split('T')[0];
      }

      // If rerunning, use the same schedule ID, otherwise use the new one
      const updatedSchedule = {
        ...result,
        id: rerunScheduleId || result.id, // Keep the same ID if rerunning
        assignments: normalizeAssignments(result.assignments),
        employees: result.employees || selectedSchedule?.employees || [],
        fairness_summary: result.fairness_summary || null,
        exception_suggestions: result.exception_suggestions || [],
      };

      setSelectedSchedule(updatedSchedule);
      setShowRerunDialog(false);
      setRerunScheduleId(null);
      fetchSchedules(); // Refresh the list
      setActiveTab("preview");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to regenerate schedule",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const openManualDialog = () => {
    if (!selectedSchedule?.assignments || selectedSchedule.assignments.length === 0) {
      toast({
        title: "Nothing to edit",
        description: "This schedule has no assignments to modify yet.",
      });
      return;
    }
    setManualAssignments(selectedSchedule.assignments.map((assignment) => ({ ...assignment })));
    setManualReason("");
    setShowManualDialog(true);
  };

  const updateManualAssignment = (index: number, employeeId: string) => {
    setManualAssignments((prev) =>
      prev.map((assignment, idx) =>
        idx === index ? { ...assignment, employee_id: employeeId } : assignment
      )
    );
  };

  const handleManualSave = async () => {
    if (!selectedSchedule?.id) return;
    setSavingManual(true);
    try {
      await api.manualEditSchedule(selectedSchedule.id, {
        assignments: manualAssignments.map((assignment) => ({
          id: assignment.id,
          employee_id: assignment.employee_id,
          shift_date: assignment.shift_date,
          shift_template_id: assignment.shift_template_id,
          start_time: assignment.start_time,
          end_time: assignment.end_time,
        })),
        reason: manualReason || undefined,
      });

      toast({ title: "Success", description: "Manual changes saved" });
      await handleViewSchedule(selectedSchedule.id);
      setShowManualDialog(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save manual changes",
        variant: "destructive",
      });
    } finally {
      setSavingManual(false);
    }
  };

  const handleViewSchedule = async (id: string) => {
    try {
      const schedule = await api.getSchedule(id);
      // Ensure dates are in correct format (yyyy-MM-dd for date inputs)
      if (schedule.week_start_date && schedule.week_start_date.includes('T')) {
        schedule.week_start_date = schedule.week_start_date.split('T')[0];
      }
      if (schedule.week_end_date && schedule.week_end_date.includes('T')) {
        schedule.week_end_date = schedule.week_end_date.split('T')[0];
      }
      setSelectedSchedule({
        ...schedule,
        assignments: normalizeAssignments(schedule.assignments),
        employees: schedule.employees || selectedSchedule?.employees || [],
        fairness_summary: schedule.fairness_summary || null,
        exception_suggestions: schedule.exception_suggestions || [],
      });
      setActiveTab("preview");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load schedule",
        variant: "destructive",
      });
    }
  };

  const handleApproveSchedule = async (id: string) => {
    try {
      await api.approveSchedule(id);
      toast({ title: "Success", description: "Schedule approved" });
      fetchSchedules();
      if (selectedSchedule?.id === id) {
        const updated = await api.getSchedule(id);
        setSelectedSchedule({
          ...updated,
          assignments: normalizeAssignments(updated.assignments),
          fairness_summary: updated.fairness_summary || null,
          exception_suggestions: updated.exception_suggestions || [],
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve schedule",
        variant: "destructive",
      });
    }
  };

  const handleExportCSV = async (id: string) => {
    try {
      const blob = await api.exportScheduleCSV(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schedule-${id}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Success", description: "Schedule exported" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to export schedule",
        variant: "destructive",
      });
    }
  };

  const scheduleStartDate = selectedSchedule ? parseISO(selectedSchedule.week_start_date) : null;
  const scheduleEndDate = selectedSchedule ? parseISO(selectedSchedule.week_end_date) : null;
  const totalScheduleDays =
    scheduleStartDate && scheduleEndDate
      ? differenceInCalendarDays(scheduleEndDate, scheduleStartDate) + 1
      : 0;

  useEffect(() => {
    if (scheduleStartDate) {
      setPreviewStartDate(scheduleStartDate);
    } else {
      setPreviewStartDate(null);
    }
  }, [selectedSchedule?.id, selectedSchedule?.week_start_date]);

  const previewDays = useMemo(() => {
    if (!scheduleStartDate || !scheduleEndDate || !previewStartDate) return [];
    const clampedStart = previewStartDate < scheduleStartDate ? scheduleStartDate : previewStartDate;
    if (clampedStart > scheduleEndDate) return [];
    const remaining = differenceInCalendarDays(scheduleEndDate, clampedStart) + 1;
    const length = Math.min(7, remaining);
    return Array.from({ length }, (_, i) => addDays(clampedStart, i));
  }, [previewStartDate, scheduleStartDate, scheduleEndDate]);

  const handlePreviewPrev = () => {
    if (!scheduleStartDate || previewDays.length === 0) return;
    const newStart = addDays(previewDays[0], -7);
    setPreviewStartDate(newStart < scheduleStartDate ? scheduleStartDate : newStart);
  };

  const handlePreviewNext = () => {
    if (!scheduleEndDate || previewDays.length === 0) return;
    const windowSize = previewDays.length || 7;
    const maxStart = addDays(scheduleEndDate, -(windowSize - 1));
    let newStart = addDays(previewDays[0], 7);
    if (newStart > maxStart) {
      newStart = maxStart;
    }
    setPreviewStartDate(newStart);
  };

  const canNavigatePrev =
    scheduleStartDate && previewDays.length > 0 ? previewDays[0] > scheduleStartDate : false;
  const canNavigateNext =
    scheduleEndDate && previewDays.length > 0
      ? previewDays[previewDays.length - 1] < scheduleEndDate
      : false;
  const isMultiWeekSchedule = totalScheduleDays > 7;
  const previewRangeLabel =
    previewDays.length > 0
      ? `${format(previewDays[0], "MMM dd")} - ${format(
        previewDays[previewDays.length - 1],
        "MMM dd, yyyy"
      )}`
      : "";

  // Get employees only from assignments to avoid duplicates
  const assignmentEmployees = useMemo(() => {
    if (!selectedSchedule?.assignments) return [];
    const empMap = new Map();
    selectedSchedule.assignments.forEach(assignment => {
      if (assignment.employee_id && !empMap.has(assignment.employee_id)) {
        empMap.set(assignment.employee_id, {
          id: assignment.employee_id,
          first_name: assignment.first_name,
          last_name: assignment.last_name,
        } as ScheduleEmployee);
      }
    });
    return Array.from(empMap.values());
  }, [selectedSchedule?.assignments]);

  const roster = useMemo(() => {
    // Only include employees who have assignments to avoid duplicate empty rows
    const rosterMap = new Map<string, ScheduleEmployee>();

    if (selectedSchedule?.assignments && selectedSchedule.assignments.length > 0) {
      // Get unique employee IDs from assignments
      const employeeIdsWithAssignments = new Set(
        selectedSchedule.assignments
          .map(a => a.employee_id)
          .filter(Boolean)
      );

      // Add employees from the employees list if they have assignments
      selectedSchedule?.employees?.forEach((employee) => {
        const key = employee.id || (employee as any).employee_id;
        if (key && employeeIdsWithAssignments.has(key)) {
          rosterMap.set(key, employee);
        }
      });

      // For any assignments without employee details, extract names from assignments
      employeeIdsWithAssignments.forEach((empId) => {
        if (!rosterMap.has(empId)) {
          // Try to find employee name from assignments
          const assignmentWithName = selectedSchedule.assignments.find(
            a => a.employee_id === empId && (a.first_name || a.last_name)
          );

          if (assignmentWithName) {
            rosterMap.set(empId, {
              id: empId,
              first_name: assignmentWithName.first_name,
              last_name: assignmentWithName.last_name,
            } as ScheduleEmployee);
          } else {
            // Fallback to minimal object if no name found
            rosterMap.set(empId, { id: empId } as ScheduleEmployee);
          }
        }
      });
    }

    return Array.from(rosterMap.values());
  }, [selectedSchedule?.employees, selectedSchedule?.assignments]);

  const rosterNameMap = useMemo(() => {
    const nameMap = new Map<string, string>();

    // First, add names from roster employees
    roster.forEach((employee) => {
      const key = employee.id || (employee as any).employee_id;
      const name = `${employee.first_name || ""} ${employee.last_name || ""}`.trim() ||
        (employee as any).name ||
        key;
      nameMap.set(key, name);
    });

    // Also check assignments for employee names (in case roster doesn't have them)
    if (selectedSchedule?.assignments) {
      selectedSchedule.assignments.forEach((assignment) => {
        const empId = assignment.employee_id;
        if (empId && !nameMap.has(empId)) {
          const name = `${assignment.first_name || ""} ${assignment.last_name || ""}`.trim();
          if (name) {
            nameMap.set(empId, name);
          }
        }
      });
    }

    return nameMap;
  }, [roster, selectedSchedule?.assignments]);

  const fairnessEntries = selectedSchedule?.fairness_summary
    ? Array.from(
      new Set([
        ...Object.keys(selectedSchedule.fairness_summary.priorNightCounts || {}),
        ...Object.keys(
          selectedSchedule.fairness_summary.nightShiftDistribution || {}
        ),
      ])
    ).map((employeeId) => ({
      employeeId,
      prior:
        selectedSchedule.fairness_summary?.priorNightCounts?.[employeeId] || 0,
      current:
        selectedSchedule.fairness_summary?.nightShiftDistribution?.[
        employeeId
        ] || 0,
      name: rosterNameMap.get(employeeId) || employeeId,
    }))
    : [];

  const detailedAssignments = useMemo(() => {
    if (!selectedSchedule?.assignments) return [];
    return [...selectedSchedule.assignments].sort((a, b) => {
      const dateCompare =
        new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  }, [selectedSchedule?.assignments]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground dark:text-slate-100">
              <Calendar className="h-7 w-7 text-primary" />
              Shift Management
            </h1>
            <p className="text-muted-foreground dark:text-slate-400 mt-1">
              Rule-based staff scheduling with configurable constraints
            </p>
          </div>
          <Button onClick={() => setShowSchedulerDialog(true)}>
            <Play className="mr-2 h-4 w-4" />
            Create Schedule
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="schedules">Schedules</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="rules">Rule Sets</TabsTrigger>
            <TabsTrigger value="preview" disabled={!selectedSchedule}>
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Generated Schedules</CardTitle>
                <CardDescription>View and manage weekly schedules</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : schedules.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No schedules yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {schedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50"
                      >
                        <div>
                          <p className="font-medium">
                            {format(parseISO(schedule.week_start_date), "MMM dd")} -{" "}
                            {format(parseISO(schedule.week_end_date), "MMM dd, yyyy")}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={schedule.status === "approved" ? "default" : "secondary"}>
                              {schedule.status}
                            </Badge>
                            {schedule.score !== undefined && schedule.score !== null && (
                              <span className="text-sm text-muted-foreground">
                                Score: {typeof schedule.score === 'number' ? schedule.score.toFixed(2) : schedule.score}
                              </span>
                            )}
                            {schedule.assignment_count > 0 && (
                              <span className="text-sm text-muted-foreground">
                                {schedule.assignment_count} assignments
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSchedule(schedule.id)}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRerunSchedule(schedule.id)}
                          >
                            Rerun
                          </Button>
                          {schedule.status === "draft" && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleApproveSchedule(schedule.id)}
                            >
                              Approve
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportCSV(schedule.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm(`Delete schedule for ${format(parseISO(schedule.week_start_date), "MMM dd")} - ${format(parseISO(schedule.week_end_date), "MMM dd, yyyy")}?`)) {
                                try {
                                  await api.deleteSchedule(schedule.id);
                                  toast({ title: "Success", description: "Schedule deleted" });
                                  fetchSchedules();
                                  if (selectedSchedule?.id === schedule.id) {
                                    setSelectedSchedule(null);
                                    setActiveTab("schedules");
                                  }
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message || "Failed to delete schedule",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Shift Templates</CardTitle>
                  <CardDescription>Define reusable shift patterns</CardDescription>
                </div>
                <Button onClick={() => {
                  setEditingTemplate(null);
                  setTemplateForm({
                    name: "",
                    start_time: "08:00",
                    end_time: "16:00",
                    shift_type: "day",
                    duration_hours: 8,
                    crosses_midnight: false,
                    is_default: false,
                  });
                  setShowTemplateDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Template
                </Button>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{template.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {template.start_time} - {template.end_time} ({template.shift_type})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {template.is_default && (
                            <Badge variant="default">Default</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTemplate(template);
                              setTemplateForm({
                                name: template.name,
                                start_time: template.start_time,
                                end_time: template.end_time,
                                shift_type: template.shift_type,
                                duration_hours: template.duration_hours || 8,
                                crosses_midnight: template.crosses_midnight,
                                is_default: template.is_default,
                              });
                              setShowTemplateDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm("Delete this template?")) {
                                try {
                                  await api.deleteShiftTemplate(template.id);
                                  toast({ title: "Success", description: "Template deleted" });
                                  fetchTemplates();
                                } catch (error: any) {
                                  toast({
                                    title: "Error",
                                    description: error.message,
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Rule Sets</CardTitle>
                  <CardDescription>Configure scheduling constraints and preferences</CardDescription>
                </div>
                <Button onClick={() => {
                  setEditingRuleSet(null);
                  setRuleSetForm({
                    name: "",
                    description: "",
                    is_default: false,
                    rules: [],
                  });
                  setShowRuleSetDialog(true);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Rule Set
                </Button>
              </CardHeader>
              <CardContent>
                {ruleSets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No rule sets yet. Create one to get started.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ruleSets.map((ruleSet) => (
                      <div
                        key={ruleSet.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{ruleSet.name}</p>
                          {ruleSet.description && (
                            <p className="text-sm text-muted-foreground">{ruleSet.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {ruleSet.is_default && (
                              <Badge variant="default">Default</Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {ruleSet.rules.length} rule(s)
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRuleSet(ruleSet);
                            setRuleSetForm({
                              name: ruleSet.name,
                              description: ruleSet.description || "",
                              is_default: ruleSet.is_default,
                              rules: ruleSet.rules,
                            });
                            setShowRuleSetDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            {selectedSchedule ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="text-foreground dark:text-slate-100">
                          {format(parseISO(selectedSchedule.week_start_date), "MMM dd")} -{" "}
                          {format(parseISO(selectedSchedule.week_end_date), "MMM dd, yyyy")}
                        </CardTitle>
                        <CardDescription className="text-muted-foreground dark:text-slate-400">
                          {isMultiWeekSchedule ? "Monthly shift schedule" : "Weekly shift schedule"}
                        </CardDescription>
                        {isMultiWeekSchedule && previewRangeLabel && (
                          <p className="text-sm text-muted-foreground dark:text-slate-400 mt-2">
                            Viewing {previewRangeLabel}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-3 items-start md:items-end">
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Badge variant={selectedSchedule.status === "approved" ? "default" : "secondary"}>
                            {selectedSchedule.status}
                          </Badge>
                          {selectedSchedule.evaluation && !selectedSchedule.evaluation.isValid && (
                            <Badge variant="destructive" className="text-xs">
                              <XCircle className="mr-1 h-3 w-3" />
                              {selectedSchedule.evaluation.hardViolations.length} issues
                            </Badge>
                          )}
                        </div>
                        {isMultiWeekSchedule && (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handlePreviewPrev}
                              disabled={!canNavigatePrev}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-sm text-muted-foreground dark:text-slate-400 min-w-[140px] text-center">
                              {previewRangeLabel || "—"}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={handlePreviewNext}
                              disabled={!canNavigateNext}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!selectedSchedule.assignments ||
                      selectedSchedule.assignments.length === 0 ? (
                      <Alert className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          This schedule does not have any assignments yet. Run the scheduler to generate shifts.
                        </AlertDescription>
                      </Alert>
                    ) : null}

                    {/* Week Calendar View - Improved Format */}
                    <div className="border rounded-lg overflow-hidden bg-background dark:bg-slate-900">
                      <div className="grid grid-cols-8 border-b bg-muted/50 dark:bg-slate-800/50 sticky top-0 z-10">
                        <div className="p-3 font-semibold text-sm border-r text-foreground dark:text-slate-100">Employee</div>
                        {previewDays.map((day) => (
                          <div key={day.toISOString()} className="p-2 text-center border-l font-semibold text-xs text-foreground dark:text-slate-100">
                            <div className="font-medium">{format(day, "EEE")}</div>
                            <div className="text-muted-foreground dark:text-slate-400 mt-0.5">
                              {format(day, "MMM dd")}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="divide-y divide-border dark:divide-slate-700">
                        {roster.length > 0 ? (
                          roster.map((employee, empIdx) => {
                            const employeeKey = employee.id || (employee as any).employee_id;
                            const empAssignments =
                              selectedSchedule.assignments?.filter(
                                (assignment) => assignment.employee_id === employeeKey
                              ) || [];
                            const empName =
                              rosterNameMap.get(employeeKey) ||
                              employeeKey ||
                              "Employee";

                            return (
                              <div
                                key={employeeKey}
                                className={`grid grid-cols-8 hover:bg-muted/30 dark:hover:bg-slate-800/50 transition-colors ${empIdx % 2 === 0 ? 'bg-background dark:bg-slate-900' : 'bg-muted/20 dark:bg-slate-800/30'
                                  }`}
                              >
                                <div className="p-3 border-r font-medium text-sm flex items-center text-foreground dark:text-slate-100">
                                  {empName}
                                </div>
                                {previewDays.map((day) => {
                                  const assignment = empAssignments.find(
                                    (assignment) =>
                                      assignment.shift_date === format(day, "yyyy-MM-dd")
                                  );
                                  const dayStr = format(day, "yyyy-MM-dd");
                                  const isToday = dayStr === format(new Date(), "yyyy-MM-dd");

                                  return (
                                    <div
                                      key={day.toISOString()}
                                      className={`p-2 border-l min-h-[80px] flex items-center justify-center ${isToday ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
                                        }`}
                                    >
                                      {assignment ? (
                                        <div className="w-full space-y-1.5">
                                          <Badge
                                            variant={
                                              assignment.shift_type === "night"
                                                ? "destructive"
                                                : assignment.shift_type === "evening"
                                                  ? "secondary"
                                                  : "default"
                                            }
                                            className="w-full justify-center text-xs py-1"
                                          >
                                            {assignment.template_name}
                                          </Badge>
                                          <div className="text-[11px] text-muted-foreground dark:text-slate-400 text-center leading-tight">
                                            {assignment.start_time && assignment.end_time ? (
                                              <>
                                                {formatShiftTime(assignment.start_time)}
                                                <br />
                                                <span className="text-[10px]">to</span>
                                                <br />
                                                {formatShiftTime(assignment.end_time)}
                                              </>
                                            ) : (
                                              <span className="text-muted-foreground dark:text-slate-500">—</span>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground dark:text-slate-600 text-lg">—</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })
                        ) : (
                          <div className="p-8 text-center text-muted-foreground dark:text-slate-400">
                            No employees available for this schedule
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-6">
                      <Button
                        variant="outline"
                        onClick={openManualDialog}
                        disabled={!selectedSchedule.assignments || selectedSchedule.assignments.length === 0}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Manual Edit
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleRerunSchedule(selectedSchedule.id)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Rerun Schedule
                      </Button>
                      {selectedSchedule.status === "draft" && (
                        <Button onClick={() => handleApproveSchedule(selectedSchedule.id)}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Approve Schedule
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => handleExportCSV(selectedSchedule.id)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  Select a schedule to preview
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Template Dialog */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Template" : "Create Shift Template"}
              </DialogTitle>
              <DialogDescription>
                Define a reusable shift pattern with timing and type
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm({ ...templateForm, name: e.target.value })
                  }
                  placeholder="e.g., Day Shift, Night Shift"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={templateForm.start_time}
                    onChange={(e) =>
                      setTemplateForm({ ...templateForm, start_time: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={templateForm.end_time}
                    onChange={(e) =>
                      setTemplateForm({ ...templateForm, end_time: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Shift Type</Label>
                <Select
                  value={templateForm.shift_type}
                  onValueChange={(value: any) =>
                    setTemplateForm({ ...templateForm, shift_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={templateForm.crosses_midnight}
                    onChange={(e) =>
                      setTemplateForm({
                        ...templateForm,
                        crosses_midnight: e.target.checked,
                      })
                    }
                  />
                  <Label>Crosses Midnight</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={templateForm.is_default}
                    onChange={(e) =>
                      setTemplateForm({ ...templateForm, is_default: e.target.checked })
                    }
                  />
                  <Label>Set as Default</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTemplate}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rule Set Dialog */}
        <Dialog open={showRuleSetDialog} onOpenChange={setShowRuleSetDialog}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRuleSet ? "Edit Rule Set" : "Create Rule Set"}
              </DialogTitle>
              <DialogDescription>
                Set up your scheduling rules and preferences
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={ruleSetForm.name}
                  onChange={(e) =>
                    setRuleSetForm({ ...ruleSetForm, name: e.target.value })
                  }
                  placeholder="e.g., Standard Rules"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={ruleSetForm.description}
                  onChange={(e) =>
                    setRuleSetForm({ ...ruleSetForm, description: e.target.value })
                  }
                  placeholder="Brief description of this rule set..."
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-base font-semibold">Rules</Label>
                <RuleEditor
                  rules={ruleSetForm.rules}
                  onChange={(rules) => setRuleSetForm({ ...ruleSetForm, rules })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRuleSetDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateRuleSet} disabled={!ruleSetForm.name || ruleSetForm.rules.length === 0}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rerun Schedule Dialog */}
        <Dialog open={showRerunDialog} onOpenChange={setShowRerunDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Rerun Schedule
              </DialogTitle>
              <DialogDescription>
                Modify parameters and regenerate the schedule. The new schedule will replace the current one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Week Start</Label>
                  <Input
                    type="date"
                    value={schedulerForm.week_start_date}
                    onChange={(e) =>
                      setSchedulerForm({
                        ...schedulerForm,
                        week_start_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Week End</Label>
                  <Input
                    type="date"
                    value={schedulerForm.week_end_date}
                    onChange={(e) =>
                      setSchedulerForm({
                        ...schedulerForm,
                        week_end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Rule Set</Label>
                <Select
                  value={schedulerForm.rule_set_id}
                  onValueChange={(value) =>
                    setSchedulerForm({ ...schedulerForm, rule_set_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rule set" />
                  </SelectTrigger>
                  <SelectContent>
                    {ruleSets.map((rs) => (
                      <SelectItem key={rs.id} value={rs.id}>
                        {rs.name} {rs.is_default && "(Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4 border rounded-md p-3 bg-muted/20">
                <h4 className="font-medium text-sm">ScoreRank Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Decay Rate (0-1)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={decayRate}
                      onChange={(e) => setDecayRate(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="rerun-overwrite"
                        checked={overwriteLocked}
                        onChange={(e) => setOverwriteLocked(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="rerun-overwrite">Overwrite Locked</Label>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Shift Weights</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Morning</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.morning}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, morning: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Evening</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.evening}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, evening: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Night</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.night}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, night: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This will generate a new schedule. You can compare results and choose which one to keep.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowRerunDialog(false);
                setRerunScheduleId(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleRerun} disabled={generating}>
                {generating ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Rerun Schedule
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Scheduler Dialog */}
        <Dialog open={showSchedulerDialog} onOpenChange={setShowSchedulerDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Generate Schedule</DialogTitle>
              <DialogDescription>
                Configure parameters and run the scheduler
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Week Start</Label>
                  <Input
                    type="date"
                    value={schedulerForm.week_start_date}
                    onChange={(e) =>
                      setSchedulerForm({
                        ...schedulerForm,
                        week_start_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Week End</Label>
                  <Input
                    type="date"
                    value={schedulerForm.week_end_date}
                    onChange={(e) =>
                      setSchedulerForm({
                        ...schedulerForm,
                        week_end_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Rule Set</Label>
                <Select
                  value={schedulerForm.rule_set_id}
                  onValueChange={(value) =>
                    setSchedulerForm({ ...schedulerForm, rule_set_id: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rule set" />
                  </SelectTrigger>
                  <SelectContent>
                    {ruleSets.map((rs) => (
                      <SelectItem key={rs.id} value={rs.id}>
                        {rs.name} {rs.is_default && "(Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4 border rounded-md p-3 bg-muted/20">
                <h4 className="font-medium text-sm">ScoreRank Settings</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Decay Rate (0-1)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={decayRate}
                      onChange={(e) => setDecayRate(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="scheduler-overwrite"
                        checked={overwriteLocked}
                        onChange={(e) => setOverwriteLocked(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="scheduler-overwrite">Overwrite Locked</Label>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Shift Weights</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Morning</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.morning}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, morning: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Evening</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.evening}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, evening: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Night</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={shiftWeights.night}
                        onChange={(e) => setShiftWeights({ ...shiftWeights, night: parseFloat(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSchedulerDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleRunScheduler} disabled={generating}>
                {generating ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Scheduler
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manual Edit Dialog */}
        <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Manual Edit</DialogTitle>
              <DialogDescription>
                Reassign shifts or override assignments. Changes will be logged with your name.
              </DialogDescription>
            </DialogHeader>
            {manualAssignments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No assignments available to edit.
              </div>
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                {manualAssignments.map((assignment, index) => (
                  <div
                    key={assignment.id || `${assignment.employee_id}-${assignment.shift_date}-${index}`}
                    className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center border rounded-lg p-3"
                  >
                    <div>
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div className="font-medium">{assignment.shift_date}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Shift</div>
                      <div className="font-medium">{assignment.template_name || 'Shift'}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatShiftTime(assignment.start_time)} - {formatShiftTime(assignment.end_time)}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-muted-foreground">Assign To</div>
                      <Select
                        value={assignment.employee_id}
                        onValueChange={(value) => updateManualAssignment(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {roster.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {`${employee.first_name || ''} ${employee.last_name || ''}`.trim() || employee.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Assignment Type</div>
                      <Badge variant={assignment.assigned_by === 'manual' ? 'secondary' : 'outline'}>
                        {assignment.assigned_by === 'manual' ? 'Manual' : 'Algorithm'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Explain why you are overriding the schedule"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManualDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleManualSave} disabled={savingManual || manualAssignments.length === 0}>
                {savingManual ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

