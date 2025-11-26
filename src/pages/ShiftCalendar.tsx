import {
  useEffect,
  useMemo,
  useState,
  DragEvent,
  useCallback,
} from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Moon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ShiftEvent = {
  id: string;
  start: string;
  end: string | null;
  resource: {
    type: "shift";
    assignment_id: string;
    employee_id: string;
    employee_name: string;
    employee_email: string;
    shift_date: string;
    shift_template_id: string;
    start_time: string;
    end_time: string;
    template_name: string;
    shift_type: string;
    assigned_by: string;
    schedule_id: string;
    schedule_status: string;
  };
};

type AssignmentEvent = {
  id: string;
  start: string;
  end: string | null;
  resource: {
    type: "assignment";
    [key: string]: unknown;
  };
};

type CalendarEvent = ShiftEvent | AssignmentEvent;

type CalendarResponse = {
  events: CalendarEvent[];
  employees: Array<{
    id: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
  }>;
  leaves: Array<{
    id: string;
    employee_id: string;
    leave_type: string;
    reason: string;
    start_date: string;
    end_date: string;
  }>;
  holidays: Array<{
    id: string;
    date: string;
    name: string;
    region?: string;
  }>;
  conflicts: Array<{
    type: string;
    date: string;
    employee_id: string;
    assignment_id: string;
    message: string;
  }>;
};

const viewModes = ["month", "week", "day"] as const;

export default function ShiftCalendar() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<(typeof viewModes)[number]>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContext, setEditContext] = useState<{
    assignment?: ShiftEvent["resource"];
    schedule_event?: ShiftEvent;
    targetDate?: string;
    employeeId?: string;
    reason?: string;
  }>({});
  const [saving, setSaving] = useState(false);
  const [dragAssignment, setDragAssignment] = useState<ShiftEvent | null>(null);
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragValidation, setDragValidation] = useState<{
    allowed: boolean;
    reason?: string;
  } | null>(null);

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const data = await api.getCalendar({
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
      });
      setCalendarData(data);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load calendar";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentDate, toast]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const roster =
    calendarData?.employees
      ?.filter((employee) => Boolean(employee.id))
      .map((employee) => ({
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        email: employee.email,
        name:
          employee.name ||
          `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
      })) || [];

  const shiftEvents: ShiftEvent[] = useMemo(() => {
    if (!calendarData?.events) return [];
    return calendarData.events.filter(
      (event): event is ShiftEvent => event.resource?.type === "shift"
    );
  }, [calendarData?.events]);

  const leavesByDate = useMemo(() => {
    const map: Record<string, Array<{ employee_id: string; label: string }>> =
      {};
    calendarData?.leaves?.forEach((leave) => {
      const start = parseISO(String(leave.start_date));
      const end = parseISO(String(leave.end_date));
      for (
        let date = start;
        date <= end;
        date = addDays(date, 1)
      ) {
        const key = format(date, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push({
          employee_id: leave.employee_id,
          label: leave.leave_type,
        });
      }
    });
    return map;
  }, [calendarData?.leaves]);

  const holidaysByDate = useMemo(() => {
    const map: Record<string, Array<{ name: string; region?: string }>> = {};
    calendarData?.holidays?.forEach((holiday) => {
      const dateStr =
        typeof holiday.date === "string"
          ? holiday.date
          : holiday.date?.toString();
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push({
        name: holiday.name,
        region: holiday.region,
      });
    });
    return map;
  }, [calendarData?.holidays]);

  const conflictsByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    calendarData?.conflicts?.forEach((conflict) => {
      if (!map[conflict.date]) map[conflict.date] = [];
      map[conflict.date].push(conflict.message);
    });
    return map;
  }, [calendarData?.conflicts]);

  const monthMatrix = useMemo(() => {
    const matrix: Date[][] = [];
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = startOfWeek(monthStart, { weekStartsOn: 0 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 0 });

    for (
      let weekStart = start;
      weekStart <= end;
      weekStart = addDays(weekStart, 7)
    ) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(addDays(weekStart, i));
      }
      matrix.push(week);
    }
    return matrix;
  }, [currentDate]);

  const getShiftsForDate = (dateStr: string) =>
    shiftEvents.filter(
      (event) => event.resource.shift_date === dateStr
    );

  const isNightDate = (dateStr: string) =>
    getShiftsForDate(dateStr).some(
      (event) => event.resource.shift_type === "night"
    );

  const handleOpenEdit = (
    event: ShiftEvent,
    options?: { toDate?: string; reason?: string }
  ) => {
    setEditContext({
      assignment: event.resource,
      schedule_event: event,
      targetDate: options?.toDate || event.resource.shift_date,
      employeeId: event.resource.employee_id,
      reason: options?.reason || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editContext.assignment || !editContext.targetDate) return;
    setSaving(true);
    try {
      await api.manualEditSchedule(editContext.assignment.schedule_id, {
        assignments: [
          {
            id: editContext.assignment.assignment_id,
            employee_id: editContext.employeeId || editContext.assignment.employee_id,
            shift_date: editContext.targetDate,
            shift_template_id: editContext.assignment.shift_template_id,
            start_time: editContext.assignment.start_time,
            end_time: editContext.assignment.end_time,
          },
        ],
        reason: editContext.reason || undefined,
      });
      toast({ title: "Shift updated" });
      setEditDialogOpen(false);
      setEditContext({});
      loadCalendar();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update shift";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getSuggestedReplacements = (assignment?: ShiftEvent["resource"]) => {
    if (!assignment) return [];
    const dateStr = assignment.shift_date;
    return roster
      .filter((employee) => {
        if (employee.id === assignment.employee_id) return false;
        const hasShift = shiftEvents.some(
          (event) =>
            event.resource.employee_id === employee.id &&
            event.resource.shift_date === dateStr
        );
        if (hasShift) return false;
        const hasLeave = leavesByDate[dateStr]?.some(
          (leave) => leave.employee_id === employee.id
        );
        return !hasLeave;
      })
      .slice(0, 5);
  };

  const handleMarkSick = (event: ShiftEvent) => {
    handleOpenEdit(event, { reason: "Marked sick; reassign shift" });
  };

  const evaluateDrop = (
    assignment: ShiftEvent | null,
    dateStr: string
  ): { allowed: boolean; reason?: string } => {
    if (!assignment) return { allowed: true };
    if (
      leavesByDate[dateStr]?.some(
        (leave) => leave.employee_id === assignment.employee_id
      )
    ) {
      return { allowed: false, reason: "Employee has approved leave" };
    }
    if (holidaysByDate[dateStr]?.length) {
      return { allowed: false, reason: "Date is a company holiday" };
    }
    return { allowed: true };
  };

  const handleDragStart = (event: ShiftEvent, e: DragEvent) => {
    setDragAssignment(event);
    e.dataTransfer.setData("text/plain", event.id);
  };

  const handleDragOver = (dateStr: string, e: DragEvent) => {
    if (dragAssignment) {
      e.preventDefault();
      setDragDate(dateStr);
      setDragValidation(evaluateDrop(dragAssignment, dateStr));
    }
  };

  const handleDrop = (dateStr: string, e: DragEvent) => {
    e.preventDefault();
    if (dragAssignment) {
      const validation = evaluateDrop(dragAssignment, dateStr);
      if (!validation.allowed) {
        toast({
          title: "Cannot move shift",
          description: validation.reason,
          variant: "destructive",
        });
      } else {
        handleOpenEdit(dragAssignment, { toDate: dateStr });
      }
    }
    setDragAssignment(null);
    setDragDate(null);
    setDragValidation(null);
  };

  const handleDragEnd = () => {
    setDragAssignment(null);
    setDragDate(null);
    setDragValidation(null);
  };

  const renderDayCell = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayShifts = getShiftsForDate(dateStr);
    const dayLeaves = leavesByDate[dateStr] || [];
    const dayHolidays = holidaysByDate[dateStr] || [];
    const dayConflicts = conflictsByDate[dateStr] || [];
    const isNight = isNightDate(dateStr);
    const isConflict = dayConflicts.length > 0;
    const isDropTarget = dragAssignment && dragDate === dateStr;
    const dropAllowed = !dragValidation || dragValidation.allowed;

    return (
      <div
        key={dateStr}
        className={cn(
          "min-h-[120px] border p-2 text-sm flex flex-col gap-1 transition-colors",
          !isSameMonth(day, currentDate) && "bg-muted/40 text-muted-foreground",
          isNight && "bg-slate-900/10",
          isConflict && "border-destructive",
          isDropTarget &&
            (dropAllowed
              ? "ring-2 ring-emerald-500"
              : "ring-2 ring-destructive")
        )}
        onDragOver={(e) => handleDragOver(dateStr, e)}
        onDrop={(e) => handleDrop(dateStr, e)}
      >
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className={cn(isToday(day) && "text-primary")}>
            {format(day, "d")}
          </span>
          <div className="flex items-center gap-1">
            {isNight && <Moon className="h-3 w-3 text-indigo-600" />}
            {dayConflicts.length > 0 && (
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
            )}
          </div>
        </div>
        {isDropTarget && dragValidation && !dropAllowed && (
          <p className="text-[10px] text-destructive">
            {dragValidation.reason}
          </p>
        )}
        <div className="flex flex-col gap-1 mt-1">
          {dayShifts.map((event) => (
            <Popover key={event.id}>
              <PopoverTrigger asChild>
                <div
                  className={cn(
                    "text-[11px] px-2 py-1 rounded-full cursor-pointer flex items-center gap-1 truncate",
                    event.resource.shift_type === "night"
                      ? "bg-slate-900 text-white"
                      : "bg-blue-100 text-blue-900"
                  )}
                  draggable
                  onDragStart={(e) => handleDragStart(event, e)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="font-semibold">
                    {event.resource.shift_type === "night"
                      ? "Night"
                      : event.resource.template_name}
                  </span>
                  <span className="opacity-80">
                    {formatShiftRange(
                      event.resource.start_time,
                      event.resource.end_time
                    )}
                  </span>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {event.resource.template_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatShiftRange(
                        event.resource.start_time,
                        event.resource.end_time
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Assigned by: {event.resource.assigned_by}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(event)}
                    >
                      Quick Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkSick(event)}
                    >
                      Report sick & open replacement
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          ))}
          {dayLeaves.slice(0, 2).map((leave, idx) => (
            <div
              key={`${leave.employee_id}-${idx}`}
              className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-900 rounded"
            >
              Leave — {leave.label}
            </div>
          ))}
          {dayHolidays.slice(0, 1).map((holiday) => (
            <div
              key={holiday.name}
              className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded"
            >
              {holiday.name}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const formatShiftRange = (start?: string, end?: string) => {
    if (!start || !end) return "—";
    const startLabel = formatShiftTime(start);
    const endLabel = formatShiftTime(end);
    return start > end ? `${startLabel} - ${endLabel} (+1)` : `${startLabel} - ${endLabel}`;
  };

  const formatShiftTime = (timeStr?: string) => {
    if (!timeStr) return "--";
    const [hours = "0", minutes = "00"] = timeStr.split(":");
    let hourNum = parseInt(hours, 10);
    const ampm = hourNum >= 12 ? "PM" : "AM";
    hourNum = hourNum % 12 || 12;
    return `${hourNum}:${minutes.padStart(2, "0")} ${ampm}`;
  };

  const renderCalendarGrid = () => {
    if (viewMode === "day") {
      const day = currentDate;
      const dateStr = format(day, "yyyy-MM-dd");
      return (
        <div className="border rounded-lg">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              {format(day, "EEEE, MMM dd, yyyy")}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {getShiftsForDate(dateStr).map((event) => (
              <Card key={event.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{event.resource.template_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatShiftRange(
                        event.resource.start_time,
                        event.resource.end_time
                      )}
                    </p>
                    <p className="text-sm">{event.resource.employee_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(event)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkSick(event)}
                    >
                      Mark Sick
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {getShiftsForDate(dateStr).length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                No shifts for this date
              </p>
            )}
          </div>
        </div>
      );
    }

    const matrix =
      viewMode === "week"
        ? [
            monthMatrix.find((week) =>
              week.some((day) => format(day, "yyyy-MM-dd") === format(currentDate, "yyyy-MM-dd"))
            ) || monthMatrix[0],
          ]
        : monthMatrix;

    return (
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="p-2 text-center font-semibold text-xs">
              {day}
            </div>
          ))}
        </div>
        {matrix.map((week, idx) => (
          <div key={idx} className="grid grid-cols-7">
            {week.map((day) => renderDayCell(day))}
          </div>
        ))}
      </div>
    );
  };

  const suggestions = getSuggestedReplacements(editContext.assignment);

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Calendar className="h-7 w-7 text-primary" />
              Shift Calendar
            </h1>
            <p className="text-muted-foreground">
              Visualize monthly shifts, leaves, holidays, and make quick adjustments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-md border">
              {viewModes.map((mode) => (
                <Button
                  key={mode}
                  variant={viewMode === mode ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode(mode)}
                  className="rounded-none"
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[140px] text-center font-semibold">
                {format(currentDate, "MMMM yyyy")}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => loadCalendar()}>
                Refresh
              </Button>
              <Button onClick={() => (window.location.href = "/scheduling")}>
                Create / Run Schedule
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading calendar...
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              {renderCalendarGrid()}
            </div>
            <div className="w-full lg:w-80 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">
                    Conflicts
                  </CardTitle>
                  <CardDescription>
                    Leaves, holidays, and rule violations that need attention.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {calendarData?.conflicts?.length ? (
                    <div className="space-y-3">
                      {calendarData.conflicts.map((conflict) => (
                        <div
                          key={`${conflict.assignment_id}-${conflict.type}`}
                          className="border rounded-lg p-2 text-sm"
                        >
                          <div className="font-semibold">
                            {format(
                              parseISO(conflict.date),
                              "MMM dd, yyyy"
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {conflict.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No conflicts detected this month.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick Edit</DialogTitle>
            <DialogDescription>
              Adjust assignment details and revalidate before saving.
            </DialogDescription>
          </DialogHeader>
          {editContext.assignment ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <input
                    type="date"
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={editContext.targetDate ?? ""}
                    onChange={(e) =>
                      setEditContext((prev) => ({
                        ...prev,
                        targetDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Employee
                  </p>
                  <Select
                    value={
                      editContext.employeeId ??
                      editContext.assignment?.employee_id
                    }
                    onValueChange={(value) =>
                      setEditContext((prev) => ({ ...prev, employeeId: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {roster.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Reason</p>
                <Textarea
                  value={editContext.reason ?? ""}
                  onChange={(e) =>
                    setEditContext((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Optional reason (required for overrides)"
                />
              </div>
              {suggestions.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Suggested replacements
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((employee) => (
                      <Button
                        key={employee.id}
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setEditContext((prev) => ({
                            ...prev,
                            employeeId: employee.id,
                          }))
                        }
                      >
                        {employee.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={saving}>
              {saving ? "Saving..." : "Save & Validate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

