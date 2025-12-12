import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { addDays, format, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, Clock, Users, Plus, X, UserPlus, UserMinus, GripVertical } from "lucide-react";

type Role = "employee" | "manager" | "hr" | "director" | "ceo" | "admin" | "super_user" | "accountant";

type EventType = "event" | "time_off" | "announcement" | "milestone";

interface Team {
  id: string;
  name: string;
  code?: string;
}

interface TeamMember {
  id: string; // team_memberships.id
  employee_id: string; // employees.id
  employee_name?: string;
  employee_email?: string;
  position?: string;
  department?: string;
}

interface TeamScheduleEvent {
  id: string;
  type: EventType;
  title: string;
  start_date: string; // yyyy-MM-dd
  end_date: string; // yyyy-MM-dd
  start_time?: string | null; // HH:mm (optional)
  end_time?: string | null; // HH:mm (optional)
  team_id?: string | null;
  employee_id?: string | null;
  status?: "pending" | "approved" | "declined";
}

// Simple helper – inclusive range check on yyyy-MM-dd
const coversDate = (ev: TeamScheduleEvent, dateStr: string) =>
  ev.start_date <= dateStr && ev.end_date >= dateStr;

// Format "HH:mm" or "HH:mm:ss" into a friendly "h:mm AM/PM"
const formatTime = (value?: string | null): string => {
  if (!value) return "--:--";
  // Support both "HH:mm" and "HH:mm:ss"
  const [h, m] = value.split(":");
  const hour = Number(h);
  const min = Number(m || 0);
  if (isNaN(hour) || isNaN(min)) return value;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${min.toString().padStart(2, "0")} ${ampm}`;
};

export default function TeamSchedule() {
  const { userRole } = useAuth();
  const { toast } = useToast();

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [events, setEvents] = useState<TeamScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [newEventDefaults, setNewEventDefaults] = useState<{
    employee_id?: string;
    date?: string;
  }>({});
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventType, setNewEventType] = useState<EventType>("event");
  const [newEventDate, setNewEventDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] = useState("10:00");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishBody, setPublishBody] = useState("");
  const [publishPinned, setPublishPinned] = useState(false);
  const [teamEditDialogOpen, setTeamEditDialogOpen] = useState(false);
  const [availableEmployees, setAvailableEmployees] = useState<any[]>([]);
  const [draggedEmployee, setDraggedEmployee] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const isManagerLike = useMemo(
    () => !!userRole && ["manager", "hr", "director", "ceo", "admin"].includes(userRole as Role),
    [userRole],
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i)),
    [currentWeek],
  );

  useEffect(() => {
    fetchTeams();
    fetchInitialEvents();
  }, []);

  useEffect(() => {
    fetchInitialEvents();
  }, [currentWeek, selectedTeamId]);

  useEffect(() => {
    if (selectedTeamId && selectedTeamId !== "all") {
      fetchMembers(selectedTeamId);
    } else {
      setMembers([]);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (teamEditDialogOpen && selectedTeamId !== "all") {
      fetchAvailableEmployees();
    }
  }, [teamEditDialogOpen, selectedTeamId]);

  const fetchTeams = async () => {
    try {
      const data = await api.getTeams({ active: true });
      const simpleTeams = (data || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        code: t.code,
      }));
      setTeams(simpleTeams);
    } catch (error: any) {
      console.error("Failed to fetch teams:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load teams",
        variant: "destructive",
      });
    }
  };

  const fetchMembers = async (teamId: string) => {
    try {
      const mems = await api.getTeamMembers(teamId);
      setMembers(mems || []);
    } catch (error) {
      console.error("Failed to fetch team members:", error);
      setMembers([]);
    }
  };

  const fetchAvailableEmployees = async () => {
    if (!selectedTeamId || selectedTeamId === "all") return;
    try {
      const allEmployees = await api.getEmployees();
      const currentMemberIds = new Set(members.map(m => m.employee_id));
      const available = (allEmployees || []).filter((emp: any) => !currentMemberIds.has(emp.id));
      setAvailableEmployees(available);
    } catch (error) {
      console.error("Failed to fetch available employees:", error);
      setAvailableEmployees([]);
    }
  };

  const handleAddTeamMember = async (employeeId: string) => {
    if (!selectedTeamId || selectedTeamId === "all") return;
    try {
      await api.addTeamMember(selectedTeamId, {
        employee_id: employeeId,
        role: "MEMBER",
        is_primary: false,
      });
      toast({
        title: "Success",
        description: "Employee added to team",
      });
      fetchMembers(selectedTeamId);
      fetchAvailableEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add employee",
        variant: "destructive",
      });
    }
  };

  const handleRemoveTeamMember = async (memberId: string, employeeName?: string) => {
    if (!selectedTeamId || selectedTeamId === "all") return;
    try {
      await api.updateTeamMembership(selectedTeamId, memberId, {
        end_date: new Date().toISOString().split("T")[0],
      });
      toast({
        title: "Success",
        description: `${employeeName || "Employee"} removed from team`,
      });
      fetchMembers(selectedTeamId);
      fetchAvailableEmployees();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove employee",
        variant: "destructive",
      });
    }
  };

  const handleDragStart = (employeeId: string) => {
    setDraggedEmployee(employeeId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-primary/10");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-primary/10");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-primary/10");
    if (draggedEmployee) {
      handleAddTeamMember(draggedEmployee);
      setDraggedEmployee(null);
    }
  };

  // Seed time-off events from existing leave requests and load persisted team events
  const fetchInitialEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getLeaveRequests();
      const mapped: TeamScheduleEvent[] = [];

      // My own requests always visible to me
      (data.myRequests || []).forEach((r: any) => {
        mapped.push({
          id: r.id,
          type: "time_off",
          title: r.leave_type?.name || "Time off",
          start_date: r.start_date.split("T")[0],
          end_date: r.end_date.split("T")[0],
          employee_id: r.employee_id,
          status: (r.status || "pending") as any,
        });
      });

      // Team requests for manager/HR/CEO/Admin – so they see their team's time off
      if (isManagerLike) {
        (data.teamRequests || []).forEach((r: any) => {
          mapped.push({
            id: r.id,
            type: "time_off",
            title: `${r.employee?.profiles?.first_name || "Employee"} - ${r.leave_type?.name || "Time off"}`,
            start_date: r.start_date.split("T")[0],
            end_date: r.end_date.split("T")[0],
            employee_id: r.employee_id,
            status: (r.status || "pending") as any,
          });
        });
      }

      // Load persisted team schedule events for the current week
      const start = format(currentWeek, "yyyy-MM-dd");
      const end = format(addDays(currentWeek, 6), "yyyy-MM-dd");
      const persisted = await api.getTeamScheduleEvents({
        team_id: selectedTeamId !== "all" ? selectedTeamId : undefined,
        start_date: start,
        end_date: end,
      });
      const persistedMapped: TeamScheduleEvent[] = (persisted?.events || []).map((ev: any) => ({
        id: ev.id,
        type: (ev.event_type || "event") as EventType,
        title: ev.title,
        start_date: ev.start_date,
        end_date: ev.end_date,
        start_time: ev.start_time,
        end_time: ev.end_time,
        team_id: ev.team_id,
        employee_id: ev.employee_id,
      }));

      // Load holidays from calendar API (ignore projects/birthdays for this view)
      try {
        const calendarData = await api.get(`/api/calendar?start_date=${start}&end_date=${end}&view_type=organization`);
        const calendarEvents: TeamScheduleEvent[] = [];
        
        (calendarData.events || []).forEach((ev: any) => {
          const resourceType = ev.resource?.type;
          
          // Only include holidays; skip projects/assignments/birthdays
          if (resourceType === 'holiday') {
            calendarEvents.push({
              id: ev.id,
              type: 'holiday',
              title: ev.title,
              start_date: ev.start?.split('T')[0] || ev.start,
              end_date: ev.end?.split('T')[0] || ev.end || ev.start?.split('T')[0] || ev.start,
              start_time: null, // Holidays have no time
              end_time: null,
              team_id: null,
              employee_id: null,
            });
          }
        });
        
        setEvents([...mapped, ...persistedMapped, ...calendarEvents]);
      } catch (calendarError) {
        console.error("Failed to load calendar events (birthdays, holidays, projects):", calendarError);
        // Continue with just team events if calendar fails
        setEvents([...mapped, ...persistedMapped]);
      }
    } catch (error) {
      console.error("Failed to seed time off / team events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevWeek = () => {
    setCurrentWeek((prev) => addDays(prev, -7));
  };

  const handleNextWeek = () => {
    setCurrentWeek((prev) => addDays(prev, 7));
  };

  const handlePublish = async () => {
    if (!isManagerLike) {
      toast({
        title: "Not allowed",
        description: "Only managers, HR, directors, CEOs and admins can publish announcements.",
        variant: "destructive",
      });
      return;
    }
    setPublishDialogOpen(true);
  };

  const submitPublish = async () => {
    if (!publishTitle.trim() || !publishBody.trim()) {
      toast({
        title: "Title and message required",
        description: "Please enter both a title and a short message.",
        variant: "destructive",
      });
      return;
    }
    try {
      setPublishing(true);
      await api.createAnnouncement({
        title: publishTitle.trim(),
        body: publishBody.trim(),
        priority: "normal",
        pinned: publishPinned,
      });
      toast({
        title: "Announcement published",
        description: "Your message will appear in the dashboard announcements for everyone.",
      });
      setPublishDialogOpen(false);
      setPublishTitle("");
      setPublishBody("");
      setPublishPinned(false);
    } catch (error: any) {
      toast({
        title: "Failed to publish",
        description: error?.message || "Unable to publish announcement.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  const openNewEvent = (defaults?: { employee_id?: string; date?: string }) => {
    const d = defaults || {};
    setNewEventDefaults(d);
    setNewEventTitle("");
    setNewEventType("event");
    setNewEventDate(d.date || format(new Date(), "yyyy-MM-dd"));
    setNewEventStartTime("09:00");
    setNewEventEndTime("10:00");
    // Pre-select employee (for row-level Add) when manager-like
    if (isManagerLike && d.employee_id) {
      setSelectedEmployeeIds([d.employee_id]);
    } else {
      setSelectedEmployeeIds([]);
    }
    setNewEventOpen(true);
  };

  const handleCreateEvent = async () => {
    if (!newEventTitle.trim()) {
      toast({ title: "Title required", description: "Please add a title for the event.", variant: "destructive" });
      return;
    }

    const baseDate = newEventDate || newEventDefaults.date || format(new Date(), "yyyy-MM-dd");

    // If manager-like and specific employees have been selected, create one entry per employee
    if (isManagerLike && selectedEmployeeIds.length > 0) {
      const now = Date.now();
      const newItems: TeamScheduleEvent[] = [];

      for (let idx = 0; idx < selectedEmployeeIds.length; idx++) {
        const empId = selectedEmployeeIds[idx];
        // Persist to backend
        const created = await api.createTeamScheduleEvent({
          team_id: selectedTeamId !== "all" ? selectedTeamId : null,
          employee_id: empId,
          title: newEventTitle.trim(),
          event_type: newEventType,
          start_date: baseDate,
          end_date: baseDate,
          start_time: newEventStartTime || null,
          end_time: newEventEndTime || null,
          notes: null,
        });

        newItems.push({
          id: created.id || `local-${now}-${idx}`,
          type: (created.event_type || newEventType) as EventType,
          title: created.title,
          start_date: created.start_date,
          end_date: created.end_date,
          start_time: created.start_time,
          end_time: created.end_time,
          employee_id: created.employee_id,
          team_id: created.team_id,
        });
      }

      setEvents((prev) => [...prev, ...newItems]);
    } else {
      // Fallback: single-target event (either specific employee from defaults, or team-wide)
      const targetEmployeeId = newEventDefaults.employee_id || null;
      const targetTeamId = !targetEmployeeId && selectedTeamId !== "all" ? selectedTeamId : null;

      const created = await api.createTeamScheduleEvent({
        team_id: targetTeamId,
        employee_id: targetEmployeeId,
        title: newEventTitle.trim(),
        event_type: newEventType,
        start_date: baseDate,
        end_date: baseDate,
        start_time: newEventStartTime || null,
        end_time: newEventEndTime || null,
        notes: null,
      });

      const newItem: TeamScheduleEvent = {
        id: created.id,
        type: (created.event_type || newEventType) as EventType,
        title: created.title,
        start_date: created.start_date,
        end_date: created.end_date,
        start_time: created.start_time,
        end_time: created.end_time,
        employee_id: created.employee_id,
        team_id: created.team_id,
      };

      setEvents((prev) => [...prev, newItem]);
    }

    setNewEventOpen(false);
    setSelectedEmployeeIds([]);
  };

  const visibleMembers = members.length > 0 ? members : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Schedule</h1>
            <p className="text-muted-foreground">
              View team events, time-off and announcements in a single glass timeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openNewEvent()}>
              <PlusIcon className="mr-2 h-4 w-4" />
              New Event
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!isManagerLike}
              onClick={handlePublish}
              title={
                isManagerLike
                  ? "Publish an announcement to teams"
                  : "Only managers, HR, CEO, and admins can publish announcements"
              }
            >
              <Megaphone className="mr-2 h-4 w-4" />
              Publish
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="shadow-sm">
          <CardContent className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Team</span>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger className="h-9 min-w-[180px]">
                    <SelectValue placeholder="All teams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All teams</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isManagerLike && selectedTeamId !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTeamEditDialogOpen(true)}
                    className="h-9"
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    Manage Team
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handlePrevWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-3 py-1 rounded-full bg-muted text-xs font-medium">
                Week of {format(currentWeek, "MMM dd")} – {format(addDays(currentWeek, 6), "MMM dd, yyyy")}
              </div>
              <Button variant="ghost" size="icon" onClick={handleNextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Compact calendar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4 text-primary" />
                Calendar
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <p className="mb-2">
                Use the weekly timeline to see who is off and what’s happening across your teams.
              </p>
              <p>
                Time-off requests from Leave Requests are shown automatically here for you and, if you are a
                manager, for your team.
              </p>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Weekly timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-3 py-2 w-40 sticky left-0 bg-muted/40 backdrop-blur-sm z-10">
                        Member
                      </th>
                      {weekDays.map((day) => (
                        <th key={day.toISOString()} className="text-center px-3 py-2 min-w-[110px]">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-medium">{format(day, "EEE")}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {format(day, "MMM dd")}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={weekDays.length + 1} className="text-center py-8 text-muted-foreground">
                          Loading schedule…
                        </td>
                      </tr>
                    ) : visibleMembers.length === 0 ? (
                      <tr>
                        <td colSpan={weekDays.length + 1} className="text-center py-8 text-muted-foreground">
                          No team members to display. Select a team to see its schedule.
                        </td>
                      </tr>
                    ) : (
                      visibleMembers.map((member) => {
                        const fullName = (member.employee_name || "").trim();

                        return (
                          <tr key={member.id} className="border-b last:border-b-0">
                            <td className="px-3 py-2 sticky left-0 bg-background/95 backdrop-blur-sm z-10">
                              <div className="flex flex-col">
                                <span className="font-medium">{fullName || "Member"}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {member.employee_email || member.employee_id || member.id}
                                </span>
                              </div>
                            </td>
                            {weekDays.map((day) => {
                              const dateStr = format(day, "yyyy-MM-dd");
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                              const dayEvents = events.filter(
                                (ev) =>
                                  coversDate(ev, dateStr) &&
                                  (
                                    ev.employee_id === member.employee_id ||
                                    (!!ev.team_id && selectedTeamId !== "all" && ev.team_id === selectedTeamId)
                                  ),
                              );

                              const isHoliday = dayEvents.some(ev => ev.type === "holiday");

                              // Holiday has priority over weekend for styling
                              if (isHoliday) {
                                return (
                                  <td
                                    key={dateStr}
                                    className="px-3 py-2 align-top bg-blue-100"
                                  >
                                    <div className="flex flex-col gap-1">
                                      {dayEvents.map((ev) => {
                                        const isTimeOff = ev.type === "time_off";
                                        const baseLeaveLabel = ev.title || "Leave";
                                        const personName = fullName || member.employee_email || member.employee_id || "Employee";
                                        const leaveLabel = isTimeOff
                                          ? ev.status === "approved"
                                            ? `${personName} - ${baseLeaveLabel}`
                                            : ev.status === "pending"
                                              ? `${personName} - ${baseLeaveLabel} (pending)`
                                              : `${personName} - ${baseLeaveLabel} (declined)`
                                          : ev.title;

                                        // Show timestamps for meeting-like events with times
                                        const meetingTypes = ["event", "milestone", "team_event"];
                                        const isMeetingLike = meetingTypes.includes(ev.type);
                                        const hasStartTime =
                                          ev.start_time !== null &&
                                          ev.start_time !== undefined &&
                                          ev.start_time !== "";
                                        const hasEndTime =
                                          ev.end_time !== null &&
                                          ev.end_time !== undefined &&
                                          ev.end_time !== "";
                                        const shouldShowTimestamp =
                                          isMeetingLike && (hasStartTime || hasEndTime);

                                        return (
                                          <div
                                            key={ev.id}
                                            className={`rounded-full px-2 py-1 text-[11px] border shadow-sm ${
                                              isTimeOff
                                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                : "bg-sky-50 text-sky-800 border-sky-200"
                                            }`}
                                          >
                                            <span className="font-medium">
                                              {leaveLabel}
                                            </span>
                                            {shouldShowTimestamp && (
                                              <span className="ml-1 text-[10px] opacity-80">
                                                <Clock className="inline-block h-3 w-3 mr-0.5 align-middle" />
                                                {formatTime(ev.start_time || undefined)}
                                                {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                );
                              }

                              // Weekend (non-holiday): just green cell with no content
                              if (isWeekend) {
                                return (
                                  <td
                                    key={dateStr}
                                    className="px-3 py-6 text-center text-[11px] bg-green-100"
                                  >
                                  </td>
                                );
                              }

                              if (dayEvents.length === 0) {
                                return (
                                  <td
                                    key={dateStr}
                                    className="px-3 py-2 text-center text-[11px] text-muted-foreground"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openNewEvent({
                                          employee_id: member.employee_id,
                                          date: dateStr,
                                        })
                                      }
                                      className="inline-flex items-center justify-center h-6 px-2 rounded-full border border-dashed border-slate-300 text-[11px] font-medium hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                                    >
                                      <span className="mr-1 text-base leading-none">+</span>
                                      Add
                                    </button>
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={dateStr}
                                  className="px-3 py-2 align-top"
                                >
                                  <div className="flex flex-col gap-1">
                                    {dayEvents.map((ev) => {
                                      const isTimeOff = ev.type === "time_off";
                                      const baseLeaveLabel = ev.title || "Leave";
                                      const personName = fullName || member.employee_email || member.employee_id || "Employee";
                                      const leaveLabel = isTimeOff
                                        ? ev.status === "approved"
                                          ? `${personName} - ${baseLeaveLabel}`
                                          : ev.status === "pending"
                                            ? `${personName} - ${baseLeaveLabel} (pending)`
                                            : `${personName} - ${baseLeaveLabel} (declined)`
                                        : ev.title;

                                      // Show timestamps for meeting / task items when time exists
                                      // Hide for time_off, announcements, holidays
                                      const suppressTypes = ["time_off", "announcement", "holiday"];
                                      const meetingTypes = ["event", "milestone", "team_event"];
                                      const isMeetingLike = meetingTypes.includes(ev.type);
                                      const hasStartTime =
                                        ev.start_time !== null &&
                                        ev.start_time !== undefined &&
                                        ev.start_time !== "";
                                      const hasEndTime =
                                        ev.end_time !== null &&
                                        ev.end_time !== undefined &&
                                        ev.end_time !== "";
                                      const shouldShowTimestamp =
                                        isMeetingLike &&
                                        !suppressTypes.includes(ev.type) &&
                                        (hasStartTime || hasEndTime);
                                      
                                      return (
                                        <div
                                          key={ev.id}
                                          className={`rounded-full px-2 py-1 text-[11px] border shadow-sm ${
                                            isTimeOff
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                              : "bg-sky-50 text-sky-800 border-sky-200"
                                          }`}
                                        >
                                          <span className="font-medium">
                                            {leaveLabel}
                                          </span>
                                          {shouldShowTimestamp && (
                                            <span className="ml-1 text-[10px] opacity-80">
                                              <Clock className="inline-block h-3 w-3 mr-0.5 align-middle" />
                                              {formatTime(ev.start_time || undefined)}
                                              {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openNewEvent({
                                          employee_id: member.employee_id,
                                          date: dateStr,
                                        })
                                      }
                                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                                    >
                                      <span className="text-sm leading-none">+</span>
                                      <span>Add entry</span>
                                    </button>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Simple add-event dialog (local only for now) */}
      <Dialog open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to team schedule</DialogTitle>
            <DialogDescription>
              This adds a local schedule entry. Backend saving and drag-to-resize will come in a later step.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="e.g. Sprint planning, client call, release"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="event-date">Date</Label>
              <Input
                id="event-date"
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="event-start-time">Start time</Label>
                <Input
                  id="event-start-time"
                  type="time"
                  value={newEventStartTime}
                  onChange={(e) => setNewEventStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="event-end-time">End time</Label>
                <Input
                  id="event-end-time"
                  type="time"
                  value={newEventEndTime}
                  onChange={(e) => setNewEventEndTime(e.target.value)}
                />
              </div>
            </div>
            {isManagerLike && visibleMembers.length > 0 && (
              <div className="space-y-2">
                <Label>Invite employees (optional)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Select one or more team members to add this event to their row. If you leave this empty, the event will apply to the whole team.
                </p>
                <div className="max-h-32 overflow-y-auto border rounded-md px-2 py-1.5 space-y-1 bg-muted/40">
                  {visibleMembers.map((m) => {
                    const id = m.employee_id;
                    if (!id) return null;
                    const checked = selectedEmployeeIds.includes(id);
                    const label = (m.employee_name || "").trim() || id;
                    return (
                      <label key={id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedEmployeeIds((prev) =>
                              e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                            );
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="event-type">Type</Label>
              <Select
                value={newEventType}
                onValueChange={(val) => setNewEventType(val as EventType)}
              >
                <SelectTrigger id="event-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="milestone">Milestone</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                  <SelectItem value="time_off">Time off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewEventOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateEvent}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish announcement dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish announcement</DialogTitle>
            <DialogDescription>
              Send a short announcement to the whole company. It will appear in the dashboard announcement box.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="publish-title">Title</Label>
              <Input
                id="publish-title"
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="e.g. HR townhall with engineering team"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="publish-body">Message</Label>
              <Input
                id="publish-body"
                value={publishBody}
                onChange={(e) => setPublishBody(e.target.value)}
                placeholder="Short description or meeting link"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="publish-pinned"
                type="checkbox"
                className="h-4 w-4"
                checked={publishPinned}
                onChange={(e) => setPublishPinned(e.target.checked)}
              />
              <Label htmlFor="publish-pinned">Pin to top of announcements</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={submitPublish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Edit Dialog */}
      <Dialog open={teamEditDialogOpen} onOpenChange={setTeamEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Manage Team Members</DialogTitle>
            <DialogDescription>
              Add or remove employees from {teams.find(t => t.id === selectedTeamId)?.name || "the team"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Current Team Members */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Current Team Members ({members.length})</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No members in this team</p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {member.employee_name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.employee_email || member.employee_id}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTeamMember(member.id, member.employee_name)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Available Employees - Drag and Drop */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Available Employees ({availableEmployees.length})</Label>
              <Input
                placeholder="Search employees..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="mb-2"
              />
              <div
                className="space-y-2 max-h-64 overflow-y-auto border-2 border-dashed rounded-md p-4 min-h-[200px] transition-colors"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {availableEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {employeeSearch ? "No employees found" : "No available employees"}
                  </p>
                ) : (
                  availableEmployees
                    .filter((emp: any) => {
                      if (!employeeSearch) return true;
                      const search = employeeSearch.toLowerCase();
                      const name = `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.toLowerCase();
                      const email = (emp.profiles?.email || "").toLowerCase();
                      return name.includes(search) || email.includes(search);
                    })
                    .map((emp: any) => {
                      const employeeId = emp.id;
                      const name = `${emp.profiles?.first_name || ""} ${emp.profiles?.last_name || ""}`.trim() || "Unknown";
                      const email = emp.profiles?.email || "";
                      return (
                        <div
                          key={employeeId}
                          draggable
                          onDragStart={() => handleDragStart(employeeId)}
                          className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-primary/5 cursor-move transition-all hover:shadow-sm"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{name}</p>
                              <p className="text-xs text-muted-foreground">{email || employeeId}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddTeamMember(employeeId)}
                            className="h-8"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      );
                    })
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                💡 Drag an employee to the drop zone above or click "Add" to add them to the team
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamEditDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" fill="currentColor" /></svg>;
}


