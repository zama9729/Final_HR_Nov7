/**
 * Unified Calendar - Shows shifts, projects, holidays, birthdays, and leaves
 * Interactive calendar with filters for different event types
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Filter,
  X,
  Clock,
  Briefcase,
  Cake,
  Plane,
  CalendarDays,
  Megaphone,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

type EventType = "shift" | "assignment" | "holiday" | "birthday" | "leave" | "announcement";

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  resource: {
    type: EventType;
    [key: string]: any;
  };
};

type CalendarData = {
  events: CalendarEvent[];
  projects: Array<{ id: string; name: string; status: string }>;
  employees: Array<{ id: string; name: string; email: string }>;
  holidays: Array<{ id: string; name: string; date: string; region?: string }>;
  leaves: Array<{ id: string; employee_id: string; leave_label: string }>;
  conflicts: Array<{ type: string; date: string; message: string }>;
};

export default function UnifiedCalendar() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [eventTypeFilters, setEventTypeFilters] = useState<Record<EventType, boolean>>({
    shift: true,
    assignment: true,
    holiday: true,
    birthday: true,
    leave: true,
    announcement: true,
  });
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  // Roles that can see the full organization calendar (not just their own data)
  const orgFullAccessRoles = ["hr", "ceo", "director", "admin", "manager"];
  // Roles that can toggle between "My Calendar" and "Organization" views in the UI
  const orgToggleRoles = ["hr", "ceo", "director", "admin", "manager"];
  const isFullOrgAccess = orgFullAccessRoles.includes(userRole || '');
  const canToggleOrganization = orgToggleRoles.includes(userRole || '');
  const [viewLevel, setViewLevel] = useState<'employee' | 'organization'>('employee');

  useEffect(() => {
    if (isFullOrgAccess && viewLevel === 'employee') {
      setViewLevel('organization');
    } else if (!canToggleOrganization && viewLevel !== 'employee') {
      setViewLevel('employee');
    }
  }, [isFullOrgAccess, canToggleOrganization, viewLevel]);

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      
      const params: any = {
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        view_type: viewLevel,
      };
      
      if (selectedEmployee && selectedEmployee !== 'all') params.employee_id = selectedEmployee;
      if (selectedProject && selectedProject !== 'all') params.project_id = selectedProject;

      const data = await api.getCalendar(params);
      
      setCalendarData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load calendar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedEmployee, selectedProject, viewLevel, toast]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const toDateKey = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.replace(" ", "T");
    const [datePart] = normalized.split("T");
    if (datePart && datePart.includes("-")) return datePart;
    try {
      return format(parseISO(value), "yyyy-MM-dd");
    } catch {
      return null;
    }
  };

  const roleAdjustedEvents = useMemo(() => {
    if (!calendarData?.events) return [];

    // For organization view, HR/CEO/Admin should see aggregated counts of day/night shifts
    if (viewLevel === "organization" && ["hr", "ceo", "admin"].includes((userRole || "").toLowerCase())) {
      const nonShiftEvents: CalendarEvent[] = [];
      const shiftSummaryMap = new Map<string, { dateKey: string; subtype: string; count: number }>();

      calendarData.events.forEach((event) => {
        const type = event.resource?.type as EventType;
        if (type !== "shift") {
          nonShiftEvents.push(event);
          return;
        }

        const shiftTypeRaw = (event.resource?.shift_type || "day").toString().toLowerCase();
        const subtype = shiftTypeRaw === "night" ? "night" : "day";
        const dateKey = toDateKey(event.resource?.shift_date || event.start);
        if (!dateKey) return;

        const mapKey = `${dateKey}|${subtype}`;
        const existing = shiftSummaryMap.get(mapKey) || { dateKey, subtype, count: 0 };
        existing.count += 1;
        shiftSummaryMap.set(mapKey, existing);
      });

      const summaryEvents: CalendarEvent[] = Array.from(shiftSummaryMap.values()).map((item) => ({
        id: `shift_summary_${item.dateKey}_${item.subtype}`,
        title: `${item.subtype === "night" ? "Night" : "Day"} Shifts: ${item.count}`,
        start: item.dateKey,
        end: item.dateKey,
        allDay: true,
        resource: {
          type: "shift",
          shift_type: item.subtype,
          shift_count: item.count,
        },
      }));

      return [...summaryEvents, ...nonShiftEvents];
    }

    // Other roles or employee view: use raw events
    return calendarData.events;
  }, [calendarData?.events, viewLevel, userRole]);

  const filteredEvents = useMemo(() => {
    if (!roleAdjustedEvents.length) return [];
    return roleAdjustedEvents.filter((event) => {
      const type = event.resource?.type as EventType;
      if (!type || !eventTypeFilters[type]) return false;
      const dateKey = toDateKey(event.start);
      if (!dateKey) return false;
      try {
        const eventDate = parseISO(dateKey);
        return isSameMonth(eventDate, currentMonth);
      } catch {
        return false;
      }
    });
  }, [roleAdjustedEvents, eventTypeFilters, currentMonth]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    filteredEvents.forEach((event) => {
      const dateStr = toDateKey(event.start);
      if (!dateStr) return;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(event);
    });
    return map;
  }, [filteredEvents]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

const getEventColor = (event: CalendarEvent | null) => {
  if (!event) {
    return "bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600";
  }
  const type = event.resource?.type as EventType;
  if (type === "shift") {
    const subtype = (event.resource?.shift_type || "").toLowerCase();
    if (subtype === "night") {
      return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-600";
    }
    return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-200 dark:border-red-600";
  }
  switch (type) {
    case "assignment":
      return "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-600";
    case "holiday":
      return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-600";
    case "birthday":
      return "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/30 dark:text-pink-200 dark:border-pink-600";
    case "leave":
      return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-600";
    case "announcement":
      return "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600";
  }
};

  const getEventIcon = (type: EventType) => {
    switch (type) {
      case "shift":
        return <Clock className="h-3 w-3" />;
      case "assignment":
        return <Briefcase className="h-3 w-3" />;
      case "holiday":
        return <CalendarDays className="h-3 w-3" />;
    case "birthday":
      return <Cake className="h-3 w-3" />;
    case "leave":
      return <Plane className="h-3 w-3" />;
    case "announcement":
      return <Megaphone className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth(prev => subMonths(addMonths(prev, direction === "next" ? 1 : -1), 0));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayEvents = eventsByDate[dateStr] || [];
    if (dayEvents.length > 0) {
      setSelectedEvent(dayEvents[0]);
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground">
              View shifts, projects, holidays, birthdays, and leaves in one place
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Level Toggle */}
            {canToggleOrganization && (
              <div className="flex items-center gap-2 border rounded-md p-1">
                <Button
                  variant={viewLevel === 'employee' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewLevel('employee')}
                >
                  My Calendar
                </Button>
                <Button
                  variant={viewLevel === 'organization' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewLevel('organization')}
                >
                  Organization
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" onClick={() => setCurrentMonth(new Date())}>
              Today
            </Button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-slate-900 dark:text-slate-100">Filters</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFilters(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block text-slate-700 dark:text-slate-200">Event Types</Label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {(["shift", "assignment", "holiday", "birthday", "leave", "announcement"] as EventType[]).map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type}
                          checked={eventTypeFilters[type]}
                          onCheckedChange={(checked) =>
                            setEventTypeFilters(prev => ({ ...prev, [type]: !!checked }))
                          }
                        />
                        <Label
                          htmlFor={type}
                          className="text-sm font-normal cursor-pointer capitalize"
                        >
                          {type === "assignment" ? "Projects" : type}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                {canToggleOrganization && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-slate-700 dark:text-slate-200">Employee</Label>
                      <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                        <SelectTrigger>
                          <SelectValue placeholder="All employees" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All employees</SelectItem>
                          {calendarData?.employees?.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>
                              {emp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-slate-700 dark:text-slate-200">Project</Label>
                      <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger>
                          <SelectValue placeholder="All projects" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All projects</SelectItem>
                          {calendarData?.projects?.map((proj) => (
                            <SelectItem key={proj.id} value={proj.id}>
                              {proj.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Calendar */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-900 dark:text-slate-100">{format(currentMonth, "MMMM yyyy")}</CardTitle>
                <CardDescription>
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} this month
                  {viewLevel === 'employee' ? ' (My Calendar)' : ' (Organization View)'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => navigateMonth("next")}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Loading calendar...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 text-slate-600 dark:text-slate-400">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                    <div key={day} className="p-2 text-center text-sm font-semibold text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayEvents = eventsByDate[dateStr] || [];
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const isCurrentDay = isToday(day);
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "min-h-[100px] border rounded-lg p-2 cursor-pointer transition-colors bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700",
                          !isCurrentMonth && "opacity-40",
                          isCurrentDay && "ring-2 ring-primary",
                          hasEvents && "bg-muted/30 hover:bg-muted/50 dark:bg-slate-800/60"
                        )}
                        onClick={() => handleDateClick(day)}
                      >
                        <div className={cn(
                          "text-sm font-medium mb-1",
                          isCurrentDay && "text-primary font-bold"
                        )}>
                          {format(day, "d")}
                        </div>
                        <div className="space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded border flex items-center gap-1 truncate",
                                getEventColor(event)
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                              }}
                            >
                              {getEventIcon(event.resource.type)}
                              <span className="truncate">{event.title}</span>
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-muted-foreground px-1.5">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                          {dayEvents.length === 0 && (
                            <div className="text-xs text-muted-foreground px-1.5 font-medium">
                              Week Off
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Event Detail Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
              <DialogDescription>
                {selectedEvent && format(parseISO(selectedEvent.start), "EEEE, MMMM d, yyyy")}
              </DialogDescription>
            </DialogHeader>
            {selectedEvent && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className={getEventColor(selectedEvent)}>
                    {getEventIcon(selectedEvent.resource.type)}
                    <span className="ml-1 capitalize">{selectedEvent.resource.type}</span>
                  </Badge>
                  {selectedEvent.resource.type === "shift" && (
                    <>
                      {selectedEvent.resource.start_time && (
                        <Badge variant="outline">
                          {formatTime(selectedEvent.resource.start_time)} - {formatTime(selectedEvent.resource.end_time)}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {selectedEvent.resource.shift_type || "Shift"}
                      </Badge>
                    </>
                  )}
                </div>

                {selectedEvent.resource.type === "shift" && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Employee:</span> {selectedEvent.resource.employee_name}
                    </div>
                    <div>
                      <span className="font-medium">Template:</span> {selectedEvent.resource.template_name}
                    </div>
                    <div>
                      <span className="font-medium">Assigned by:</span> {selectedEvent.resource.assigned_by}
                    </div>
                  </div>
                )}

                {selectedEvent.resource.type === "assignment" && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Project:</span> {selectedEvent.resource.project_name}
                    </div>
                    <div>
                      <span className="font-medium">Employee:</span> {selectedEvent.resource.employee_name}
                    </div>
                    <div>
                      <span className="font-medium">Allocation:</span> {selectedEvent.resource.allocation_percent}%
                    </div>
                    {selectedEvent.resource.role && (
                      <div>
                        <span className="font-medium">Role:</span> {selectedEvent.resource.role}
                      </div>
                    )}
                  </div>
                )}

                {selectedEvent.resource.type === "holiday" && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Name:</span> {selectedEvent.resource.name}
                    </div>
                    {selectedEvent.resource.region && (
                      <div>
                        <span className="font-medium">Region:</span> {selectedEvent.resource.region}
                      </div>
                    )}
                    {selectedEvent.resource.is_national && (
                      <Badge>National Holiday</Badge>
                    )}
                  </div>
                )}

                {selectedEvent.resource.type === "birthday" && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Employee:</span> {selectedEvent.resource.employee_name}
                    </div>
                  </div>
                )}

                {selectedEvent.resource.type === "leave" && (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Type:</span> {selectedEvent.resource.leave_label}
                    </div>
                    {selectedEvent.resource.reason && (
                      <div>
                        <span className="font-medium">Reason:</span> {selectedEvent.resource.reason}
                      </div>
                    )}
                  </div>
                )}

                {selectedEvent.end && selectedEvent.start !== selectedEvent.end && (
                  <div className="text-sm text-muted-foreground">
                    Ends: {format(parseISO(selectedEvent.end), "EEEE, MMMM d, yyyy")}
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Date Events Dialog */}
        <Dialog open={!!selectedDate && !selectedEvent} onOpenChange={() => setSelectedDate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}
              </DialogTitle>
            </DialogHeader>
            {selectedDate && (
              <div className="space-y-2">
                {eventsByDate[format(selectedDate, "yyyy-MM-dd")]?.map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      "p-3 rounded-lg border cursor-pointer hover:bg-muted",
                      getEventColor(event)
                    )}
                    onClick={() => {
                      setSelectedEvent(event);
                      setSelectedDate(null);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {getEventIcon(event.resource.type)}
                      <span className="font-medium">{event.title}</span>
                    </div>
                    {event.resource.type === "shift" && event.resource.start_time && (
                      <div className="text-xs mt-1">
                        {formatTime(event.resource.start_time)} - {formatTime(event.resource.end_time)}
                      </div>
                    )}
                  </div>
                ))}
                {(!eventsByDate[format(selectedDate, "yyyy-MM-dd")] || eventsByDate[format(selectedDate, "yyyy-MM-dd")].length === 0) && (
                  <div className="text-center text-muted-foreground py-4">
                    Week Off
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

