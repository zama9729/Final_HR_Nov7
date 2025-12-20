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
  parseISO,
  eachDayOfInterval,
  isWithinInterval,
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
  team_event: { label: 'Team Event', color: 'text-indigo-700', bg: 'bg-indigo-50', dot: 'bg-indigo-500' },
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
  const [addStartTime, setAddStartTime] = useState('');
  const [addEndTime, setAddEndTime] = useState('');

  const normalizeName = (name: string | undefined | null) =>
    (name || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const selfName = normalizeName(
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  );

  // Load personal events from backend and localStorage (for migration)
  useEffect(() => {
    if (!user?.id) return;
    const loadPersonalEvents = async () => {
      try {
        // Try to load from backend first
        const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        const response = await api.getPersonalCalendarEvents({ start_date: monthStart, end_date: monthEnd });
        const backendEvents = (response?.events || []).map((evt: any) => {
          // Normalize date to YYYY-MM-DD format
          let eventDate = evt.event_date;
          if (eventDate instanceof Date) {
            eventDate = format(eventDate, 'yyyy-MM-dd');
          } else if (typeof eventDate === 'string') {
            eventDate = eventDate.split('T')[0]; // Extract YYYY-MM-DD from ISO string
          }
          
          return {
            id: evt.id,
            type: 'personal' as const,
            title: evt.title,
            date: eventDate,
            time: evt.start_time && evt.end_time 
              ? `${evt.start_time.substring(0, 5)}-${evt.end_time.substring(0, 5)}`
              : evt.start_time 
              ? evt.start_time.substring(0, 5)
              : undefined,
            description: evt.description,
            isPersonal: true,
          };
        });
        
        console.log('Loaded personal events from backend:', backendEvents);
        
        // Also check localStorage for any events not yet migrated
        try {
          const raw = localStorage.getItem(`teamCalendarPersonal:${user.id}`);
          if (raw) {
            const parsed = JSON.parse(raw) as CalendarEvent[];
            const localEvents = parsed.map((evt) => ({ ...evt, type: 'personal' as const, isPersonal: true }));
            // Merge and deduplicate
            const allEvents = [...backendEvents, ...localEvents];
            const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.id, e])).values());
            setPersonalEvents(uniqueEvents);
            // Clear localStorage after migration
            localStorage.removeItem(`teamCalendarPersonal:${user.id}`);
          } else {
            setPersonalEvents(backendEvents);
          }
        } catch {
          setPersonalEvents(backendEvents);
        }
      } catch (error) {
        console.error('Failed to load personal events:', error);
        // Fallback to localStorage
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
      }
    };
    loadPersonalEvents();
  }, [user?.id, currentMonth]);

  useEffect(() => {
    if (!privilegedRoles.has(userRole || '') && viewLevel !== 'employee') {
      setViewLevel('employee');
    }
  }, [userRole, viewLevel]);

  // Listen for calendar events updates (e.g., from Smart Memo)
  useEffect(() => {
    const handleCalendarUpdate = () => {
      // Trigger a calendar refresh by updating currentMonth slightly
      // This will cause the fetchCalendar effect to re-run
      setCurrentMonth((prev) => new Date(prev.getTime()));
    };

    window.addEventListener('calendar-events-updated', handleCalendarUpdate);
    return () => {
      window.removeEventListener('calendar-events-updated', handleCalendarUpdate);
    };
  }, []);

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
        
        // Debug logging
        const eventTypes = response.events?.reduce((acc: any, e: any) => {
          const type = e?.resource?.type || 'unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {}) || {};
        
        console.log('📅 [CalendarPanel] Calendar Data:', {
          viewLevel,
          userRole,
          eventCount: response.events?.length || 0,
          eventTypes,
          hasShifts: eventTypes.shift > 0,
          hasProjects: eventTypes.assignment > 0,
          hasLeaves: eventTypes.leave > 0,
          hasBirthdays: eventTypes.birthday > 0,
          hasTeamEvents: eventTypes.team_event > 0,
          hasHolidays: eventTypes.holiday > 0,
        });
        
        // Show alert for debugging (remove after testing)
        if (response.events?.length === 0) {
          console.warn('⚠️ [CalendarPanel] No events returned from API. Check server logs for [Calendar API]');
        } else {
          console.log('✅ [CalendarPanel] Events received:', response.events?.slice(0, 5).map((e: any) => ({
            id: e.id,
            type: e.resource?.type,
            title: e.title,
            start: e.start
          })));
        }

        // Get month boundaries for filtering expanded events
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(currentMonth);

        // Expand events with date ranges into individual day events
        const expandedEvents: CalendarEvent[] = [];
        
        (response.events || []).forEach((event: any) => {
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
                      : resourceType === 'team_event'
                        ? 'team_event'
                        : 'announcement';

          // Get start date
          const rawStartISO =
            (typeof event?.resource?.shift_date === 'string' && event.resource.shift_date) ||
            (typeof event?.resource?.start === 'string' && event.resource.start) ||
            (typeof event?.start === 'string' && event.start) ||
            (typeof event?.date === 'string' && event.date) ||
            '';
          
          // Get end date (for date ranges)
          const rawEndISO =
            (typeof event?.resource?.end_date === 'string' && event.resource.end_date) ||
            (typeof event?.end === 'string' && event.end) ||
            rawStartISO; // Default to start if no end date

          if (!rawStartISO) {
            return;
          }

          let startDate: Date;
          let endDate: Date;
          
          try {
            startDate = parseISO(rawStartISO.split('T')[0]);
            endDate = parseISO(rawEndISO.split('T')[0]);
            
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              return;
            }
          } catch {
            return;
          }

          // Derive time for shift events and team_event (Smart Memo) events
          let time: string | undefined = undefined;
          
          if (normalizedType === 'shift' || normalizedType === 'team_event') {
            // Derive a human-readable time range if available
            let startTime: string | undefined =
              typeof event?.resource?.start_time === 'string' && event.resource.start_time
                ? event.resource.start_time.substring(0, 5) // Format HH:mm
                : undefined;
            let endTime: string | undefined =
              typeof event?.resource?.end_time === 'string' && event.resource.end_time
                ? event.resource.end_time.substring(0, 5) // Format HH:mm
                : undefined;

            // Fallback: try to parse from start/end timestamps if explicit time fields aren't present.
            if (!startTime && typeof event?.start === 'string') {
              try {
                const d = new Date(event.start);
                if (!isNaN(d.getTime())) {
                  startTime = format(d, 'HH:mm');
                }
              } catch {
                // ignore parse errors
              }
            }
            if (!endTime && typeof event?.end === 'string') {
              try {
                const d = new Date(event.end);
                if (!isNaN(d.getTime())) {
                  endTime = format(d, 'HH:mm');
                }
              } catch {
                // ignore parse errors
              }
            }

            time =
              startTime && endTime
                ? `${startTime} - ${endTime}`
                : startTime
                  ? startTime
                  : undefined;
          }

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

          // Determine if this event type should be expanded across date ranges
          // Expand: leaves, projects/assignments, team events
          // Don't expand: shifts (single day), birthdays (single day), holidays (single day)
          const shouldExpand = normalizedType === 'leave' || 
                              normalizedType === 'project' || 
                              normalizedType === 'team_event';

          // Compare dates (ignoring time component)
          const startDateStr = format(startDate, 'yyyy-MM-dd');
          const endDateStr = format(endDate, 'yyyy-MM-dd');
          const isDateRange = startDateStr !== endDateStr;

          if (shouldExpand && isDateRange) {
            // Expand date range: create an event for each day
            const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
            
            dateRange.forEach((day) => {
              // Only include days within the current month view
              if (isWithinInterval(day, { start: monthStart, end: monthEnd })) {
                expandedEvents.push({
                  id: `${event.id || `event-${idx}`}-${format(day, 'yyyy-MM-dd')}`,
                  type: normalizedType,
                  title,
                  date: format(day, 'yyyy-MM-dd'),
                  time,
                  description,
                  shiftSubtype,
                } as CalendarEvent);
              }
            });
          } else {
            // Single day event or event type that shouldn't be expanded
            const dateOnly = format(startDate, 'yyyy-MM-dd');
            
            // Only include if within current month view
            if (isWithinInterval(startDate, { start: monthStart, end: monthEnd })) {
              expandedEvents.push({
                id: event.id || `event-${idx}`,
                type: normalizedType,
                title,
                date: dateOnly,
                time,
                description,
                shiftSubtype,
              } as CalendarEvent);
            }
          }
        });

        const mergedRaw: CalendarEvent[] = expandedEvents;

        // Filter out shifts if in "My Calendar" view (they should only appear in Organization view)
        let filteredEvents = mergedRaw;
        if (viewLevel === 'employee') {
          filteredEvents = mergedRaw.filter(e => e.type !== 'shift');
          console.log('🔵 [CalendarPanel] Filtered out shifts for My Calendar view. Remaining events:', filteredEvents.length);
        }
        
        // For HR/CEO/Admin in organization view, aggregate day/night shift counts per day
        const RoleForAggregation = new Set(['hr', 'ceo', 'admin']);
        let merged: CalendarEvent[] = filteredEvents;
        if (viewLevel === 'organization' && RoleForAggregation.has((userRole || '').toLowerCase())) {
          const nonShiftEvents: CalendarEvent[] = [];
          const summaryMap = new Map<string, { date: string; subtype: CalendarEvent['shiftSubtype']; count: number }>();

          filteredEvents.forEach((evt) => {
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
    const grouped = allEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      // Normalize date to YYYY-MM-DD format for consistent key matching
      let dateKey = event.date;
      if (dateKey instanceof Date) {
        dateKey = format(dateKey, 'yyyy-MM-dd');
      } else if (typeof dateKey === 'string') {
        dateKey = dateKey.split('T')[0]; // Extract YYYY-MM-DD from ISO string
      }
      
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(event);
      return acc;
    }, {});
    
    // Debug logging
    if (personalEvents.length > 0) {
      console.log('Personal events in state:', personalEvents);
      console.log('Events grouped by date:', grouped);
    }
    
    return grouped;
  }, [events, personalEvents]);

  const openAddForDate = (date: Date) => {
    if (viewLevel !== 'employee') return;
    const key = toKey(date);
    setAddDate(key);
    setAddTitle('');
    setAddNotes('');
    setAddStartTime('');
    setAddEndTime('');
    setError(null);
    setAddDialogOpen(true);
  };

  const handleSavePersonal = async () => {
    if (!addDate || !addTitle.trim()) {
      setError('Please add a title for your note or task.');
      return;
    }
    
    // Validate time: end time should be after start time
    if (addStartTime && addEndTime && addEndTime <= addStartTime) {
      setError('End time must be after start time.');
      return;
    }
    
    setError(null); // Clear any previous errors
    
    try {
      // Format time strings properly (HH:mm format)
      const formattedStartTime = addStartTime ? `${addStartTime}:00` : undefined;
      const formattedEndTime = addEndTime ? `${addEndTime}:00` : undefined;
      
      // Save to backend
      const savedEvent = await api.createPersonalCalendarEvent({
        title: addTitle.trim(),
        description: addNotes?.trim() || undefined,
        event_date: addDate,
        start_time: formattedStartTime,
        end_time: formattedEndTime,
      });

      if (!savedEvent || !savedEvent.id) {
        throw new Error('Failed to save event - no response from server');
      }

      // Format time string for display: "HH:mm - HH:mm" or just "HH:mm" if only start time
      let timeString: string | undefined;
      if (addStartTime) {
        if (addEndTime) {
          timeString = `${addStartTime} - ${addEndTime}`;
        } else {
          timeString = addStartTime;
        }
      }
      
      const newEvent: CalendarEvent = {
        id: savedEvent.id,
        type: 'personal',
        title: addTitle.trim(),
        date: addDate,
        time: timeString,
        description: addNotes?.trim() || undefined,
        isPersonal: true,
      };
      
      // Add to local state
      setPersonalEvents((prev) => {
        // Remove any existing event with same id (if updating)
        const filtered = prev.filter(e => e.id !== newEvent.id);
        return [...filtered, newEvent];
      });
      
      // Close dialog and reset form
      setAddDialogOpen(false);
      setAddTitle('');
      setAddNotes('');
      setAddStartTime('');
      setAddEndTime('');
      setError(null);
      
      // Reload events from backend to ensure sync
      try {
        const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
        const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        const response = await api.getPersonalCalendarEvents({ start_date: monthStart, end_date: monthEnd });
        const backendEvents = (response?.events || []).map((evt: any) => {
          // Ensure date is in YYYY-MM-DD format
          let eventDate = evt.event_date;
          if (eventDate instanceof Date) {
            eventDate = format(eventDate, 'yyyy-MM-dd');
          } else if (typeof eventDate === 'string') {
            // Normalize date string to YYYY-MM-DD
            eventDate = eventDate.split('T')[0];
          }
          
          return {
            id: evt.id,
            type: 'personal' as const,
            title: evt.title,
            date: eventDate,
            time: evt.start_time && evt.end_time 
              ? `${evt.start_time.substring(0, 5)}-${evt.end_time.substring(0, 5)}`
              : evt.start_time 
              ? evt.start_time.substring(0, 5)
              : undefined,
            description: evt.description,
            isPersonal: true,
          };
        });
        console.log('Reloaded personal events:', backendEvents);
        setPersonalEvents(backendEvents);
      } catch (reloadError) {
        console.error('Failed to reload personal events:', reloadError);
        // Don't show error to user, local state is already updated
      }
    } catch (error: any) {
      console.error('Failed to save personal event:', error);
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to save event. Please try again.';
      setError(errorMessage);
    }
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
                                {event.time && (event.type === 'shift' || event.type === 'team_event') && (
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
                              {event.time && (event.type === 'shift' || event.type === 'team_event') && <p className="text-xs text-gray-400">Time: {event.time}</p>}
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
                                  {event.time && (event.type === 'shift' || event.type === 'team_event') && <p className="text-xs text-gray-400 ml-4">Time: {event.time}</p>}
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
          {!loading && !error && events.length === 0 && personalEvents.length === 0 && (
            <div className="border-t border-gray-200 px-4 py-4 text-sm text-gray-500 text-center">
              No events found for this month. Try switching to "Organization" view if you're a manager/HR/CEO/Admin/Director.
            </div>
          )}
          {/* Debug Info - Remove after testing */}
          {process.env.NODE_ENV === 'development' && (
            <div className="border-t border-gray-200 px-4 py-2 text-xs bg-gray-50">
              <div className="flex items-center gap-4 text-gray-600">
                <span>View: <strong>{viewLevel}</strong></span>
                <span>Role: <strong>{userRole || 'none'}</strong></span>
                <span>Events: <strong>{events.length}</strong></span>
                <span>Personal: <strong>{personalEvents.length}</strong></span>
                <span>Shifts: <strong>{events.filter(e => e.type === 'shift').length}</strong></span>
                <span>Projects: <strong>{events.filter(e => e.type === 'project').length}</strong></span>
                <span>Leaves: <strong>{events.filter(e => e.type === 'leave').length}</strong></span>
                <span>Team Events: <strong>{events.filter(e => e.type === 'team_event').length}</strong></span>
              </div>
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
            <div className="space-y-1">
              <Label htmlFor="personal-date">Date</Label>
              <Input
                id="personal-date"
                type="date"
                value={addDate || ''}
                onChange={(e) => setAddDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="personal-title">Title</Label>
              <Input
                id="personal-title"
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. 1:1 with manager, prepare deck, follow-ups"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="personal-start-time">Start time (optional)</Label>
                <Input
                  id="personal-start-time"
                  type="time"
                  value={addStartTime}
                  onChange={(e) => setAddStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="personal-end-time">End time (optional)</Label>
                <Input
                  id="personal-end-time"
                  type="time"
                  value={addEndTime}
                  onChange={(e) => setAddEndTime(e.target.value)}
                />
              </div>
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
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}
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
