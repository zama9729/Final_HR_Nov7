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
  is_shared?: boolean;
  shared_with_employee_ids?: string[];
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

  // Listen for calendar events updates
  useEffect(() => {
    const handleCalendarUpdate = () => {
      fetchInitialEvents();
    };
    window.addEventListener('calendar-events-updated', handleCalendarUpdate);
    return () => {
      window.removeEventListener('calendar-events-updated', handleCalendarUpdate);
    };
  }, []);

  useEffect(() => {
    if (selectedTeamId && selectedTeamId !== "all") {
      fetchMembers(selectedTeamId);
    } else {
      // When "all" is selected, fetch all employees to show their events
      fetchAllEmployees();
    }
  }, [selectedTeamId]);

  const fetchAllEmployees = async () => {
    try {
      // Fetch all employees from the organization
      const allEmployees = await api.get('/api/employees?status=active&limit=1000');
      const employeesAsMembers: TeamMember[] = (allEmployees.employees || allEmployees || []).map((emp: any) => ({
        id: emp.id,
        employee_id: emp.id, // This should match the employee_id in team_schedule_events
        employee_name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.email || emp.employee_id,
        employee_email: emp.email,
        employee_id_display: emp.employee_id,
        position: emp.position,
        department: emp.department,
      }));
      console.log('[TeamSchedule] Fetched employees:', employeesAsMembers.length);
      console.log('[TeamSchedule] Sample employee IDs:', employeesAsMembers.slice(0, 3).map(m => ({ id: m.id, employee_id: m.employee_id, name: m.employee_name })));
      setMembers(employeesAsMembers);
    } catch (error) {
      console.error("Failed to fetch all employees:", error);
      setMembers([]);
    }
  };

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
      console.log('[TeamSchedule] Fetched team schedule events:', persisted);
      console.log('[TeamSchedule] Events count:', persisted?.events?.length || 0);
      const persistedMapped: TeamScheduleEvent[] = (persisted?.events || []).map((ev: any) => {
        // Parse shared_with_employee_ids - it might be a PostgreSQL array string or already an array
        let sharedIds: string[] = [];
        if (ev.shared_with_employee_ids) {
          if (Array.isArray(ev.shared_with_employee_ids)) {
            sharedIds = ev.shared_with_employee_ids;
          } else if (typeof ev.shared_with_employee_ids === 'string') {
            // PostgreSQL array format: "{uuid1,uuid2}" or "{uuid1, uuid2}"
            try {
              const cleaned = ev.shared_with_employee_ids.replace(/[{}]/g, '');
              sharedIds = cleaned ? cleaned.split(',').map((id: string) => id.trim()).filter(Boolean) : [];
            } catch (e) {
              console.warn('Failed to parse shared_with_employee_ids:', ev.shared_with_employee_ids);
              sharedIds = [];
            }
          }
        }
        
        return {
          id: ev.id,
          type: (ev.event_type || "event") as EventType,
          title: ev.title,
          start_date: ev.start_date,
          end_date: ev.end_date,
          start_time: ev.start_time,
          end_time: ev.end_time,
          team_id: ev.team_id,
          employee_id: ev.employee_id,
          is_shared: ev.is_shared || false,
          shared_with_employee_ids: sharedIds,
        };
      });

      // Load all calendar events (shifts, team events, holidays, etc.)
      try {
        const calendarData = await api.get(`/api/calendar?start_date=${start}&end_date=${end}&view_type=organization`);
        const calendarEvents: TeamScheduleEvent[] = [];
        
        (calendarData.events || []).forEach((ev: any) => {
          const resourceType = ev.resource?.type;
          
          // Include holidays, shifts, and team events
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
          } else if (resourceType === 'shift') {
            // Include shifts from schedule_assignments
            const startDate = ev.start?.split('T')[0] || ev.start;
            const endDate = ev.end?.split('T')[0] || ev.end || startDate;
            const startTime = ev.start?.includes('T') ? ev.start.split('T')[1]?.substring(0, 5) : null;
            const endTime = ev.end?.includes('T') ? ev.end.split('T')[1]?.substring(0, 5) : null;
            
            calendarEvents.push({
              id: ev.id,
              type: 'shift',
              title: ev.title || 'Shift',
              start_date: startDate,
              end_date: endDate,
              start_time: startTime,
              end_time: endTime,
              team_id: null,
              employee_id: ev.resource?.employee_id || null,
            });
          } else if (resourceType === 'team_event') {
            // Include team schedule events from calendar API
            calendarEvents.push({
              id: ev.id,
              type: (ev.resource?.event_type || 'event') as EventType,
              title: ev.title,
              start_date: ev.resource?.start_date || ev.start?.split('T')[0] || ev.start,
              end_date: ev.resource?.end_date || ev.end?.split('T')[0] || ev.end || ev.start?.split('T')[0] || ev.start,
              start_time: ev.resource?.start_time || (ev.start?.includes('T') ? ev.start.split('T')[1]?.substring(0, 5) : null),
              end_time: ev.resource?.end_time || (ev.end?.includes('T') ? ev.end.split('T')[1]?.substring(0, 5) : null),
              team_id: ev.resource?.team_id || null,
              employee_id: ev.resource?.employee_id || null,
              is_shared: false, // Will be set from persistedMapped if it's a shared event
              shared_with_employee_ids: [],
            });
          }
        });
        
        // Merge all events, avoiding duplicates
        // Note: calendar API returns team events with ID prefix "team_event_", 
        // while getTeamScheduleEvents returns them with original IDs
        // We'll use persistedMapped for team_schedule_events (more complete data)
        // and calendarEvents for shifts and holidays
        const eventMap = new Map<string, TeamScheduleEvent>();
        
        // First add time-off events
        mapped.forEach(ev => {
          eventMap.set(ev.id, ev);
        });
        
        // Then add persisted team schedule events (these have complete data including is_shared)
        persistedMapped.forEach(ev => {
          eventMap.set(ev.id, ev);
        });
        
        // Finally add calendar events (shifts, holidays, and any team events not already included)
        calendarEvents.forEach(ev => {
          // Skip team events that are already in persistedMapped (check by removing "team_event_" prefix)
          if (ev.id.startsWith('team_event_')) {
            const originalId = ev.id.replace('team_event_', '');
            if (eventMap.has(originalId)) {
              return; // Skip duplicate
            }
          }
          // Skip if already exists
          if (!eventMap.has(ev.id)) {
            eventMap.set(ev.id, ev);
          }
        });
        
        const finalEvents = Array.from(eventMap.values());
        console.log('[TeamSchedule] Final events after merge:', finalEvents.length);
        console.log('[TeamSchedule] Sample events:', finalEvents.slice(0, 3));
        setEvents(finalEvents);
      } catch (calendarError) {
        console.error("Failed to load calendar events:", calendarError);
        // Continue with just team events if calendar fails
        const fallbackEvents = [...mapped, ...persistedMapped];
        console.log('[TeamSchedule] Fallback events:', fallbackEvents.length);
        setEvents(fallbackEvents);
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

  // Build a set of visible employee_ids to identify events not tied to current rows
  const memberEmployeeIds = new Set(visibleMembers.map((m) => m.employee_id));
  const otherEvents =
    selectedTeamId === "all"
      ? events.filter(
          (ev) =>
            ev.employee_id &&
            !memberEmployeeIds.has(ev.employee_id) &&
            ev.type !== "holiday"
        )
      : [];

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
                      <>
                        {visibleMembers.map((member) => {
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
                                (ev) => {
                                  if (!coversDate(ev, dateStr)) return false;
                                  
                                  // Event belongs to this employee
                                  if (ev.employee_id === member.employee_id) return true;
                                  
                                  // Event is shared with this employee
                                  if (ev.is_shared && Array.isArray(ev.shared_with_employee_ids)) {
                                    if (ev.shared_with_employee_ids.includes(member.employee_id)) return true;
                                  }
                                  
                                  // Event belongs to the selected team (when a specific team is selected)
                                  if (!!ev.team_id && selectedTeamId !== "all" && ev.team_id === selectedTeamId) return true;
                                  
                                  // For organization-wide view ("all"), show all events for visible members
                                  if (selectedTeamId === "all" && ev.employee_id === member.employee_id) return true;
                                  
                                  return false;
                                }
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
                                  <div className="flex flex-col gap-1.5">
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
                                          className={`rounded-full px-2 py-1 text-[11px] border shadow-sm whitespace-nowrap ${
                                            isTimeOff
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                              : "bg-sky-50 text-sky-800 border-sky-200"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium truncate">
                                              {leaveLabel}
                                            </span>
                                            {shouldShowTimestamp && (
                                              <span className="ml-1 text-[10px] opacity-80 flex items-center gap-0.5 flex-shrink-0">
                                                <Clock className="h-3 w-3" />
                                                {formatTime(ev.start_time || undefined)}
                                                {ev.end_time ? ` – ${formatTime(ev.end_time)}` : ""}
                                              </span>
                                            )}
                                          </div>
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
                        })}
                        {/* Unassigned / other events row */}
                        {selectedTeamId === "all" && otherEvents.length > 0 && (
                          <tr className="border-b last:border-b-0 bg-muted/10">
                            <td className="px-3 py-2 sticky left-0 bg-background/95 backdrop-blur-sm z-10">
                              <div className="flex flex-col">
                                <span className="font-medium">Other events</span>
                                <span className="text-[11px] text-muted-foreground">
                                  Not linked to visible team members
                                </span>
                              </div>
                            </td>
                            {weekDays.map((day) => {
                              const dateStr = format(day, "yyyy-MM-dd");
                              const dayEvents = otherEvents.filter((ev) => coversDate(ev, dateStr));

                              return (
                                <td key={dateStr} className="px-3 py-2 align-top">
                                  <div className="flex flex-col gap-1.5">
                                    {dayEvents.map((ev) => {
                                      const hasStartTime =
                                        ev.start_time !== null &&
                                        ev.start_time !== undefined &&
                                        ev.start_time !== "";
                                      const hasEndTime =
                                        ev.end_time !== null &&
                                        ev.end_time !== undefined &&
                                        ev.end_time !== "";
                                      const shouldShowTimestamp =
                                        ["event", "milestone", "team_event"].includes(ev.type) &&
                                        (hasStartTime || hasEndTime);

                                      return (
                                        <div
                                          key={ev.id}
                                          className="rounded-full px-2 py-1 text-[11px] border shadow-sm bg-sky-50 text-sky-800 border-sky-200 whitespace-nowrap"
                                        >
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium truncate">
                                              {ev.title}
                                            </span>
                                            {shouldShowTimestamp && (
                                              <span className="ml-1 text-[10px] opacity-80 flex items-center gap-0.5 flex-shrink-0">
                                                <Clock className="h-3 w-3" />
                                                {formatTime(ev.start_time)} - {formatTime(ev.end_time || ev.start_time || "")}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add-event dialog: create schedule for specific employees or whole team */}
      <Dialog open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add schedule event</DialogTitle>
            <DialogDescription>
              Create an event for one or more employees, or for an entire team for the selected day.
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
                <Label>Target employees (optional)</Label>
                <p className="text-[11px] text-muted-foreground">
                  Select one or more people to add this event to their row.
                  If you leave this empty and a specific team is selected in the filter,
                  the event will apply to the whole team instead.
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


