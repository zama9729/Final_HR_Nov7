import { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
} from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Roles that can view the full organization calendar from the Team Calendar widget.
const privilegedRoles = new Set(['hr', 'ceo', 'director', 'admin', 'manager']);

const EVENT_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  shift: { label: 'Shift', color: 'text-blue-700', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  project: { label: 'Project', color: 'text-purple-700', bg: 'bg-purple-50', dot: 'bg-purple-500' },
  holiday: { label: 'Holiday', color: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  birthday: { label: 'Birthday', color: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  leave: { label: 'Leave', color: 'text-rose-700', bg: 'bg-rose-50', dot: 'bg-rose-500' },
  announcement: { label: 'Announcement', color: 'text-slate-700', bg: 'bg-slate-50', dot: 'bg-slate-500' },
  personal: { label: 'Personal', color: 'text-gray-800', bg: 'bg-gray-100', dot: 'bg-gray-700' },
};

type CalendarEvent = {
  id: string;
  type: keyof typeof EVENT_META;
  title: string;
  date: string;
  time?: string;
  description?: string;
  location?: string;
  shiftSubtype?: 'day' | 'night';
  isPersonal?: boolean;
};

function toKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function CalendarPanel() {
  const { user, userRole } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [viewLevel, setViewLevel] = useState<'employee' | 'organization'>('employee');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [addTitle, setAddTitle] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const normalizeName = (name: string | undefined | null) =>
    (name || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const selfName = normalizeName(
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  );

  // Load any saved personal notes/tasks for this user
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`teamCalendarPersonal:${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as CalendarEvent[];
        setPersonalEvents(
          Array.isArray(parsed)
            ? parsed.map((evt) => ({ ...evt, type: 'personal', isPersonal: true }))
            : [],
        );
      }
    } catch {
      // ignore parse errors
    }
  }, [user?.id]);

  // Persist personal events
  useEffect(() => {
    if (!user?.id) return;
    try {
      const payload = personalEvents.map(({ id, date, title, description }) => ({
        id,
        date,
        title,
        description,
        type: 'personal',
        isPersonal: true,
      }));
      localStorage.setItem(`teamCalendarPersonal:${user.id}`, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [personalEvents, user?.id]);

  useEffect(() => {
    if (!privilegedRoles.has(userRole || '') && viewLevel !== 'employee') {
      setViewLevel('employee');
    }
  }, [userRole, viewLevel]);

  useEffect(() => {
    let isMounted = true;
    const fetchCalendar = async () => {
      setLoading(true);
      setError(null);
      try {
        const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        const response = await api.getCalendar({
          start_date: start,
          end_date: end,
          view_type: viewLevel,
        });
        if (!isMounted) return;

        const mergedRaw: CalendarEvent[] = (response.events || [])
          .map((event: any, idx: number) => {
            const resourceType = event?.resource?.type;
            const normalizedType: CalendarEvent['type'] =
              resourceType === 'shift'
                ? 'shift'
                : resourceType === 'assignment'
                  ? 'project'
                  : resourceType === 'holiday'
                    ? 'holiday'
                    : resourceType === 'birthday'
                      ? 'birthday'
                      : resourceType === 'leave'
                        ? 'leave'
                        : 'announcement';

            const rawISO =
              (typeof event?.resource?.shift_date === 'string' && event.resource.shift_date) ||
              (typeof event?.resource?.start === 'string' && event.resource.start) ||
              (typeof event?.start === 'string' && event.start) ||
              (typeof event?.date === 'string' && event.date) ||
              '';
            if (!rawISO) {
              return null;
            }

            let dateOnly = '';
            try {
              const parsed = new Date(rawISO);
              if (!isNaN(parsed.getTime())) {
                dateOnly = format(parsed, 'yyyy-MM-dd');
              }
            } catch {
              dateOnly = rawISO.split('T')[0] || rawISO;
            }
            if (!dateOnly) {
              dateOnly = rawISO.split('T')[0] || rawISO;
            }

            const time =
              event?.resource?.start_time && event?.resource?.end_time
                ? `${event.resource.start_time} - ${event.resource.end_time}`
                : undefined;

            const shiftSubtype: CalendarEvent['shiftSubtype'] =
              normalizedType === 'shift'
                ? event?.resource?.shift_type === 'night'
                  ? 'night'
                  : 'day'
                : undefined;

            const employeeNameFromResource =
              typeof event?.resource?.employee_name === 'string'
                ? event.resource.employee_name
                : undefined;

            const isSelfBirthdayEvent =
              normalizedType === 'birthday' &&
              !!selfName &&
              normalizeName(employeeNameFromResource) === selfName;

            const title =
              isSelfBirthdayEvent
                ? 'Your birthday'
                : event.title || event?.resource?.template_name || 'Event';

            const description = isSelfBirthdayEvent
              ? undefined
              : employeeNameFromResource ||
                event?.resource?.project_name ||
                event?.resource?.name;

            return {
              id: event.id || `event-${idx}`,
              type: normalizedType,
              title,
              date: dateOnly,
              time,
              description,
              shiftSubtype,
            } as CalendarEvent;
          })
          .filter((item): item is CalendarEvent => Boolean(item));

        // For HR/CEO/Admin in organization view, aggregate day/night shift counts per day
        const RoleForAggregation = new Set(['hr', 'ceo', 'admin']);
        let merged: CalendarEvent[] = mergedRaw;
        if (viewLevel === 'organization' && RoleForAggregation.has((userRole || '').toLowerCase())) {
          const nonShiftEvents: CalendarEvent[] = [];
          const summaryMap = new Map<string, { date: string; subtype: CalendarEvent['shiftSubtype']; count: number }>();

          mergedRaw.forEach((evt) => {
            if (evt.type !== 'shift') {
              nonShiftEvents.push(evt);
              return;
            }
            const subtype: CalendarEvent['shiftSubtype'] = evt.shiftSubtype === 'night' ? 'night' : 'day';
            const key = `${evt.date}|${subtype}`;
            const existing = summaryMap.get(key) || { date: evt.date, subtype, count: 0 };
            existing.count += 1;
            summaryMap.set(key, existing);
          });

          const summaryEvents: CalendarEvent[] = Array.from(summaryMap.values()).map((item) => ({
            id: `shift-summary-${item.date}-${item.subtype}`,
            type: 'shift',
            title: `${item.subtype === 'night' ? 'Night' : 'Day'} Shifts: ${item.count}`,
            date: item.date,
            shiftSubtype: item.subtype,
          }));

          merged = [...summaryEvents, ...nonShiftEvents];
        }

        setEvents(merged);
      } catch (err: any) {
        if (!isMounted) return;
        setError(err?.message || 'Unable to load calendar data');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCalendar();
    return () => {
      isMounted = false;
    };
  }, [currentMonth, viewLevel, userRole]);

  const monthMatrix = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    const days = [];
    let cursor = start;

    while (cursor <= end) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const allEvents = [...events, ...personalEvents];
    return allEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      const key = event.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [events, personalEvents]);

  const openAddForDate = (date: Date) => {
    if (viewLevel !== 'employee') return;
    const key = toKey(date);
    setAddDate(key);
    setAddTitle('');
    setAddNotes('');
    setAddDialogOpen(true);
  };

  const handleSavePersonal = () => {
    if (!addDate || !addTitle.trim()) {
      setError('Please add a title for your note or task.');
      return;
    }
    const newEvent: CalendarEvent = {
      id: `personal-${addDate}-${Date.now()}`,
      type: 'personal',
      title: addTitle.trim(),
      date: addDate,
      description: addNotes || undefined,
      isPersonal: true,
    };
    setPersonalEvents((prev) => [...prev, newEvent]);
    setAddDialogOpen(false);
    setAddTitle('');
    setAddNotes('');
    setError(null);
  };

  return (
    <TooltipProvider>
      <Card className="glass-card rounded-xl border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <CalendarDays className="h-5 w-5 text-gray-700" />
              Team Calendar
            </CardTitle>
            <p className="mt-1 text-sm text-gray-600">
              Shifts, projects, holidays, birthdays, and announcements in one glance.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {privilegedRoles.has(userRole || '') ? (
              <ToggleGroup
                type="single"
                value={viewLevel}
                onValueChange={(val) => val && setViewLevel(val as 'employee' | 'organization')}
              >
                <ToggleGroupItem
                  value="employee"
                  className="rounded-md px-4 text-sm font-medium data-[state=on]:liquid-glass-nav-item-active data-[state=on]:text-gray-900"
                >
                  My calendar
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="organization"
                  className="rounded-md px-4 text-sm font-medium data-[state=on]:liquid-glass-nav-item-active data-[state=on]:text-gray-900"
                >
                  Organization
                </ToggleGroupItem>
              </ToggleGroup>
            ) : (
              <div className="text-sm font-medium text-gray-700 px-4 py-2">
                My calendar
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="h-8 w-8 rounded-md hover:bg-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-bold text-gray-900 min-w-[120px] text-center">{format(currentMonth, 'MMMM yyyy')}</div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="h-8 w-8 rounded-md hover:bg-gray-100"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setCurrentMonth(startOfMonth(new Date()))}
                className="ml-2"
              >
                Today
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="px-3 py-3 text-center">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-gray-100">
            {monthMatrix.map((day) => {
              const key = toKey(day);
              const dayEvents = eventsByDate[key] || [];
              const visibleEvents = dayEvents.slice(0, 3);
              const hiddenEvents = dayEvents.slice(3);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              
              return (
                <div
                  key={key}
                  className={`min-h-[140px] bg-white p-2.5 transition hover:bg-gray-50 ${
                    !isCurrentMonth ? 'text-gray-300' : 'text-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${isToday(day) ? 'text-gray-900' : ''}`}>
                      {format(day, 'd')}
                    </span>
                    {isToday(day) && (
                      <Badge className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Today
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {visibleEvents.map((event) => {
                      const styles = EVENT_META[event.type] || EVENT_META.announcement;
                      return (
                        <Tooltip key={event.id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`${styles.bg} ${styles.color} flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:opacity-90 transition-opacity`}
                            >
                              <span className={`h-2 w-2 rounded-full ${styles.dot} flex-shrink-0`} />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{event.title}</div>
                                {event.time && (
                                  <div className="text-[10px] text-gray-600 mt-0.5">{event.time}</div>
                                )}
                                {event.description && (
                                  <div className="text-[10px] text-gray-500 truncate mt-0.5">{event.description}</div>
                                )}
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="space-y-1">
                              <p className="font-semibold">{event.title}</p>
                              {event.time && <p className="text-xs text-gray-400">Time: {event.time}</p>}
                              {event.description && <p className="text-xs text-gray-400">{event.description}</p>}
                              {event.location && <p className="text-xs text-gray-400">Location: {event.location}</p>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {hiddenEvents.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-[11px] font-semibold text-gray-700 hover:text-gray-900 cursor-pointer py-1 px-2 rounded-md hover:bg-gray-100 transition-colors">
                            +{hiddenEvents.length} more
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-sm">
                          <div className="space-y-2">
                            <p className="font-semibold text-sm mb-2">Additional Events ({hiddenEvents.length})</p>
                            {hiddenEvents.map((event) => {
                              const styles = EVENT_META[event.type] || EVENT_META.announcement;
                              return (
                                <div key={event.id} className="space-y-1 border-b border-gray-200 last:border-0 pb-2 last:pb-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                                    <p className="font-semibold text-sm">{event.title}</p>
                                  </div>
                                  {event.time && <p className="text-xs text-gray-400 ml-4">Time: {event.time}</p>}
                                  {event.description && <p className="text-xs text-gray-400 ml-4">{event.description}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {viewLevel === 'employee' && (
                      <button
                        type="button"
                        onClick={() => openAddForDate(day)}
                        className="mt-1 inline-flex items-center justify-center rounded-full border border-dashed border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Add
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 border-t border-gray-200 px-4 py-4 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading events…
            </div>
          )}
          {error && (
            <div className="border-t border-gray-200 px-4 py-4 text-sm text-rose-600">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to My calendar</DialogTitle>
            <DialogDescription>
              Create a private note, task, or event for your own Team Calendar. Only you will see this entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-1 py-2">
            {addDate && (
              <p className="text-xs text-gray-500">
                Date: <span className="font-medium">{addDate}</span>
              </p>
            )}
            <div className="space-y-1">
              <Label htmlFor="personal-title">Title</Label>
              <Input
                id="personal-title"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. 1:1 with manager, prepare deck, follow-ups"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="personal-notes">Notes (optional)</Label>
              <Textarea
                id="personal-notes"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                rows={3}
                placeholder="Add details, checklist items, or meeting links…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePersonal}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

export default CalendarPanel;
