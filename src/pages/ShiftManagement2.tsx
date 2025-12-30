import { useEffect, useMemo, useState } from "react";
import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Download, RefreshCcw, Users, Edit, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRangeSelector } from "@/components/common/DateRangeSelector";

type ShiftType = "morning" | "evening" | "night" | "custom";

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  shift_type: ShiftType;
}

interface EmployeeLite {
  id: string;
  name: string;
  status?: string;
  home_assignment?: {
    branch_id?: string;
    branch_name?: string;
    department_id?: string;
    department_name?: string;
    team_id?: string;
    team_name?: string;
  };
  assignments?: Array<{
    branch_id?: string;
    branch_name?: string;
    department_id?: string;
    department_name?: string;
    team_id?: string;
    team_name?: string;
  }>;
}

interface TeamLite {
  id: string;
  name: string;
}

interface BranchLite {
  id: string;
  name: string;
}

interface DepartmentLite {
  id: string;
  name: string;
}

interface DateRange {
  from?: Date;
  to?: Date;
}

interface Rules {
  enableEqualDistribution: boolean;
  maxConsecutiveNights: number;
  minRestHours: number;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
  maxShiftsPerWeek: number;
  minShiftsPerWeek: number;
  alternateWeekShifts: boolean; // If worked many nights last week, fewer this week
  preferredShiftRotation: "balanced" | "strict_alternate" | "random";
  nightShiftCoverage: number; // How many people needed for night shift per day
  dayShiftCoverage: number; // How many people needed for day shift per day
  eveningShiftCoverage: number; // How many people needed for evening shift per day
  permitShiftCoverage: number; // How many people needed for permit shift per day
}

interface ShiftAssignment {
  employeeId: string;
  date: string; // yyyy-MM-dd
  templateId: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  status: "scheduled" | "published";
}

function makePeriod(range: DateRange): Date[] {
  if (!range.from || !range.to) return [];
  return eachDayOfInterval({ start: range.from, end: range.to });
}

function toDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function generateBalancedSchedule(
  employees: EmployeeLite[],
  templates: ShiftTemplate[],
  period: Date[],
  rules: Rules,
  holidayDates: Set<string> = new Set(),
  previousWeekData: Record<string, { nights: number; days: number; evenings: number }> = {},
  historicalStats: Array<{
    employee_id: string;
    night_shifts: number;
    day_shifts: number;
    evening_shifts: number;
    custom_shifts: number;
    adhoc_shifts: number;
    total_shifts: number;
  }> = []
): ShiftAssignment[] {
  if (!employees.length || !templates.length || !period.length) return [];

  const schedule: ShiftAssignment[] = [];
  const assignmentsByEmployee: Record<string, ShiftAssignment[]> = {};
  const shiftCountsByEmployee: Record<string, { nights: number; days: number; evenings: number; custom: number }> = {};
  
  employees.forEach((e) => {
    assignmentsByEmployee[e.id] = [];
    shiftCountsByEmployee[e.id] = { nights: 0, days: 0, evenings: 0, custom: 0 };
  });

  const isNight = (t: ShiftTemplate) => t.shift_type === "night";
  const isDay = (t: ShiftTemplate) => t.shift_type === "morning";
  const isEvening = (t: ShiftTemplate) => t.shift_type === "evening";

  const getConsecutiveNights = (employeeId: string, date: string) => {
    const list = assignmentsByEmployee[employeeId];
    const target = parseISO(date);
    let streak = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      if (!isNight(templates.find((t) => t.id === a.templateId)!)) break;
      const d = parseISO(a.date);
      if (d.getTime() === addDays(target, -1 * (list.length - 1 - i)).getTime()) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  const getLastEnd = (employeeId: string): Date | null => {
    const list = assignmentsByEmployee[employeeId];
    if (!list.length) return null;
    const last = list[list.length - 1];
    return toDateTime(last.date, last.endTime);
  };

  const getShiftsThisWeek = (employeeId: string) => {
    return assignmentsByEmployee[employeeId].length;
  };

  // Filter period to exclude weekends and holidays
  const workingDays = period.filter((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayOfWeek = day.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Exclude weekends
    if (rules.excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return false;
    }
    
    // Exclude holidays
    if (rules.excludeHolidays && holidayDates.has(dateStr)) {
      return false;
    }
    
    return true;
  });

  // Calculate shifts needed per employee (distribute evenly)
  const totalShiftsNeeded = workingDays.length * templates.length;
  const shiftsPerEmployee = Math.floor(totalShiftsNeeded / employees.length);
  const remainder = totalShiftsNeeded % employees.length;

  // Create a list of all day-template combinations, shuffled for fairness
  const dayTemplatePairs: Array<{ day: Date; template: ShiftTemplate }> = [];
  workingDays.forEach((day) => {
    templates.forEach((template) => {
      dayTemplatePairs.push({ day, template });
    });
  });

  // Calculate target shifts per employee: each employee should work approximately all working days
  const targetShiftsPerEmployee = workingDays.length;
  console.log(`[ScheduleGen] Target: ${targetShiftsPerEmployee} shifts per employee for ${workingDays.length} working days`);

  // Group templates by type
  const nightTemplates = templates.filter((t) => isNight(t));
  const dayTemplates = templates.filter((t) => isDay(t));
  const eveningTemplates = templates.filter((t) => isEvening(t));
  const customTemplates = templates.filter((t) => !isNight(t) && !isDay(t) && !isEvening(t));

  // Create a pool of all day-template combinations
  const allAssignments: Array<{ day: Date; template: ShiftTemplate; dateStr: string }> = [];
  workingDays.forEach((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    
    // Add night shifts based on coverage requirement
    for (let i = 0; i < rules.nightShiftCoverage; i++) {
      const template = nightTemplates[i % nightTemplates.length];
      if (template) {
        allAssignments.push({ day, template, dateStr });
      }
    }
    
    // Add day shifts based on coverage requirement
    for (let i = 0; i < rules.dayShiftCoverage; i++) {
      const template = dayTemplates[i % dayTemplates.length];
      if (template) {
        allAssignments.push({ day, template, dateStr });
      }
    }
    
    // Add evening shifts (one per template)
    eveningTemplates.forEach((template) => {
      allAssignments.push({ day, template, dateStr });
    });
    
    // Add custom shifts (one per template)
    customTemplates.forEach((template) => {
      allAssignments.push({ day, template, dateStr });
    });
  });

  // Shuffle assignments for better distribution
  for (let i = allAssignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allAssignments[i], allAssignments[j]] = [allAssignments[j], allAssignments[i]];
  }

  // Track which employees have been assigned to which days (to avoid double-booking same day)
  const employeeDayAssignments: Record<string, Set<string>> = {};
  employees.forEach((e) => {
    employeeDayAssignments[e.id] = new Set();
  });

  // Assign shifts to employees, ensuring each gets approximately equal number
  allAssignments.forEach(({ day, template, dateStr }) => {
    // Find eligible employees for this assignment
    const eligible = employees.filter((e) => {
      // Check if employee already has a shift on this day (prevent double-booking)
      if (employeeDayAssignments[e.id].has(dateStr)) return false;

      // Night shift constraints
      if (isNight(template)) {
        if (rules.maxConsecutiveNights > 0) {
          const nights = getConsecutiveNights(e.id, dateStr);
          if (nights >= rules.maxConsecutiveNights) return false;
        }
        
        // Week alternation
        if (rules.alternateWeekShifts && previousWeekData[e.id]) {
          const prevNights = previousWeekData[e.id].nights;
          const currentNights = shiftCountsByEmployee[e.id].nights;
          if (prevNights >= 3 && currentNights >= 2) return false;
        }
      }

      // Rest period constraint
      if (rules.minRestHours > 0) {
        const lastEnd = getLastEnd(e.id);
        if (lastEnd) {
          const nextStart = toDateTime(dateStr, template.start_time);
          const diffHours = (nextStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
          if (diffHours < rules.minRestHours) return false;
        }
      }

      // Weekly shift limit (approximate - check if employee has reached target)
      const currentShifts = assignmentsByEmployee[e.id].length;
      if (currentShifts >= targetShiftsPerEmployee) return false;

      return true;
    });

    if (eligible.length === 0) return; // No eligible employees

    // Calculate probability-based weights using historical data
    const calculateProbability = (emp: EmployeeLite, template: ShiftTemplate): number => {
      let baseWeight = 1.0;
      
      // Find historical stats for this employee
      const histStat = historicalStats.find((s) => s.employee_id === emp.id);
      
      if (histStat && histStat.total_shifts > 0) {
        // Calculate average shift counts across all employees
        const avgNightShifts = historicalStats.reduce((sum, s) => sum + s.night_shifts, 0) / historicalStats.length || 0;
        const avgDayShifts = historicalStats.reduce((sum, s) => sum + s.day_shifts, 0) / historicalStats.length || 0;
        const avgEveningShifts = historicalStats.reduce((sum, s) => sum + s.evening_shifts, 0) / historicalStats.length || 0;
        const avgCustomShifts = historicalStats.reduce((sum, s) => sum + s.custom_shifts, 0) / historicalStats.length || 0;
        
        // Calculate probability adjustment based on historical distribution
        if (isNight(template)) {
          // If employee had more night shifts than average, reduce probability
          const ratio = avgNightShifts > 0 ? histStat.night_shifts / avgNightShifts : 1;
          // Inverse relationship: more historical nights = lower probability
          baseWeight = 1.0 / (1.0 + (ratio - 1.0) * 0.5); // Scale factor 0.5 for gradual adjustment
        } else if (isDay(template)) {
          const ratio = avgDayShifts > 0 ? histStat.day_shifts / avgDayShifts : 1;
          baseWeight = 1.0 / (1.0 + (ratio - 1.0) * 0.5);
        } else if (isEvening(template)) {
          const ratio = avgEveningShifts > 0 ? histStat.evening_shifts / avgEveningShifts : 1;
          baseWeight = 1.0 / (1.0 + (ratio - 1.0) * 0.5);
        } else {
          const ratio = avgCustomShifts > 0 ? histStat.custom_shifts / avgCustomShifts : 1;
          baseWeight = 1.0 / (1.0 + (ratio - 1.0) * 0.5);
        }
      } else {
        // New employee: start with medium probability (0.5-1.0 range)
        baseWeight = 0.75; // Medium starting probability
      }
      
      // Adjust based on current assignment count (fairness)
      const currentCount = assignmentsByEmployee[emp.id].length;
      const fairnessAdjustment = 1.0 + (targetShiftsPerEmployee - currentCount) / targetShiftsPerEmployee;
      
      return baseWeight * fairnessAdjustment;
    };
    
    // Pick employee using probability-weighted selection
    const eligibleWithWeights = eligible.map((emp) => ({
      employee: emp,
      weight: calculateProbability(emp, template),
    }));
    
    // Normalize weights
    const totalWeight = eligibleWithWeights.reduce((sum, e) => sum + e.weight, 0);
    const normalized = eligibleWithWeights.map((e) => ({
      ...e,
      probability: e.weight / totalWeight,
    }));
    
    // Select based on probability (with some randomness for fairness)
    let chosen: EmployeeLite | null = null;
    const random = Math.random();
    let cumulative = 0;
    
    for (const item of normalized) {
      cumulative += item.probability;
      if (random <= cumulative) {
        chosen = item.employee;
        break;
      }
    }
    
    // Fallback to least assigned if probability selection fails
    if (!chosen) {
      chosen = eligible.reduce((best, current) => {
        if (!best) return current;
        return assignmentsByEmployee[current.id].length < assignmentsByEmployee[best.id].length ? current : best;
      }, eligible[0] as EmployeeLite | null);
    }

    if (!chosen) return;

    const assignment: ShiftAssignment = {
      employeeId: chosen.id,
      date: dateStr,
      templateId: template.id,
      shiftType: template.shift_type,
      startTime: template.start_time,
      endTime: template.end_time,
      status: "scheduled",
    };

    schedule.push(assignment);
    assignmentsByEmployee[chosen.id].push(assignment);
    employeeDayAssignments[chosen.id].add(dateStr);
    
    // Update shift counts
    if (isNight(template)) shiftCountsByEmployee[chosen.id].nights++;
    else if (isDay(template)) shiftCountsByEmployee[chosen.id].days++;
    else if (isEvening(template)) shiftCountsByEmployee[chosen.id].evenings++;
    else shiftCountsByEmployee[chosen.id].custom++;
  });

  // Fill remaining shifts to reach target per employee
  // This ensures every employee gets approximately equal number of shifts
  const remainingAssignments: Array<{ day: Date; template: ShiftTemplate; dateStr: string }> = [];
  
  employees.forEach((emp) => {
    const currentShifts = assignmentsByEmployee[emp.id].length;
    const needed = Math.max(0, targetShiftsPerEmployee - currentShifts);
    
    // Find days where this employee doesn't have a shift yet
    const availableDays = workingDays.filter((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      return !employeeDayAssignments[emp.id].has(dateStr);
    });
    
    // Shuffle available days
    for (let i = availableDays.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableDays[i], availableDays[j]] = [availableDays[j], availableDays[i]];
    }
    
    // Assign remaining shifts, rotating through templates
    for (let i = 0; i < needed && i < availableDays.length; i++) {
      const day = availableDays[i];
      const dateStr = format(day, "yyyy-MM-dd");
      
      // Rotate through templates: prefer day shifts, then evening, then night
      let template: ShiftTemplate | null = null;
      const templateIndex = i % templates.length;
      
      // Try to balance shift types
      const nights = shiftCountsByEmployee[emp.id].nights;
      const days = shiftCountsByEmployee[emp.id].days;
      const evenings = shiftCountsByEmployee[emp.id].evenings;
      
      if (days < nights && dayTemplates.length > 0) {
        template = dayTemplates[i % dayTemplates.length];
      } else if (evenings < nights && eveningTemplates.length > 0) {
        template = eveningTemplates[i % eveningTemplates.length];
      } else if (nightTemplates.length > 0 && nights < targetShiftsPerEmployee * 0.4) {
        // Only assign night if not too many already
        template = nightTemplates[i % nightTemplates.length];
      } else {
        // Fallback to any available template
        template = templates[templateIndex % templates.length];
      }
      
      if (!template) continue;
      
      // Check constraints
      if (isNight(template) && rules.maxConsecutiveNights > 0) {
        const consecutiveNights = getConsecutiveNights(emp.id, dateStr);
        if (consecutiveNights >= rules.maxConsecutiveNights) {
          // Try a different template
          const nonNightTemplates = templates.filter((t) => !isNight(t));
          if (nonNightTemplates.length > 0) {
            template = nonNightTemplates[i % nonNightTemplates.length];
          } else {
            continue; // Skip if can't find alternative
          }
        }
      }
      
      if (rules.minRestHours > 0) {
        const lastEnd = getLastEnd(emp.id);
        if (lastEnd) {
          const nextStart = toDateTime(dateStr, template.start_time);
          const diffHours = (nextStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
          if (diffHours < rules.minRestHours) {
            continue; // Skip this assignment
          }
        }
      }
      
      const assignment: ShiftAssignment = {
        employeeId: emp.id,
        date: dateStr,
        templateId: template.id,
        shiftType: template.shift_type,
        startTime: template.start_time,
        endTime: template.end_time,
        status: "scheduled",
      };

      schedule.push(assignment);
      assignmentsByEmployee[emp.id].push(assignment);
      employeeDayAssignments[emp.id].add(dateStr);
      
      // Update shift counts
      if (isNight(template)) shiftCountsByEmployee[emp.id].nights++;
      else if (isDay(template)) shiftCountsByEmployee[emp.id].days++;
      else if (isEvening(template)) shiftCountsByEmployee[emp.id].evenings++;
      else shiftCountsByEmployee[emp.id].custom++;
    }
  });

  console.log(`[ScheduleGen] Generated ${schedule.length} total shifts`);
  employees.forEach((emp) => {
    console.log(`[ScheduleGen] Employee ${emp.name}: ${assignmentsByEmployee[emp.id].length} shifts`);
  });

  return schedule;
}

export default function ShiftManagement2() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);

  const [rules, setRules] = useState<Rules>({
    enableEqualDistribution: true,
    maxConsecutiveNights: 2,
    minRestHours: 10,
    excludeWeekends: true,
    excludeHolidays: true,
    maxShiftsPerWeek: 5,
    minShiftsPerWeek: 3,
    alternateWeekShifts: true,
    preferredShiftRotation: "balanced",
    nightShiftCoverage: 1,
    dayShiftCoverage: 1,
    eveningShiftCoverage: 0,
    permitShiftCoverage: 0,
  });
  const [previousWeekShifts, setPreviousWeekShifts] = useState<Record<string, { nights: number; days: number; evenings: number }>>({});
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [editTemplateOpen, setEditTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [reassignShiftId, setReassignShiftId] = useState<string>("");
  const [reassignEmployeeId, setReassignEmployeeId] = useState<string>("");
  const [publishing, setPublishing] = useState(false);
  const [publishedSchedules, setPublishedSchedules] = useState<Array<{
    id: string;
    period: string;
    employeeCount: number;
    shiftCount: number;
    publishedAt: string;
  }>>([]);
  const [viewMode, setViewMode] = useState<"generate" | "published" | "statistics">("generate");
  const [shiftStatistics, setShiftStatistics] = useState<Array<{
    employee_id: string;
    employee_code: string;
    employee_name: string;
    night_shifts: number;
    day_shifts: number;
    evening_shifts: number;
    custom_shifts: number;
    adhoc_shifts: number;
    total_shifts: number;
    night_percentage: string;
    day_percentage: string;
    evening_percentage: string;
    custom_percentage: string;
    adhoc_percentage: string;
    lastMonthTotal?: number;
    trend?: 'up' | 'down' | 'same';
  }>>([]);
  const [loadingStatistics, setLoadingStatistics] = useState(false);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [lastMonthStats, setLastMonthStats] = useState<Array<{
    employee_id: string;
    total_shifts: number;
  }>>([]);

  const [selectedScope, setSelectedScope] = useState<string>("all"); // all | team:<id> | branch:<id> | department:<id>
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [schedule, setSchedule] = useState<ShiftAssignment[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    assignment: ShiftAssignment | null;
  }>({ open: false, assignment: null });
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState<{
    name: string;
    shift_type: ShiftType;
    start_time: string;
    end_time: string;
  }>({
    name: "",
    shift_type: "morning",
    start_time: "09:00",
    end_time: "17:00",
  });

  const loadStatistics = async (startDate: Date, endDate: Date) => {
    setLoadingStatistics(true);
    try {
      const stats = await api.getShiftStatistics({
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
      });
      
      // Also load last month's stats for comparison
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      
      try {
        const lastMonthData = await api.getShiftStatistics({
          start_date: format(lastMonthStart, "yyyy-MM-dd"),
          end_date: format(lastMonthEnd, "yyyy-MM-dd"),
        });
        setLastMonthStats(lastMonthData.statistics || []);
        
        // Merge with trend indicators
        const statsWithTrends = (stats.statistics || []).map((stat: any) => {
          const lastMonthStat = (lastMonthData.statistics || []).find((s: any) => s.employee_id === stat.employee_id);
          const lastTotal = lastMonthStat?.total_shifts || 0;
          const currentTotal = stat.total_shifts || 0;
          let trend: 'up' | 'down' | 'same' = 'same';
          if (currentTotal > lastTotal) trend = 'up';
          else if (currentTotal < lastTotal) trend = 'down';
          
          return {
            ...stat,
            lastMonthTotal: lastTotal,
            trend,
          };
        });
        
        // Sort by total (descending by default)
        statsWithTrends.sort((a, b) => {
          return sortOrder === "desc" ? b.total_shifts - a.total_shifts : a.total_shifts - b.total_shifts;
        });
        
        setShiftStatistics(statsWithTrends);
      } catch (err) {
        console.warn("[ShiftManagement2] Could not load last month stats:", err);
        // Sort current stats
        const sorted = (stats.statistics || []).sort((a: any, b: any) => {
          return sortOrder === "desc" ? b.total_shifts - a.total_shifts : a.total_shifts - b.total_shifts;
        });
        setShiftStatistics(sorted);
      }
    } catch (err: any) {
      console.error("[ShiftManagement2] Failed to load statistics", err);
      toast({
        title: "Failed to load statistics",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingStatistics(false);
    }
  };
  
  // Auto-load statistics on mount (last month to this month)
  useEffect(() => {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    loadStatistics(lastMonthStart, now);
  }, [sortOrder]); // Reload when sort order changes

  useEffect(() => {
    const load = async () => {
      try {
        const [tpls, emps, teamList, branchList, branchHierarchy] = await Promise.all([
          api.getShiftTemplates(),
          api.getEmployees(),
          api.getTeams({} as any),
          api.getBranches(),
          api.getBranchHierarchy(),
        ]);
        setTemplates(
          (tpls || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            start_time: t.start_time,
            end_time: t.end_time,
            shift_type: (t.shift_type || "custom") as ShiftType,
          }))
        );
        const mappedEmployees = (emps || []).map((e: any) => ({
            id: e.id,
            name: `${e.profiles?.first_name || ""} ${e.profiles?.last_name || ""}`.trim() || e.employee_id || "Employee",
            status: e.status || "active",
            home_assignment: e.home_assignment || {},
            assignments: e.assignments || [],
          }));
        setEmployees(mappedEmployees);
        // Initialize scoped employees to all employees when first loaded
        setScopedEmployees(mappedEmployees);
        setSelectedEmployeeIds(mappedEmployees.map((e: EmployeeLite) => e.id));
        setTeams((teamList || []).map((t: any) => ({ id: t.id, name: t.name || "Team" })));
        setBranches((branchList || []).map((b: any) => ({ id: b.id, name: b.name || b.branch_name || "Branch" })));
        setDepartments((branchHierarchy?.departments || []).map((d: any) => ({ id: d.id, name: d.name || "Department" })));
        
        // Load published schedules
        try {
          const schedules = await api.getSchedules({ status: "published" });
          console.log("[ShiftManagement2] Published schedules response:", schedules);
          if (Array.isArray(schedules) && schedules.length > 0) {
            const formatted = schedules.map((s: any) => {
              // Handle date strings or Date objects
              const startDate = s.week_start_date || s.start_date;
              const endDate = s.week_end_date || s.end_date;
              const start = startDate ? (typeof startDate === 'string' ? parseISO(startDate.split('T')[0]) : new Date(startDate)) : new Date();
              const end = endDate ? (typeof endDate === 'string' ? parseISO(endDate.split('T')[0]) : new Date(endDate)) : new Date();
              
              // Get unique employee count from assignments if available
              const employeeCount = s.unique_employee_count || s.employee_count || 0;
              const shiftCount = s.assignment_count || s.shift_count || 0;
              
              return {
                id: s.id,
                period: `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`,
                employeeCount,
                shiftCount,
                publishedAt: s.created_at || s.updated_at || s.published_at || new Date().toISOString(),
              };
            });
            console.log("[ShiftManagement2] Formatted published schedules:", formatted);
            setPublishedSchedules(formatted);
          } else {
            console.log("[ShiftManagement2] No published schedules found");
            setPublishedSchedules([]);
          }
        } catch (err: any) {
          console.warn("[ShiftManagement2] Could not load published schedules:", err);
          // Don't show error toast for this, just log it
          setPublishedSchedules([]);
        }
      } catch (e: any) {
        console.error("[ShiftManagement2] Init error", e);
        toast({
          title: "Failed to load data",
          description: e?.message || "Unable to load shift configuration.",
          variant: "destructive",
        });
      }
    };
    load();
  }, [toast]);

  // Load holidays when date range changes
  useEffect(() => {
    const loadHolidays = async () => {
      if (!dateRange.from || !dateRange.to) {
        setHolidays(new Set());
        return;
      }
      try {
        // Fetch holidays from calendar API
        const calendarData = await api.getCalendar({
          start_date: format(dateRange.from, "yyyy-MM-dd"),
          end_date: format(dateRange.to, "yyyy-MM-dd"),
        });
        const holidayDates = new Set<string>();
        if (calendarData?.events) {
          calendarData.events.forEach((ev: any) => {
            if (ev.resource?.type === "holiday" && ev.start) {
              const dateStr = ev.start.split("T")[0];
              holidayDates.add(dateStr);
            }
          });
        }
        setHolidays(holidayDates);
      } catch (e) {
        console.error("[ShiftManagement2] Failed to load holidays", e);
        setHolidays(new Set());
      }
    };
    loadHolidays();
  }, [dateRange.from, dateRange.to]);

  const period = useMemo(() => makePeriod(dateRange), [dateRange]);

  const [scopedEmployees, setScopedEmployees] = useState<EmployeeLite[]>([]);

  // Filter employees by scope (team/branch)
  useEffect(() => {
    const updateScoped = async () => {
      if (selectedScope === "all") {
        setScopedEmployees(employees);
        // Keep existing selections if they're still valid
        setSelectedEmployeeIds((prev) => prev.filter(id => employees.some(e => e.id === id)));
        return;
      }
      if (selectedScope.startsWith("team:")) {
        const teamId = selectedScope.replace("team:", "");
        try {
          const membersResponse = await api.getTeamMembers(teamId);
          // API returns { members: [...] } structure
          const members = membersResponse?.members || (Array.isArray(membersResponse) ? membersResponse : []);
          console.log("[ShiftManagement2] Team members response:", membersResponse);
          console.log("[ShiftManagement2] Team members array:", members);
          
          // Team members API returns { employee_id, ... } - match with employees by id
          // The employee_id field in team_memberships matches employees.id
          const memberEmployeeIds = new Set(
            members.map((m: any) => {
              // The API returns employee_id field from team_memberships
              return m.employee_id || m.id || m.employee?.id;
            }).filter(Boolean)
          );
          console.log("[ShiftManagement2] Member employee_ids from team:", Array.from(memberEmployeeIds));
          console.log("[ShiftManagement2] All employees IDs:", employees.map(e => e.id));
          console.log("[ShiftManagement2] All employees:", employees.map(e => ({ id: e.id, name: e.name })));
          
          // Filter employees where their id matches the employee_id from team members
          // Include ALL employees that match, regardless of status
          const filtered = employees.filter((e) => {
            const matches = memberEmployeeIds.has(e.id);
            if (matches) {
              console.log("[ShiftManagement2] Matched employee:", e.id, e.name);
            }
            return matches;
          });
          console.log("[ShiftManagement2] Filtered employees count:", filtered.length);
          console.log("[ShiftManagement2] Filtered employee names:", filtered.map(e => e.name));
          
          if (filtered.length === 0) {
            console.warn("[ShiftManagement2] No employees matched team members. Team members:", members);
            console.warn("[ShiftManagement2] Available employee IDs:", employees.map(e => e.id));
            toast({
              title: "No team members found",
              description: `Team has ${members.length} member(s) but none match loaded employees. Check team assignments.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Team selected",
              description: `Found ${filtered.length} team member(s).`,
            });
          }
          
          setScopedEmployees(filtered);
          setSelectedEmployeeIds(filtered.map((e) => e.id));
        } catch (err: any) {
          console.error("[ShiftManagement2] Error fetching team members:", err);
          toast({
            title: "Failed to load team members",
            description: err?.message || "Please try again.",
            variant: "destructive",
          });
          setScopedEmployees([]);
          setSelectedEmployeeIds([]);
        }
        return;
      }
      if (selectedScope.startsWith("branch:")) {
        const branchId = selectedScope.replace("branch:", "");
        console.log("[ShiftManagement2] Filtering by branch:", branchId);
        console.log("[ShiftManagement2] Total employees:", employees.length);
        console.log("[ShiftManagement2] Sample employee assignments:", employees.slice(0, 3).map(e => ({
          id: e.id,
          name: e.name,
          home_assignment: e.home_assignment,
          assignments: e.assignments,
          home_branch_id: e.home_assignment?.branch_id,
          assignment_branch_ids: (e.assignments || []).map((a: any) => a.branch_id).filter(Boolean)
        })));
        
        // Filter employees by branch using home_assignment or assignments
        // Include ALL employees that match, regardless of status
        // Normalize IDs to strings for comparison (handles UUIDs)
        const normalizedBranchId = String(branchId).trim();
        const filtered = employees.filter((e) => {
          // Check home assignment first
          const homeBranchId = e.home_assignment?.branch_id;
          if (homeBranchId && String(homeBranchId).trim() === normalizedBranchId) {
            console.log("[ShiftManagement2] Matched via home_assignment:", e.id, e.name, homeBranchId);
            return true;
          }
          
          // Check all assignments
          const hasBranchAssignment = (e.assignments || []).some((a: any) => {
            const assignmentBranchId = a.branch_id;
            if (assignmentBranchId && String(assignmentBranchId).trim() === normalizedBranchId) {
              console.log("[ShiftManagement2] Matched via assignment:", e.id, e.name, assignmentBranchId);
              return true;
            }
            return false;
          });
          
          return hasBranchAssignment;
        });
        
        console.log("[ShiftManagement2] Branch employees filtered:", filtered.length);
        console.log("[ShiftManagement2] Filtered employee names:", filtered.map(e => e.name));
        console.log("[ShiftManagement2] Branch ID used for filtering:", normalizedBranchId);
        
        if (filtered.length === 0) {
          // Provide more helpful error message
          const employeesWithAssignments = employees.filter(e => 
            e.home_assignment?.branch_id || (e.assignments || []).some((a: any) => a.branch_id)
          );
          console.warn("[ShiftManagement2] No employees matched branch. Employees with assignments:", employeesWithAssignments.length);
          toast({
            title: "No branch employees found",
            description: `No employees are assigned to this branch. ${employeesWithAssignments.length > 0 ? `${employeesWithAssignments.length} employee(s) have other branch assignments.` : 'Check employee assignments.'}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Branch selected",
            description: `Found ${filtered.length} employee(s) in this branch.`,
          });
        }
        setScopedEmployees(filtered);
        setSelectedEmployeeIds(filtered.map((e) => e.id));
        return;
      }
      if (selectedScope.startsWith("department:")) {
        const departmentId = selectedScope.replace("department:", "");
        console.log("[ShiftManagement2] Filtering by department:", departmentId);
        console.log("[ShiftManagement2] Total employees:", employees.length);
        console.log("[ShiftManagement2] Sample employee assignments:", employees.slice(0, 3).map(e => ({
          id: e.id,
          name: e.name,
          home_assignment: e.home_assignment,
          assignments: e.assignments,
          home_department_id: e.home_assignment?.department_id,
          assignment_department_ids: (e.assignments || []).map((a: any) => a.department_id).filter(Boolean)
        })));
        
        // Filter employees by department using home_assignment or assignments
        // Include ALL employees that match, regardless of status
        // Normalize IDs to strings for comparison (handles UUIDs)
        const normalizedDepartmentId = String(departmentId).trim();
        const filtered = employees.filter((e) => {
          // Check home assignment first
          const homeDepartmentId = e.home_assignment?.department_id;
          if (homeDepartmentId && String(homeDepartmentId).trim() === normalizedDepartmentId) {
            console.log("[ShiftManagement2] Matched via home_assignment:", e.id, e.name, homeDepartmentId);
            return true;
          }
          
          // Check all assignments
          const hasDepartmentAssignment = (e.assignments || []).some((a: any) => {
            const assignmentDepartmentId = a.department_id;
            if (assignmentDepartmentId && String(assignmentDepartmentId).trim() === normalizedDepartmentId) {
              console.log("[ShiftManagement2] Matched via assignment:", e.id, e.name, assignmentDepartmentId);
              return true;
            }
            return false;
          });
          
          return hasDepartmentAssignment;
        });
        
        console.log("[ShiftManagement2] Department employees filtered:", filtered.length);
        console.log("[ShiftManagement2] Filtered employee names:", filtered.map(e => e.name));
        console.log("[ShiftManagement2] Department ID used for filtering:", normalizedDepartmentId);
        
        if (filtered.length === 0) {
          // Provide more helpful error message
          const employeesWithAssignments = employees.filter(e => 
            e.home_assignment?.department_id || (e.assignments || []).some((a: any) => a.department_id)
          );
          console.warn("[ShiftManagement2] No employees matched department. Employees with assignments:", employeesWithAssignments.length);
          toast({
            title: "No department employees found",
            description: `No employees are assigned to this department. ${employeesWithAssignments.length > 0 ? `${employeesWithAssignments.length} employee(s) have other department assignments.` : 'Check employee assignments.'}`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Department selected",
            description: `Found ${filtered.length} employee(s) in this department.`,
          });
        }
        setScopedEmployees(filtered);
        setSelectedEmployeeIds(filtered.map((e) => e.id));
        return;
      }
      setScopedEmployees(employees);
      setSelectedEmployeeIds(employees.map((e) => e.id));
    };
    updateScoped();
  }, [selectedScope, employees]);

  const employeesForSchedule = useMemo(() => {
    // Only show selected employees (scope filtering already applied)
    return scopedEmployees.filter((e) => selectedEmployeeIds.includes(e.id));
  }, [scopedEmployees, selectedEmployeeIds]);

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.name || !newTemplateForm.start_time || !newTemplateForm.end_time) {
      toast({
        title: "Missing fields",
        description: "Please enter name and timings for the template.",
        variant: "destructive",
      });
      return;
    }
    try {
      const [sh, sm] = newTemplateForm.start_time.split(":").map(Number);
      const [eh, em] = newTemplateForm.end_time.split(":").map(Number);
      const duration =
        eh != null && em != null && sh != null && sm != null
          ? (eh * 60 + em - (sh * 60 + sm)) / 60
          : undefined;
      const created = await api.createShiftTemplate({
        name: newTemplateForm.name,
        start_time: newTemplateForm.start_time,
        end_time: newTemplateForm.end_time,
        shift_type: newTemplateForm.shift_type === "morning" ? "day" : newTemplateForm.shift_type,
        duration_hours: duration,
      });
      const tpl: ShiftTemplate = {
        id: created.id,
        name: created.name,
        start_time: created.start_time,
        end_time: created.end_time,
        shift_type: (created.shift_type || newTemplateForm.shift_type) as ShiftType,
      };
      setTemplates((prev) => [...prev, tpl]);
      setSelectedTemplateIds((ids) => [...ids, tpl.id]);
      setNewTemplateOpen(false);
      setNewTemplateForm({
        name: "",
        shift_type: "morning",
        start_time: "09:00",
        end_time: "17:00",
      });
      toast({ title: "Template created", description: "New shift template saved." });
    } catch (e: any) {
      console.error("[ShiftManagement2] create template error", e);
      toast({
        title: "Failed to create template",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplateIds.length || !period.length || !employeesForSchedule.length) {
      toast({
        title: "Missing information",
        description: "Please select scope, date range and at least one template.",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      // Fetch previous week's shifts for alternation
      let prevWeekData: Record<string, { nights: number; days: number; evenings: number }> = {};
      if (rules.alternateWeekShifts && dateRange.from) {
        const weekBeforeStart = addDays(dateRange.from, -7);
        const weekBeforeEnd = addDays(dateRange.from, -1);
        try {
          const prevShifts = await Promise.all(
            employeesForSchedule.map(async (emp) => {
              try {
                const shifts = await api.getShiftsForEmployee(emp.id);
                const weekShifts = shifts.filter((s: any) => {
                  const shiftDate = parseISO(s.shift_date.split("T")[0]);
                  return shiftDate >= weekBeforeStart && shiftDate <= weekBeforeEnd;
                });
                const counts = { nights: 0, days: 0, evenings: 0 };
                weekShifts.forEach((s: any) => {
                  if (s.shift_type === "night") counts.nights++;
                  else if (s.shift_type === "morning" || s.shift_type === "day") counts.days++;
                  else if (s.shift_type === "evening") counts.evenings++;
                });
                return { empId: emp.id, counts };
              } catch {
                return { empId: emp.id, counts: { nights: 0, days: 0, evenings: 0 } };
              }
            })
          );
          prevWeekData = prevShifts.reduce((acc: Record<string, { nights: number; days: number; evenings: number }>, item: any) => {
            acc[item.empId] = item.counts;
            return acc;
          }, {});
        } catch (err) {
          console.warn("[ShiftManagement2] Could not fetch previous week data:", err);
        }
      }

      // Fetch historical statistics for probability-based distribution
      let historicalStats: Array<{
        employee_id: string;
        night_shifts: number;
        day_shifts: number;
        evening_shifts: number;
        custom_shifts: number;
        adhoc_shifts: number;
        total_shifts: number;
      }> = [];
      
      if (dateRange.from) {
        try {
          // Get statistics for the previous month
          const prevMonthStart = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth() - 1, 1);
          const prevMonthEnd = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 0);
          const statsResponse = await api.getShiftStatistics({
            start_date: format(prevMonthStart, "yyyy-MM-dd"),
            end_date: format(prevMonthEnd, "yyyy-MM-dd"),
          });
          historicalStats = (statsResponse.statistics || []).map((s: any) => ({
            employee_id: s.employee_id,
            night_shifts: s.night_shifts || 0,
            day_shifts: s.day_shifts || 0,
            evening_shifts: s.evening_shifts || 0,
            custom_shifts: s.custom_shifts || 0,
            adhoc_shifts: s.adhoc_shifts || 0,
            total_shifts: s.total_shifts || 0,
          }));
        } catch (err) {
          console.warn("[ShiftManagement2] Could not fetch historical statistics:", err);
          // Continue without historical data
        }
      }

      const activeTemplates = templates.filter((t) => selectedTemplateIds.includes(t.id));
      const generated = generateBalancedSchedule(
        employeesForSchedule,
        activeTemplates,
        period,
        rules,
        holidays,
        prevWeekData,
        historicalStats
      );
      setSchedule(generated);
      setPreviousWeekShifts(prevWeekData);
      toast({
        title: "Schedule generated",
        description: `Generated ${generated.length} shift assignments across ${period.length} days.`,
      });
    } catch (e: any) {
      console.error("[ShiftManagement2] Generate error", e);
      toast({
        title: "Error generating schedule",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const dates = period.map((d) => format(d, "yyyy-MM-dd"));

  const scheduleByEmployee: Record<string, Record<string, ShiftAssignment[]>> = useMemo(() => {
    const map: Record<string, Record<string, ShiftAssignment[]>> = {};
    employeesForSchedule.forEach((e) => {
      map[e.id] = {};
      dates.forEach((d) => {
        map[e.id][d] = [];
      });
    });
    schedule.forEach((a) => {
      if (!map[a.employeeId]) map[a.employeeId] = {};
      if (!map[a.employeeId][a.date]) map[a.employeeId][a.date] = [];
      map[a.employeeId][a.date].push(a);
    });
    return map;
  }, [schedule, employeesForSchedule, dates]);

  const fairnessData = useMemo(() => {
    return employeesForSchedule.map((e) => {
      const total = schedule.filter((s) => s.employeeId === e.id).length;
      return { name: e.name || "Employee", shifts: total };
    });
  }, [schedule, employeesForSchedule]);

  const handleExportCsv = () => {
    if (!schedule.length) return;
    const headers = ["Employee", "Date", "Shift", "Start", "End"];
    const rows = schedule.map((a) => {
      const emp = employeesForSchedule.find((e) => e.id === a.employeeId);
      const tpl = templates.find((t) => t.id === a.templateId);
      return [
        emp?.name || a.employeeId,
        a.date,
        tpl?.name || a.shiftType,
        a.startTime,
        a.endTime,
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shift-schedule.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const shiftColor = (type: ShiftType) => {
    switch (type) {
      case "morning":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "evening":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "night":
        return "bg-purple-100 text-purple-800 border-purple-300";
      default:
        return "bg-amber-100 text-amber-800 border-amber-300";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Shift Management 2</h1>
            <p className="text-sm text-muted-foreground">
              Configure shift templates, generate balanced schedules, and review coverage.
            </p>
          </div>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "generate" | "published" | "statistics")} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="generate">Generate Schedule</TabsTrigger>
            <TabsTrigger value="published">Published Schedules</TabsTrigger>
            <TabsTrigger value="statistics">Shift Statistics</TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="mt-4 space-y-4">
            {/* General Scheduling Block - Redesigned */}
            <Card className="border-2 border-gray-200 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-white pb-4 border-b">
                <div className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">General Scheduling</CardTitle>
                    <CardDescription className="mt-1">Configure scope, date range, and generate schedules</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-start md:items-end gap-3">
                  <div className="flex-1 space-y-1 min-w-0">
                    <Label className="text-sm font-medium">Scope</Label>
                    <Select value={selectedScope} onValueChange={setSelectedScope}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {teams.length > 0 && (
                          <>
                            <SelectItem value="__teams_header" disabled>
                              Teams
                            </SelectItem>
                            {teams.map((t) => (
                              <SelectItem key={t.id} value={`team:${t.id}`}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {branches.length > 0 && (
                          <>
                            <SelectItem value="__branches_header" disabled>
                              Branches
                            </SelectItem>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={`branch:${b.id}`}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {departments.length > 0 && (
                          <>
                            <SelectItem value="__departments_header" disabled>
                              Departments
                            </SelectItem>
                            {departments.map((d) => (
                              <SelectItem key={d.id} value={`department:${d.id}`}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1 min-w-0">
                    <Label className="text-sm font-medium">Scheduling Period</Label>
                    <DateRangeSelector
                      value={dateRange}
                      onChange={setDateRange}
                      placeholder="Select date range"
                    />
                  </div>
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:flex-shrink-0 w-full md:w-auto">
                    <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap px-2 py-1 bg-gray-50 rounded-md">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">{selectedEmployeeIds.length}</span>
                      <span className="text-gray-500">of</span>
                      <span className="font-medium">{scopedEmployees.length}</span>
                      <span className="text-gray-500">selected</span>
                    </div>
                    <Button 
                      size="default" 
                      onClick={handleGenerate} 
                      disabled={generating || scopedEmployees.length === 0} 
                      className="bg-[#E53935] hover:bg-[#D32F2F] text-white h-10 px-6 w-full md:w-auto"
                    >
                      {generating ? (
                        <>
                          <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        "Generate Schedule"
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left Panel - Shift Rules & Templates */}
          <Card className="space-y-0 border shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-gray-50/50">
              <div>
                <CardTitle className="text-base font-semibold">Shift Rules &amp; Templates</CardTitle>
                <CardDescription className="text-xs">Define reusable shift patterns</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setNewTemplateOpen(true)} className="border-gray-300">
                + New Template
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Fairness &amp; Constraints</Label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Equal Distribution</p>
                    <p className="text-xs text-muted-foreground">Try to keep shifts balanced across the team.</p>
                  </div>
                  <ToggleSwitch
                    checked={rules.enableEqualDistribution}
                    onChange={(v) => setRules((r) => ({ ...r, enableEqualDistribution: v }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <Label>Max consecutive nights</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rules.maxConsecutiveNights}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, maxConsecutiveNights: Number(e.target.value || 0) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Min rest (hours)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={rules.minRestHours}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, minRestHours: Number(e.target.value || 0) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Max shifts/week</Label>
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      value={rules.maxShiftsPerWeek}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, maxShiftsPerWeek: Number(e.target.value || 5) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Min shifts/week</Label>
                    <Input
                      type="number"
                      min={1}
                      max={7}
                      value={rules.minShiftsPerWeek}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, minShiftsPerWeek: Number(e.target.value || 3) }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Alternate Week Shifts</p>
                      <p className="text-xs text-muted-foreground">Balance shifts across weeks</p>
                    </div>
                    <ToggleSwitch
                      checked={rules.alternateWeekShifts}
                      onChange={(v) => setRules((r) => ({ ...r, alternateWeekShifts: v }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Shift Rotation</Label>
                    <Select
                      value={rules.preferredShiftRotation}
                      onValueChange={(v: "balanced" | "strict_alternate" | "random") =>
                        setRules((r) => ({ ...r, preferredShiftRotation: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="balanced">Balanced (Recommended)</SelectItem>
                        <SelectItem value="strict_alternate">Strict Alternation</SelectItem>
                        <SelectItem value="random">Random Distribution</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs text-muted-foreground">Daily Coverage Requirements</Label>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <Label>Night shift coverage</Label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={rules.nightShiftCoverage}
                        onChange={(e) =>
                          setRules((r) => ({ ...r, nightShiftCoverage: Number(e.target.value || 1) }))
                        }
                        placeholder="People per day"
                      />
                      <p className="text-xs text-muted-foreground">Required night shifts per day</p>
                    </div>
                  <div className="space-y-1">
                    <Label>Day shift coverage</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={rules.dayShiftCoverage}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, dayShiftCoverage: Number(e.target.value || 1) }))
                      }
                      placeholder="People per day"
                    />
                    <p className="text-xs text-muted-foreground">Required day shifts per day</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Evening shift coverage</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={rules.eveningShiftCoverage || 0}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, eveningShiftCoverage: Number(e.target.value || 0) }))
                      }
                      placeholder="People per day"
                    />
                    <p className="text-xs text-muted-foreground">Required evening shifts per day</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Permit shift coverage</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={rules.permitShiftCoverage || 0}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, permitShiftCoverage: Number(e.target.value || 0) }))
                      }
                      placeholder="People per day"
                    />
                    <p className="text-xs text-muted-foreground">Required permit shifts per day</p>
                  </div>
                </div>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Exclude Weekends</p>
                      <p className="text-xs text-muted-foreground">Skip Saturday and Sunday</p>
                    </div>
                    <ToggleSwitch
                      checked={rules.excludeWeekends}
                      onChange={(v) => setRules((r) => ({ ...r, excludeWeekends: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Exclude Holidays</p>
                      <p className="text-xs text-muted-foreground">Skip published holidays</p>
                    </div>
                    <ToggleSwitch
                      checked={rules.excludeHolidays}
                      onChange={(v) => setRules((r) => ({ ...r, excludeHolidays: v }))}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Templates</Label>
                <div className="space-y-2 max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-2">
                  {templates.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1 py-4 text-center">
                      No templates yet. Use the legacy Shift Management page to configure detailed templates.
                    </p>
                  ) : (
                    templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className={cn(
                          "flex items-center justify-between rounded-md border bg-background p-2 text-sm",
                          selectedTemplateIds.includes(tpl.id) && "border-primary/70 ring-1 ring-primary/40"
                        )}
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() =>
                            setSelectedTemplateIds((ids) =>
                              ids.includes(tpl.id) ? ids.filter((id) => id !== tpl.id) : [...ids, tpl.id]
                            )
                          }
                        >
                          <p className="font-medium">{tpl.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {tpl.start_time} – {tpl.end_time} • {tpl.shift_type}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="h-6 w-6 p-0 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTemplate(tpl);
                              setEditTemplateOpen(true);
                            }}
                            title="Edit template"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            className="h-6 w-6 p-0 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Delete template "${tpl.name}"?`)) {
                                try {
                                  await api.deleteShiftTemplate(tpl.id);
                                  setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
                                  setSelectedTemplateIds((ids) => ids.filter((id) => id !== tpl.id));
                                  toast({ title: "Template deleted" });
                                } catch (err: any) {
                                  toast({
                                    title: "Failed to delete",
                                    description: err?.message,
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            title="Delete template"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Center Panel - Schedule Grid */}
          <Card className="lg:col-span-1 space-y-0 border shadow-md">
            <CardHeader className="pb-2 bg-gray-50/50">
              <CardTitle className="text-base font-semibold">Schedule Grid</CardTitle>
              <CardDescription className="text-xs">Weekly schedule view</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">

              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/60 px-3 py-2 text-xs font-medium flex items-center justify-between">
                  <span>Weekly grid</span>
                  {period.length > 0 && (
                    <span className="text-muted-foreground">
                      {format(period[0], "MMM d")} – {format(period[period.length - 1], "MMM d")}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-center"></TableHead>
                        <TableHead className="w-40">Employee</TableHead>
                        {dates.map((d) => (
                          <TableHead key={d} className="text-center text-[11px] whitespace-nowrap">
                            {format(parseISO(d), "EEE dd")}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scopedEmployees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={dates.length + 2} className="text-center text-sm text-muted-foreground py-8">
                            No employees found for the selected scope. Please select a different team or branch.
                          </TableCell>
                        </TableRow>
                      ) : (
                        scopedEmployees.map((e) => {
                          const included = selectedEmployeeIds.includes(e.id);
                          return (
                          <TableRow key={e.id}>
                            <TableCell className="text-center align-middle">
                              <Checkbox
                                checked={included}
                                onCheckedChange={(checked) =>
                                  setSelectedEmployeeIds((ids) =>
                                    checked ? [...ids, e.id] : ids.filter((id) => id !== e.id)
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="text-sm font-medium">{e.name}</TableCell>
                          {dates.map((d) => {
                            const dayAssignments = scheduleByEmployee[e.id]?.[d] || [];
                            if (!dayAssignments.length) {
                              return (
                                <TableCell key={d} className="text-center text-xs text-muted-foreground">
                                  —
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={d} className="text-center">
                                <div className="flex flex-col gap-1">
                                  {dayAssignments.map((a) => {
                                    const tpl = templates.find((t) => t.id === a.templateId);
                                    return (
                                      <button
                                        key={a.templateId + a.startTime}
                                        type="button"
                                        className={cn(
                                          "w-full rounded-md border px-1.5 py-1 text-[11px] leading-tight hover:shadow-sm",
                                          shiftColor(a.shiftType)
                                        )}
                                        onClick={() => setEditDialog({ open: true, assignment: a })}
                                      >
                                        <div className="font-semibold truncate">
                                          {tpl?.name || a.shiftType}
                                        </div>
                                        <div className="text-[10px]">
                                          {a.startTime} – {a.endTime}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                        );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-blue-400" />
                    <span>Morning</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-emerald-400" />
                    <span>Evening</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-purple-400" />
                    <span>Night</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-3 w-3 rounded-sm bg-amber-400" />
                    <span>Custom</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={generating || !schedule.length}
                  >
                    <RefreshCcw className="mr-1 h-3 w-3" />
                    Regenerate
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={!schedule.length}>
                    <Download className="mr-1 h-3 w-3" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel – Adjustments & Insights */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Today&apos;s Coverage</CardTitle>
                <CardDescription>Shifts assigned per employee</CardDescription>
              </CardHeader>
              <CardContent className="h-48">
                {fairnessData.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Generate a schedule to see coverage.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={fairnessData}>
                      <XAxis dataKey="name" hide />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="shifts" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Make Adjustments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Shift</Label>
                  <Select
                    value={reassignShiftId || editDialog.assignment?.templateId || ""}
                    onValueChange={setReassignShiftId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {schedule.map((s) => {
                        const tpl = templates.find((t) => t.id === s.templateId);
                        return (
                          <SelectItem key={`${s.employeeId}-${s.date}-${s.templateId}`} value={`${s.employeeId}-${s.date}-${s.templateId}`}>
                            {tpl?.name || s.shiftType} - {s.date} ({employeesForSchedule.find((e) => e.id === s.employeeId)?.name})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Reassign to</Label>
                  <Select value={reassignEmployeeId} onValueChange={setReassignEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employeesForSchedule.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  variant="outline"
                  onClick={() => {
                    if (!reassignShiftId || !reassignEmployeeId) {
                      toast({
                        title: "Missing information",
                        description: "Please select a shift and employee.",
                        variant: "destructive",
                      });
                      return;
                    }
                    const [empId, date, templateId] = reassignShiftId.split("-");
                    setSchedule((prev) =>
                      prev.map((s) =>
                        s.employeeId === empId && s.date === date && s.templateId === templateId
                          ? { ...s, employeeId: reassignEmployeeId }
                          : s
                      )
                    );
                    setReassignShiftId("");
                    setReassignEmployeeId("");
                    toast({ title: "Shift reassigned", description: "Changes are local only until published." });
                  }}
                  disabled={!reassignShiftId || !reassignEmployeeId}
                >
                  Reassign Shift
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-base">Fairness Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {fairnessData.length === 0 ? (
                  <p className="text-muted-foreground">Generate a schedule to see fairness indicators.</p>
                ) : (
                  fairnessData.map((row) => (
                    <div key={row.name} className="flex items-center justify-between">
                      <span className="truncate">{row.name}</span>
                      <span className="font-medium">{row.shifts} shifts</span>
                    </div>
                  ))
                )}
                <Button
                  size="sm"
                  className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={async () => {
                    if (!schedule.length) {
                      toast({
                        title: "No schedule to publish",
                        description: "Please generate a schedule first.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!confirm("Publish this schedule? It will be visible to all assigned employees.")) {
                      return;
                    }
                    setPublishing(true);
                    try {
                      // Create shifts for each assignment and log audit
                      const shiftIds: string[] = [];
                      for (const assignment of schedule) {
                        const tpl = templates.find((t) => t.id === assignment.templateId);
                        const created = await api.createShift({
                          employee_id: assignment.employeeId,
                          shift_date: assignment.date,
                          start_time: assignment.startTime,
                          end_time: assignment.endTime,
                          shift_type: assignment.shiftType,
                          status: "scheduled",
                        });
                        if (created?.id) shiftIds.push(created.id);
                      }
                      
                      // Create audit log entry
                      try {
                        await api.post("/api/scheduling/audit", {
                          action: "publish",
                          entity_type: "schedule",
                          changes: {
                            shift_count: schedule.length,
                            employee_count: new Set(schedule.map((s) => s.employeeId)).size,
                            period: `${format(dateRange.from!, "yyyy-MM-dd")} to ${format(dateRange.to!, "yyyy-MM-dd")}`,
                          },
                          reason: "Schedule published from Shift Management 2",
                        });
                      } catch (auditErr) {
                        console.warn("[ShiftManagement2] Audit log failed:", auditErr);
                        // Don't fail the publish if audit fails
                      }
                      
                      // Add to published schedules
                      const publishedSchedule = {
                        id: `published-${Date.now()}`,
                        period: `${format(dateRange.from!, "MMM d")} - ${format(dateRange.to!, "MMM d, yyyy")}`,
                        employeeCount: new Set(schedule.map((s) => s.employeeId)).size,
                        shiftCount: schedule.length,
                        publishedAt: new Date().toISOString(),
                      };
                      setPublishedSchedules((prev) => [publishedSchedule, ...prev]);
                      setSchedule((prev) => prev.map((s) => ({ ...s, status: "published" as const })));
                      toast({
                        title: "Schedule published",
                        description: `${schedule.length} shifts have been published and are now visible to employees.`,
                      });
                    } catch (err: any) {
                      console.error("[ShiftManagement2] Publish error", err);
                      toast({
                        title: "Failed to publish",
                        description: err?.message || "Some shifts may not have been saved.",
                        variant: "destructive",
                      });
                    } finally {
                      setPublishing(false);
                    }
                  }}
                  disabled={publishing || !schedule.length}
                >
                  {publishing ? "Publishing..." : "Publish Schedule"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
          </TabsContent>

          <TabsContent value="published" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Published Schedules</CardTitle>
                <CardDescription>View and manage published shift schedules</CardDescription>
              </CardHeader>
              <CardContent>
                {publishedSchedules.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No published schedules yet. Generate and publish a schedule to see it here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {publishedSchedules.map((sched) => (
                      <div
                        key={sched.id}
                        className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">{sched.period}</p>
                          <p className="text-sm text-muted-foreground">
                            {sched.shiftCount} shifts • {sched.employeeCount} employees • Published{" "}
                            {format(parseISO(sched.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // TODO: Load and edit this schedule
                              toast({
                                title: "Edit schedule",
                                description: "Schedule editing coming soon.",
                              });
                            }}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // TODO: View schedule details
                              toast({
                                title: "View schedule",
                                description: "Schedule details view coming soon.",
                              });
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="statistics" className="mt-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Shift Statistics</CardTitle>
                      <CardDescription>Last month to this month comparison</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none"
                        onClick={() => {
                          const now = new Date();
                          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
                          loadStatistics(lastMonth, endOfLastMonth);
                        }}
                      >
                        Last Month
                      </button>
                      <button
                        className="text-sm font-semibold text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none"
                        onClick={() => {
                          const now = new Date();
                          const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                          loadStatistics(lastMonthStart, now);
                        }}
                      >
                        Last Month → This Month
                      </button>
                      <Select value={sortOrder} onValueChange={(v: "asc" | "desc") => {
                        setSortOrder(v);
                        setShiftStatistics((prev) => [...prev].sort((a, b) => {
                          return v === "desc" ? b.total_shifts - a.total_shifts : a.total_shifts - b.total_shifts;
                        }));
                      }}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="desc">High → Low</SelectItem>
                          <SelectItem value="asc">Low → High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingStatistics ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Loading statistics...</p>
                  ) : shiftStatistics.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No shift statistics available.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* Visual Charts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Total Shifts Distribution</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={shiftStatistics.slice(0, 10).map(s => ({ name: s.employee_name.split(' ')[0], total: s.total_shifts }))}>
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Shift Type Breakdown</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={200}>
                              <BarChart data={[
                                {
                                  type: 'Night',
                                  count: shiftStatistics.reduce((sum, s) => sum + s.night_shifts, 0),
                                },
                                {
                                  type: 'Day',
                                  count: shiftStatistics.reduce((sum, s) => sum + s.day_shifts, 0),
                                },
                                {
                                  type: 'Evening',
                                  count: shiftStatistics.reduce((sum, s) => sum + s.evening_shifts, 0),
                                },
                                {
                                  type: 'Custom',
                                  count: shiftStatistics.reduce((sum, s) => sum + s.custom_shifts, 0),
                                },
                                {
                                  type: 'Ad-hoc',
                                  count: shiftStatistics.reduce((sum, s) => sum + s.adhoc_shifts, 0),
                                },
                              ]}>
                                <XAxis dataKey="type" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </div>
                      
                      {/* Statistics Table */}
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[180px]">Employee</TableHead>
                              <TableHead className="text-center w-[70px]">Total</TableHead>
                              <TableHead className="text-center w-[70px]">Night</TableHead>
                              <TableHead className="text-center w-[70px]">Day</TableHead>
                              <TableHead className="text-center w-[70px]">Evening</TableHead>
                              <TableHead className="text-center w-[70px]">Custom</TableHead>
                              <TableHead className="text-center w-[70px]">Ad-hoc</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {shiftStatistics.map((stat) => {
                              const trendChange = stat.lastMonthTotal !== undefined 
                                ? stat.total_shifts - stat.lastMonthTotal 
                                : 0;
                              
                              return (
                                <TableRow key={stat.employee_id}>
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      <span>{stat.employee_name}</span>
                                      {stat.trend === 'up' && (
                                        <div title={`Increased by ${trendChange} from last month`}>
                                          <ArrowUp className="h-4 w-4 text-green-600" />
                                        </div>
                                      )}
                                      {stat.trend === 'down' && (
                                        <div title={`Decreased by ${Math.abs(trendChange)} from last month`}>
                                          <ArrowDown className="h-4 w-4 text-red-600" />
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center font-semibold">{stat.total_shifts}</TableCell>
                                  <TableCell className="text-center p-2">
                                    <div className="flex flex-col items-center gap-0">
                                      <span className="font-medium text-sm">{stat.night_shifts}</span>
                                      <span className="text-[9px] text-muted-foreground">{stat.night_percentage}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center p-2">
                                    <div className="flex flex-col items-center gap-0">
                                      <span className="font-medium text-sm">{stat.day_shifts}</span>
                                      <span className="text-[9px] text-muted-foreground">{stat.day_percentage}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center p-2">
                                    <div className="flex flex-col items-center gap-0">
                                      <span className="font-medium text-sm">{stat.evening_shifts}</span>
                                      <span className="text-[9px] text-muted-foreground">{stat.evening_percentage}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center p-2">
                                    <div className="flex flex-col items-center gap-0">
                                      <span className="font-medium text-sm">{stat.custom_shifts}</span>
                                      <span className="text-[9px] text-muted-foreground">{stat.custom_percentage}%</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-center p-2">
                                    <div className="flex flex-col items-center gap-0">
                                      <span className="font-medium text-sm">{stat.adhoc_shifts}</span>
                                      <span className="text-[9px] text-muted-foreground">{stat.adhoc_percentage}%</span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog((d) => ({ ...d, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit shift assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {editDialog.assignment ? (
                <>
                  <p className="text-muted-foreground">
                    {editDialog.assignment.date} • {editDialog.assignment.startTime} –{" "}
                    {editDialog.assignment.endTime}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    In this simplified version, edits are local only and not persisted.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">No assignment selected.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog({ open: false, assignment: null })}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New shift template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={newTemplateForm.name}
                  onChange={(e) => setNewTemplateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Standard 3-shift rotation"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={newTemplateForm.shift_type}
                    onValueChange={(v: ShiftType) => setNewTemplateForm((f) => ({ ...f, shift_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                      <SelectItem value="night">Night</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    value={newTemplateForm.start_time}
                    onChange={(e) => setNewTemplateForm((f) => ({ ...f, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>End</Label>
                  <Input
                    type="time"
                    value={newTemplateForm.end_time}
                    onChange={(e) => setNewTemplateForm((f) => ({ ...f, end_time: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTemplate}>Save Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editTemplateOpen} onOpenChange={setEditTemplateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit shift template</DialogTitle>
            </DialogHeader>
            {editingTemplate && (
              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) =>
                      setEditingTemplate((t) => (t ? { ...t, name: e.target.value } : null))
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select
                      value={editingTemplate.shift_type}
                      onValueChange={(v: ShiftType) =>
                        setEditingTemplate((t) => (t ? { ...t, shift_type: v } : null))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                        <SelectItem value="night">Night</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input
                      type="time"
                      value={editingTemplate.start_time}
                      onChange={(e) =>
                        setEditingTemplate((t) => (t ? { ...t, start_time: e.target.value } : null))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>End</Label>
                    <Input
                      type="time"
                      value={editingTemplate.end_time}
                      onChange={(e) =>
                        setEditingTemplate((t) => (t ? { ...t, end_time: e.target.value } : null))
                      }
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!editingTemplate) return;
                  try {
                    const [sh, sm] = editingTemplate.start_time.split(":").map(Number);
                    const [eh, em] = editingTemplate.end_time.split(":").map(Number);
                    const duration =
                      eh != null && em != null && sh != null && sm != null
                        ? (eh * 60 + em - (sh * 60 + sm)) / 60
                        : undefined;
                    await api.updateShiftTemplate(editingTemplate.id, {
                      name: editingTemplate.name,
                      start_time: editingTemplate.start_time,
                      end_time: editingTemplate.end_time,
                      shift_type: editingTemplate.shift_type === "morning" ? "day" : editingTemplate.shift_type,
                      duration_hours: duration,
                    });
                    setTemplates((prev) =>
                      prev.map((t) => (t.id === editingTemplate.id ? editingTemplate : t))
                    );
                    setEditTemplateOpen(false);
                    setEditingTemplate(null);
                    toast({ title: "Template updated" });
                  } catch (err: any) {
                    toast({
                      title: "Failed to update",
                      description: err?.message,
                      variant: "destructive",
                    });
                  }
                }}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}


