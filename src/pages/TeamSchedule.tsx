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
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, Clock, Users } from "lucide-react";

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
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] = useState("10:00");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState("");
  const [publishBody, setPublishBody] = useState("");
  const [publishPinned, setPublishPinned] = useState(false);

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
    if (selectedTeamId && selectedTeamId !== "all") {
      fetchMembers(selectedTeamId);
    } else {
      setMembers([]);
    }
  }, [selectedTeamId]);

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

  // Seed time-off events from existing leave requests so they show up immediately.
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

      // Team requests for manager/HR/CEO/Admin – so they see their team’s time off
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

      setEvents(mapped);
    } catch (error) {
      console.error("Failed to seed time off events:", error);
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

  const handleCreateEvent = () => {
    if (!newEventTitle.trim()) {
      toast({ title: "Title required", description: "Please add a title for the event.", variant: "destructive" });
      return;
    }

    const baseDate = newEventDefaults.date || format(new Date(), "yyyy-MM-dd");

    // If manager-like and specific employees have been selected, create one entry per employee
    if (isManagerLike && selectedEmployeeIds.length > 0) {
      const now = Date.now();
      const newItems: TeamScheduleEvent[] = selectedEmployeeIds.map((empId, idx) => ({
        id: `local-${now}-${idx}`,
        type: newEventType,
        title: newEventTitle.trim(),
        start_date: baseDate,
        end_date: baseDate,
        start_time: newEventStartTime || null,
        end_time: newEventEndTime || null,
        employee_id: empId,
        team_id: selectedTeamId !== "all" ? selectedTeamId : null,
      }));
      setEvents((prev) => [...prev, ...newItems]);
    } else {
      // Fallback: single-target event (either specific employee from defaults, or team-wide)
      const targetEmployeeId = newEventDefaults.employee_id || null;
      const targetTeamId = !targetEmployeeId && selectedTeamId !== "all" ? selectedTeamId : null;

      const newItem: TeamScheduleEvent = {
        id: `local-${Date.now()}`,
        type: newEventType,
        title: newEventTitle.trim(),
        start_date: baseDate,
        end_date: baseDate,
        start_time: newEventStartTime || null,
        end_time: newEventEndTime || null,
        employee_id: targetEmployeeId,
        team_id: targetTeamId,
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
                              const dayEvents = events.filter(
                                (ev) =>
                                  coversDate(ev, dateStr) &&
                                  (
                                    ev.employee_id === member.employee_id ||
                                    (!!ev.team_id && selectedTeamId !== "all" && ev.team_id === selectedTeamId)
                                  ),
                              );

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
                                    {dayEvents.map((ev) => (
                                      <div
                                        key={ev.id}
                                        className={`rounded-full px-2 py-1 text-[11px] border shadow-sm ${
                                          ev.type === "time_off"
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                            : "bg-sky-50 text-sky-800 border-sky-200"
                                        }`}
                                      >
                                        <span className="font-medium">
                                          {ev.type === "time_off"
                                            ? ev.status === "approved"
                                              ? "On leave"
                                              : ev.status === "pending"
                                                ? "Leave (pending)"
                                                : "Leave (declined)"
                                            : ev.title}
                                        </span>
                                        {(ev.start_time || ev.end_time) && (
                                          <span className="ml-1 text-[10px] opacity-80">
                                            <Clock className="inline-block h-3 w-3 mr-0.5 align-middle" />
                                            {ev.start_time || "--:--"}
                                            {ev.end_time ? ` – ${ev.end_time}` : ""}
                                          </span>
                                        )}
                                      </div>
                                    ))}
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
          <div className="px-4 py-3 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                value={newEventTitle}
                onChange={(e) => setNewEventTitle(e.target.value)}
                placeholder="e.g. Sprint planning, client call, release"
              />
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
    </AppLayout>
  );
}

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" {...props}><path d="M7 1h2v6h6v2H9v6H7V9H1V7h6z" fill="currentColor" /></svg>;
}


