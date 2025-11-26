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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// Roles that can view the full organization calendar from the Team Calendar widget.
// Keep this in sync with the unified calendar page and backend calendar route.
const privilegedRoles = new Set(['hr', 'ceo', 'director', 'admin', 'manager']);

const EVENT_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  shift: { label: 'Shift', color: 'text-blue-700 dark:text-blue-200', bg: 'bg-blue-50 dark:bg-blue-900/30', dot: 'bg-blue-500 dark:bg-blue-300' },
  project: { label: 'Project', color: 'text-purple-700 dark:text-purple-200', bg: 'bg-purple-50 dark:bg-purple-900/30', dot: 'bg-purple-500 dark:bg-purple-300' },
  holiday: { label: 'Holiday', color: 'text-emerald-700 dark:text-emerald-200', bg: 'bg-emerald-50 dark:bg-emerald-900/30', dot: 'bg-emerald-500 dark:bg-emerald-300' },
  birthday: { label: 'Birthday', color: 'text-amber-700 dark:text-amber-200', bg: 'bg-amber-50 dark:bg-amber-900/30', dot: 'bg-amber-500 dark:bg-amber-300' },
  leave: { label: 'Leave', color: 'text-rose-700 dark:text-rose-200', bg: 'bg-rose-50 dark:bg-rose-900/30', dot: 'bg-rose-500 dark:bg-rose-300' },
  announcement: { label: 'Announcement', color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/60', dot: 'bg-slate-500 dark:bg-slate-400' },
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
};

function toKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export function CalendarPanel() {
  const { userRole } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [viewLevel, setViewLevel] = useState<'employee' | 'organization'>('employee');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              // fallback to string split
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

            return {
              id: event.id || `event-${idx}`,
              type: normalizedType,
              title: event.title || event?.resource?.template_name || 'Event',
              date: dateOnly,
              time,
              description: event?.resource?.employee_name || event?.resource?.project_name || event?.resource?.name,
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
  }, [currentMonth, viewLevel]);

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
    return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      const key = event.date;
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [events]);

  return (
    <Card className="border border-slate-100 dark:border-slate-800 shadow-md bg-white/90 dark:bg-slate-900/80 backdrop-blur">
      <CardHeader className="flex flex-col gap-4 border-b border-slate-100 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            <CalendarDays className="h-5 w-5 text-blue-500 dark:text-blue-300" />
            Team Calendar
          </CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Shifts, projects, holidays, birthdays, and announcements in one glance.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ToggleGroup
            type="single"
            value={viewLevel}
            onValueChange={(val) => val && setViewLevel(val as 'employee' | 'organization')}
            className="rounded-full border border-slate-200 bg-slate-50 px-1 dark:bg-slate-800 dark:border-slate-700"
          >
            <ToggleGroupItem
              value="employee"
              className="rounded-full px-4 text-sm data-[state=on]:bg-white data-[state=on]:text-blue-600"
            >
              My calendar
            </ToggleGroupItem>
            <ToggleGroupItem
              value="organization"
              disabled={!privilegedRoles.has(userRole || '')}
              className="rounded-full px-4 text-sm data-[state=on]:bg-white data-[state=on]:text-blue-600 disabled:opacity-40"
            >
              Organization
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 px-3 py-2 shadow-sm dark:border dark:border-slate-700">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-full"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{format(currentMonth, 'MMMM yyyy')}</div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-full"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCurrentMonth(startOfMonth(new Date()))}
              className="ml-2 rounded-full bg-blue-50 text-xs font-semibold text-blue-600 hover:bg-blue-100"
            >
              Today
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="px-4 py-3 text-center">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-slate-100 dark:bg-slate-800">
          {monthMatrix.map((day) => {
            const key = toKey(day);
            const dayEvents = eventsByDate[key] || [];
            return (
              <div
                key={key}
                className={`min-h-[120px] bg-white dark:bg-slate-900 p-2 transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                  !isSameMonth(day, currentMonth) ? 'text-slate-300 dark:text-slate-600' : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{format(day, 'd')}</span>
                  {isToday(day) && (
                    <Badge className="rounded-full bg-blue-50 dark:bg-blue-500/20 px-2 text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-200">
                      Today
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {dayEvents.length === 0 && (
                    <span className="text-xs font-medium text-slate-300 dark:text-slate-500">Week Off</span>
                  )}
                  {dayEvents.slice(0, 3).map((event) => {
                    const styles =
                      event.type === 'shift' && event.shiftSubtype === 'night'
                        ? { bg: 'bg-sky-50 dark:bg-sky-500/20', color: 'text-sky-700 dark:text-sky-100', dot: 'bg-sky-500 dark:bg-sky-300' }
                        : event.type === 'shift' && event.shiftSubtype === 'day'
                          ? { bg: 'bg-rose-50 dark:bg-rose-500/20', color: 'text-rose-700 dark:text-rose-100', dot: 'bg-rose-500 dark:bg-rose-300' }
                          : EVENT_META[event.type] || EVENT_META.announcement;
                    return (
                      <div
                        key={event.id}
                        className={`${styles.bg} ${styles.color} flex items-center gap-2 rounded-lg px-2 py-1 text-xs`}
                      >
                        <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                        <div className="flex flex-col">
                          <span className="font-semibold">{event.title}</span>
                          {event.time && <span className="text-[10px] text-slate-500">{event.time}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-300">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {loading && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading events…
          </div>
        )}
        {error && (
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CalendarPanel;

