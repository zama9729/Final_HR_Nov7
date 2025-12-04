import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Clock, Calendar, Bot, CalendarDays, CalendarClock, Briefcase, Megaphone, TrendingUp, AlertCircle, CheckCircle2, SunMedium, MoonStar, Activity, Loader2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, isFuture, parseISO, addDays, isToday, isTomorrow, subDays, startOfDay, isSameDay } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, ReferenceLine } from "recharts";
import { Badge } from "@/components/ui/badge";
import CalendarPanel from "@/components/dashboard/CalendarPanel";
import { AddressConsentModal } from "@/components/attendance/AddressConsentModal";
import { useClockResultToast } from "@/components/attendance/ClockResultToast";
import confetti from "canvas-confetti";

interface DashboardStats {
  timesheetHours: number;
  leaveBalance: number;
  leaveBreakdown: Array<{
    id: string;
    name: string;
    leave_type: string;
    entitlement: number;
    used: number;
    remaining: number;
  }>;
  nextHoliday: { date: string; name: string } | null;
  projects: Array<{ id: string; name: string; category?: string }>;
  announcements: Array<{ id: string; title: string; body: string; priority: string; created_at: string; type?: 'announcement' | 'birthday' }>;
}

interface UpcomingShift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  template_name: string;
  shift_type: string;
}

interface ClockSession {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  duration_minutes: number | null;
  work_type?: string | null;
}

interface ClockStatusResponse {
  capture_method?: string;
  is_clock_mode?: boolean;
  is_clocked_in: boolean;
  open_session: ClockSession | null;
  last_event?: { event_type: string; raw_timestamp: string } | null;
}

export default function Dashboard() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { showSuccess, showError } = useClockResultToast();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    timesheetHours: 0,
    leaveBalance: 0,
    leaveBreakdown: [],
    nextHoliday: null,
    projects: [],
    announcements: [],
  });
  const [presenceStatus, setPresenceStatus] = useState<string>('online');
  const [upcomingShifts, setUpcomingShifts] = useState<UpcomingShift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [attendanceTrends, setAttendanceTrends] = useState<Array<{ date: string; hours: number }>>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [clockStatus, setClockStatus] = useState<ClockStatusResponse | null>(null);
  const [clockStatusLoading, setClockStatusLoading] = useState(false);
  const [clockActionLoading, setClockActionLoading] = useState(false);
  const [pendingClockAction, setPendingClockAction] = useState<'IN' | 'OUT' | null>(null);
  const [showClockConsent, setShowClockConsent] = useState(false);
  const [workDuration, setWorkDuration] = useState('0h 00m');
  const [isBirthday, setIsBirthday] = useState(false);
  const [employeeData, setEmployeeData] = useState<any>(null);
  const presenceIndicators: Record<string, string> = {
    online: "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.7)]",
    away: "bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.7)]",
    break: "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.7)]",
    out_of_office: "bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.7)]",
    default: "bg-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.6)]",
  };
  const presenceLabel = useMemo(
    () => presenceStatus.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    [presenceStatus]
  );

  const normalizeName = (name: string | undefined | null) =>
    (name || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const getCurrentUserNameVariants = () => {
    const variants: string[] = [];
    const authName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
    if (authName) variants.push(normalizeName(authName));

    const employeeName = [employeeData?.first_name, employeeData?.last_name]
      .filter(Boolean)
      .join(' ');
    if (employeeName) variants.push(normalizeName(employeeName));

    return new Set(variants);
  };

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else if (hour >= 17 && hour < 21) {
      return 'Good evening';
    } else {
      return 'Good night';
    }
  };

  useEffect(() => {
    checkOnboardingStatus();
    fetchDashboardStats();
    fetchPresenceStatus();
    fetchClockStatus();
    fetchEmployeeDataForBirthday();
  }, [user]);

  useEffect(() => {
    if (userRole) {
      fetchUpcomingShifts();
      fetchAttendanceTrends();
    } else {
      setUpcomingShifts([]);
      setAttendanceTrends([]);
    }
  }, [userRole]);

  useEffect(() => {
    if (!clockStatus?.is_clocked_in || !clockStatus.open_session?.clock_in_at) {
      setWorkDuration('0h 00m');
      return;
    }

    const computeDuration = () => {
      const start = new Date(clockStatus.open_session!.clock_in_at).getTime();
      const diffMs = Date.now() - start;
      const hours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
      const minutes = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));
      setWorkDuration(`${hours}h ${minutes.toString().padStart(2, '0')}m`);
    };

    computeDuration();
    const interval = window.setInterval(computeDuration, 60000);
    return () => window.clearInterval(interval);
  }, [clockStatus?.is_clocked_in, clockStatus?.open_session?.clock_in_at]);

  const fetchDashboardStats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);

      // Get current week timesheet hours
      let timesheetHours = 0;
      try {
        const employeeId = await api.getEmployeeId();
        if (employeeId?.id) {
          const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          const timesheet = await api.getTimesheet(weekStart, weekEnd);
          
          // Use total_hours from timesheet if available, otherwise calculate from entries
          if (timesheet.total_hours !== undefined && timesheet.total_hours !== null) {
            timesheetHours = parseFloat(timesheet.total_hours) || 0;
          } else if (timesheet.entries && Array.isArray(timesheet.entries)) {
            // Calculate from entries, excluding holiday entries
            timesheetHours = timesheet.entries
              .filter((entry: any) => !entry.is_holiday)
              .reduce((total: number, entry: any) => {
                return total + (parseFloat(entry.hours || 0));
              }, 0);
          }
        }
      } catch (error) {
        console.error('Error fetching timesheet:', error);
      }

      // Get leave balance (for all roles that have employee records)
      let leaveBalance = 0;
      let leaveBreakdown: DashboardStats["leaveBreakdown"] = [];
      try {
        const balance = await api.getLeaveBalance();
        leaveBalance = balance.leaveBalance || 0;
        if (Array.isArray(balance.breakdown) && balance.breakdown.length > 0) {
          leaveBreakdown = balance.breakdown;
        } else {
          // Fallback to a single total bucket if detailed breakdown is not available
          leaveBreakdown = [
            {
              id: "total",
              name: "Total",
              leave_type: "TOTAL",
              entitlement: balance.totalLeaves || leaveBalance + (balance.approvedLeaves || 0) || 0,
              used: balance.approvedLeaves || 0,
              remaining: Math.max(0, leaveBalance),
            },
          ];
        }
      } catch (error: any) {
        // Only log error if it's not a 404 or permission issue
        const errorMsg = error?.message || String(error);
        if (!errorMsg.includes('not found') && !errorMsg.includes('permission')) {
          console.error('Error fetching leave balance:', error);
        }
      }

      // Get next holiday
      let nextHoliday: { date: string; name: string } | null = null;
      try {
        // Fetch holidays from the API
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/holidays?upcoming=true`,
          { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
        );
        if (response.ok) {
          const holidays = await response.json();
          if (holidays && holidays.length > 0) {
            const holiday = holidays[0];
            nextHoliday = {
              date: holiday.date,
              name: holiday.name || 'Holiday',
            };
          }
        }
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }

      // Get employee projects
      let projects: Array<{ id: string; name: string; category?: string }> = [];
      try {
        const employeeId = await api.getEmployeeId();
        if (employeeId?.id) {
          const employeeProjects = await api.getEmployeeProjects(employeeId.id);
          projects = (employeeProjects || []).map((p: any) => ({
            id: p.id || p.project_id,
            name: p.project_name || p.name,
            category: p.category || p.role || 'Project',
          })).slice(0, 3); // Limit to 3 projects
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      }

      // Get announcements (latest for this org)
      let announcements: Array<{ id: string; title: string; body: string; priority: string; created_at: string; type?: 'announcement' | 'birthday' }> = [];
      try {
        const data = await api.getAnnouncements(5);
        announcements = (data || []).map((a: any) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          priority: a.priority || 'normal',
          created_at: a.created_at,
          type: 'announcement' as const,
        }));
      } catch (error) {
        console.error('Error fetching announcements:', error);
      }

      // Get upcoming birthdays (next 14 days) for all employees
      try {
        const today = new Date();
        const next14Days = new Date(today);
        next14Days.setDate(today.getDate() + 14);
        
        const calendarData = await api.getCalendar({
          start_date: format(today, 'yyyy-MM-dd'),
          end_date: format(next14Days, 'yyyy-MM-dd'),
          view_type: 'organization', // Get all birthdays regardless of profile
        });

        // Extract birthday events from calendar data
        // Birthday events have resource.type === 'birthday'
        const birthdayEvents = (calendarData.events || []).filter((event: any) => 
          event.resource?.type === 'birthday' || event.event_type === 'birthday'
        );
        
        const currentUserNames = getCurrentUserNameVariants();

        // Convert birthday events to announcement-like format
        const birthdayAnnouncements = birthdayEvents.map((event: any) => {
          // Calendar API uses 'start' field for the date
          const eventDateStr = event.start || event.date || event.end;
          const eventDate = parseISO(eventDateStr);
          const isToday = isSameDay(eventDate, today);
          const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          // Extract employee name from title or resource
          const employeeName = event.resource?.employee_name || 
                               event.title?.replace(/🎂\s*/g, '').replace(/'s Birthday/g, '') || 
                               'someone';

          const isSelfBirthday =
            employeeName &&
            currentUserNames.size > 0 &&
            currentUserNames.has(normalizeName(employeeName));
          
          return {
            id: `birthday-${event.id || event.resource?.employee_id || Math.random()}`,
            title: isToday
              ? isSelfBirthday
                ? '🎉 Today is your birthday!'
                : `🎉 Today is ${employeeName}'s birthday!`
              : daysUntil === 1
                ? isSelfBirthday
                  ? '🎂 Tomorrow is your birthday'
                  : `🎂 Tomorrow: ${employeeName}'s Birthday`
                : isSelfBirthday
                  ? `🎂 ${format(eventDate, 'MMM dd')}: Your birthday`
                  : `🎂 ${format(eventDate, 'MMM dd')}: ${employeeName}'s Birthday`,
            body: isToday
              ? isSelfBirthday
                ? 'Enjoy your special day! 🎈'
                : `Wish ${employeeName} a wonderful day! 🎈`
              : isSelfBirthday
                ? `Your birthday is coming up in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.`
                : `Birthday coming up in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`,
            priority: isToday ? 'urgent' : 'normal',
            created_at: eventDateStr,
            type: 'birthday' as const,
          };
        });

        // Combine announcements and birthdays, sort by date (today's birthdays first, then by date)
        announcements = [...announcements, ...birthdayAnnouncements].sort((a, b) => {
          // Today's birthdays/urgent items first
          if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
          if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;
          // Then sort by date
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }).slice(0, 5); // Limit to 5 total items
      } catch (error) {
        console.error('Error fetching birthdays:', error);
      }

      setStats({
        timesheetHours: Math.round(timesheetHours),
        leaveBalance,
        leaveBreakdown,
        nextHoliday,
        projects,
        announcements,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPresenceStatus = async () => {
    if (!user) return;

    try {
      const presence = await api.getPresenceStatus();
      setPresenceStatus(presence.presence_status || 'online');
    } catch (error) {
      console.error('Error fetching presence status:', error);
    }
  };

  const fetchClockStatus = async () => {
    if (!user) {
      setClockStatus(null);
      return;
    }

    try {
      setClockStatusLoading(true);
      const status = await api.getClockStatus();
      setClockStatus(status);
    } catch (error) {
      console.error('Error fetching clock status:', error);
      setClockStatus(null);
    } finally {
      setClockStatusLoading(false);
    }
  };

  const checkOnboardingStatus = async () => {
    if (!user || userRole === 'hr' || userRole === 'director' || userRole === 'ceo' || userRole === 'admin') {
      setIsLoading(false);
      return;
    }

    try {
      const employeeData = await api.checkEmployeePasswordChange();

      if (employeeData) {
        if (employeeData.onboarding_status === 'in_progress' || employeeData.onboarding_status === 'not_started' || employeeData.onboarding_status === 'pending') {
          navigate('/onboarding');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmployeeDataForBirthday = async () => {
    if (!user) return;

    try {
      const employeeIdResult = await api.getEmployeeId();
      if (employeeIdResult?.id) {
        const employee = await api.getEmployee(employeeIdResult.id);
        setEmployeeData(employee);
        
        // Check if today is birthday
        if (employee?.onboarding_data?.date_of_birth) {
          const dob = parseISO(employee.onboarding_data.date_of_birth);
          const today = new Date();
          const isTodayBirthday = dob.getDate() === today.getDate() && 
                                  dob.getMonth() === today.getMonth();
          
          setIsBirthday(isTodayBirthday);
          
          // Trigger confetti every time on birthday (on each visit/refresh)
          if (isTodayBirthday) {
            // Small delay to ensure component is rendered, then trigger confetti
            setTimeout(() => {
              triggerConfetti();
            }, 500);
          }
        }
      }
    } catch (error) {
      // Silently fail - employee data might not be available
      console.log('Could not fetch employee data for birthday check:', error);
    }
  };

  const triggerConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  };

  const getFirstName = () => {
    const metadata = (user as any)?.user_metadata;
    if (employeeData?.profiles?.first_name) {
      return employeeData.profiles.first_name;
    }
    return metadata?.first_name || user?.email?.split('@')[0] || 'User';
  };

  const formatHolidayDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return format(date, 'MMMM d');
    } catch {
      return dateStr;
    }
  };

  const isEmployee = userRole === 'employee';

  const handleSubmitTimesheet = () => {
    navigate('/timesheets');
  };

  const handleApplyLeave = () => {
    navigate('/leaves');
  };

  const formatShiftTime = (time: string) => {
    if (!time) return '';
    // Convert 24h time to 12h format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatClockTime = (value?: string | null) =>
    value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  const getShiftDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  const nextShift = upcomingShifts[0];
  const shiftVisual = nextShift
    ? nextShift.shift_type === 'night'
      ? {
          label: 'Night Shift',
          textColor: 'text-indigo-700 dark:text-indigo-200',
          badgeBg: 'bg-indigo-100 dark:bg-indigo-500/20',
          border: 'border-indigo-200 dark:border-indigo-500/40',
          icon: <MoonStar className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />,
        }
      : {
          label: 'Day Shift',
          textColor: 'text-sky-700 dark:text-sky-200',
          badgeBg: 'bg-amber-100 dark:bg-amber-500/20',
          border: 'border-amber-200 dark:border-amber-400/40',
          icon: <SunMedium className="h-5 w-5 text-amber-500 dark:text-amber-300" />,
        }
    : null;

  const fetchUpcomingShifts = async () => {
    if (!user) {
      setUpcomingShifts([]);
      return;
    }
    
    try {
      setLoadingShifts(true);
      const employeeId = await api.getEmployeeId();
      if (!employeeId?.id) {
        setLoadingShifts(false);
        return;
      }

      // Get upcoming shifts (next 7 days)
      const today = new Date();
      const nextWeek = addDays(today, 7);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/scheduling/employee/${employeeId.id}/shifts?start_date=${format(today, 'yyyy-MM-dd')}&end_date=${format(nextWeek, 'yyyy-MM-dd')}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );

      if (response.ok) {
        const data = await response.json();
        const sorted = (data.shifts || []).sort((a: UpcomingShift, b: UpcomingShift) => {
          const dateCompare = new Date(a.shift_date).getTime() - new Date(b.shift_date).getTime();
          if (dateCompare !== 0) return dateCompare;
          return a.start_time.localeCompare(b.start_time);
        });
        setUpcomingShifts(sorted);
      } else {
        setUpcomingShifts([]);
      }
    } catch (error) {
      console.error('Error fetching upcoming shifts:', error);
    } finally {
      setLoadingShifts(false);
    }
  };

  const fetchAttendanceTrends = async () => {
    if (!user) {
      setAttendanceTrends([]);
      return;
    }

    try {
      setLoadingTrends(true);
      const employeeId = await api.getEmployeeId();
      if (!employeeId?.id) {
        setAttendanceTrends([]);
        return;
      }

      // Get last 14 days of attendance data for this specific employee
      const today = startOfDay(new Date());
      const fromDate = subDays(today, 13); // 14 days including today

      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/v1/attendance/employee/${employeeId.id}/timesheet?from=${format(
          fromDate,
          'yyyy-MM-dd',
        )}&to=${format(today, 'yyyy-MM-dd')}`,
        {
          headers: {
            Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}`,
          },
        },
      );

      if (!resp.ok) {
        console.error('Error fetching attendance trends:', await resp.text());
        setAttendanceTrends([]);
        return;
      }

      const data = await resp.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];

      // Aggregate hours per day for this employee
      const hoursByDate: Record<string, number> = {};
      entries.forEach((entry: any) => {
        if (!entry.work_date) return;
        const dateKey = format(new Date(entry.work_date), 'MMM d');
        const hrs = parseFloat(entry.hours || 0);
        if (!Number.isFinite(hrs) || hrs <= 0) return;
        hoursByDate[dateKey] = (hoursByDate[dateKey] || 0) + hrs;
      });

      // Build sorted array over the last 14 days so missing days show as 0
      const trends: Array<{ date: string; hours: number }> = [];
      for (let i = 13; i >= 0; i--) {
        const d = subDays(today, i);
        const key = format(d, 'MMM d');
        const hrs = hoursByDate[key] || 0;
        trends.push({
          date: key,
          hours: Math.round(hrs * 10) / 10,
        });
      }

      setAttendanceTrends(trends);
    } catch (error) {
      console.error('Error fetching attendance trends:', error);
      setAttendanceTrends([]);
    } finally {
      setLoadingTrends(false);
    }
  };

  const isClockFeatureEnabled = clockStatus?.is_clock_mode ?? true;

  const leaveDonutData = useMemo(() => {
    if (!stats.leaveBreakdown || stats.leaveBreakdown.length === 0) return [];

    // Use entitlement to show category mix even if no leaves have been used yet
    return stats.leaveBreakdown.map((item) => ({
      name: item.name,
      value: item.entitlement || 0,
    }));
  }, [stats.leaveBreakdown]);

  const totalEntitlement = useMemo(
    () => stats.leaveBreakdown.reduce((sum, item) => sum + (item.entitlement || 0), 0),
    [stats.leaveBreakdown]
  );

  const handleClockButtonClick = () => {
    if (!isClockFeatureEnabled) {
      toast({
        title: "Clock unavailable",
        description: "Your organization uses timesheets instead of clock-in/out.",
      });
      return;
    }
    const action = clockStatus?.is_clocked_in ? 'OUT' : 'IN';
    setPendingClockAction(action);
    setShowClockConsent(true);
  };

  const handleClockModalClose = () => {
    setShowClockConsent(false);
    setPendingClockAction(null);
  };

  const handleClockConsentConfirm = async (data: {
    lat?: number;
    lon?: number;
    address_text: string;
    capture_method: 'geo' | 'manual' | 'kiosk' | 'unknown';
    consent: boolean;
  }) => {
    if (!pendingClockAction) return;

    setClockActionLoading(true);
    try {
      const result = await api.clock({
        action: pendingClockAction,
        ts: new Date().toISOString(),
        lat: data.lat,
        lon: data.lon,
        address_text: data.address_text,
        capture_method: data.capture_method,
        consent: data.consent,
      });

      showSuccess({
        action: pendingClockAction,
        workType: (result?.work_type as 'WFO' | 'WFH') || 'WFH',
        address: data.address_text,
        timestamp: new Date().toISOString(),
      });

      await fetchClockStatus();
    } catch (error: any) {
      showError(error?.message || "Unable to record attendance");
    } finally {
      setClockActionLoading(false);
      handleClockModalClose();
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col gap-6 p-6 animate-pulse">
          <div className="h-8 w-1/3 rounded bg-muted" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, idx) => (
              <div key={idx} className="h-32 rounded-lg bg-muted" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-64 rounded-lg bg-muted" />
          </div>
          <div className="h-[460px] rounded-lg bg-muted" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Welcome Section */}
        <div className="mb-6 relative">
          {isBirthday && (
            <div className="absolute -top-4 -left-4 -right-4 -bottom-4 pointer-events-none">
              {/* Confetti container - confetti is triggered via canvas-confetti */}
            </div>
          )}
          <div>
            <h1 className={`text-3xl font-bold mb-2 ${isBirthday ? 'text-primary animate-pulse' : ''}`}>
              {isBirthday ? `🎉 Happy Birthday, ${getFirstName()}! 🎉` : `Welcome back, ${getFirstName()}!`}
            </h1>
            <p className="text-muted-foreground">
              {isBirthday 
                ? "Wishing you a wonderful day filled with joy and celebration!" 
                : getGreeting()}
            </p>
          </div>
        </div>

        {/* Today Summary & Quick Actions */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="shadow-lg border border-white/60 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Today Summary / Quick Actions</CardTitle>
              <p className="text-sm text-muted-foreground">Stay on top of your day</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Presence</p>
                  <div className="flex items-center gap-2 text-base font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${presenceIndicators[presenceStatus] || presenceIndicators.default}`} />
                    {presenceLabel}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Work Hours</p>
                  <p className="text-xl font-semibold">{clockStatus?.is_clocked_in ? workDuration : '—'}</p>
                  <p className="text-xs text-muted-foreground">{clockStatus?.is_clocked_in ? 'in progress' : 'off the clock'}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/60 dark:border-gray-500/30 bg-gray-50/80 dark:bg-gray-500/10 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    {clockStatus?.is_clocked_in ? 'Clocked in since' : 'You are off the clock'}
                  </p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-white">
                    {clockStatus?.is_clocked_in
                      ? formatClockTime(clockStatus.open_session?.clock_in_at)
                      : clockStatusLoading ? 'Checking…' : 'Not started'}
                  </p>
                </div>
                <Button
                  onClick={handleClockButtonClick}
                  disabled={clockActionLoading || clockStatusLoading || !isClockFeatureEnabled}
                  className="min-w-[110px]"
                >
                  {clockActionLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Working…
                    </>
                  ) : (
                    (clockStatus?.is_clocked_in ? 'Clock Out' : 'Clock In')
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Upcoming holiday</p>
                  {stats.nextHoliday ? (
                    <p className="text-sm font-semibold">
                      {stats.nextHoliday.name} · {formatHolidayDate(stats.nextHoliday.date)}
                    </p>
                  ) : (
                    <p className="text-sm font-semibold">No upcoming holidays</p>
                  )}
                </div>
                <CalendarDays className="h-6 w-6 text-sky-500 dark:text-sky-300" />
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-lg border border-white/60 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Leave Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Understand how your leaves are used</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="rounded-2xl border border-gray-200/60 dark:border-gray-500/30 bg-white dark:bg-slate-800/50 p-3 h-full flex flex-col items-center justify-center">
                    <div className="h-32 w-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={leaveDonutData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={26}
                            outerRadius={40}
                            paddingAngle={2}
                          >
                            {leaveDonutData.map((entry, index) => {
                              const colors = [
                                "#10B981", // emerald
                                "#3B82F6", // blue
                                "#F97316", // orange
                                "#A855F7", // purple
                                "#F59E0B", // amber
                              ];
                              return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                            })}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground text-center">
                      {totalEntitlement} days across all leave types
                    </p>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                      Leave balance
                    </p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                      {stats.leaveBalance} days
                    </p>
                    <p className="text-xs text-muted-foreground">available right now</p>
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                    {stats.leaveBreakdown.map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {item.name}
                        </span>
                        <span className="text-muted-foreground">
                          {item.used} used · {item.entitlement} total
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={handleApplyLeave}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white w-full mt-1"
                  >
                    Apply leave
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border border-white/60 dark:border-slate-800/70 bg-white/80 dark:bg-slate-900/70 backdrop-blur-lg">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">{isEmployee ? 'My Shifts' : 'Shift Schedule'}</CardTitle>
              <p className="text-sm text-muted-foreground">Stay aligned with upcoming shifts</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingShifts ? (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading next shift…
                  </div>
                ) : nextShift ? (
                  <div className={`relative rounded-2xl border ${shiftVisual?.border} bg-white/90 dark:bg-slate-900/80 shadow-inner p-4 pl-14`}>
                    <div className={`absolute -top-3 -left-2 h-12 w-12 rounded-full ${shiftVisual?.badgeBg} flex items-center justify-center shadow`}>
                      {shiftVisual?.icon}
                    </div>
                    <div className={`text-2xl font-bold ${shiftVisual?.textColor}`}>
                      {shiftVisual?.label}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      {getShiftDateLabel(nextShift.shift_date)}
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      {formatShiftTime(nextShift.start_time)} – {formatShiftTime(nextShift.end_time)}
                    </p>
                    <Badge variant="outline" className="text-[11px] font-semibold dark:border-slate-700">
                      {nextShift.template_name}
                    </Badge>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No upcoming shifts scheduled</div>
                )}
                <Button
                  onClick={() => navigate(isEmployee ? '/my/profile?tab=shifts' : '/calendar')}
                  className="w-full"
                >
                  {isEmployee ? 'View My Shifts' : 'View Calendar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects, Announcements and Attendance Trends */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* My Projects */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                My Projects
              </CardTitle>
                <Link to="/projects" className="text-sm text-red-600 hover:underline">
                View All
              </Link>
            </CardHeader>
            <CardContent>
              {stats.projects.length > 0 ? (
                <div className="space-y-3">
                  {stats.projects.map((project) => (
                    <div 
                      key={project.id}
                      className="p-3 rounded-lg hover:bg-muted/50 hover-lift cursor-pointer"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <p className="font-medium">{project.name}</p>
                      <p className="text-sm text-muted-foreground">{project.category}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No projects assigned</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Announcements */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-600" />
                Announcements
              </CardTitle>
              {(userRole === 'hr' || userRole === 'director' || userRole === 'ceo' || userRole === 'admin') && (
                <Link to="/announcements" className="text-sm text-red-600 hover:underline">
                  View All
                </Link>
              )}
            </CardHeader>
            <CardContent>
              {stats.announcements.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  No announcements yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {stats.announcements.map((a) => (
                    <div
                      key={a.id}
                      className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                        a.type === 'birthday' 
                          ? 'border-amber-300 bg-amber-50/70' 
                          : a.priority === 'urgent' 
                            ? 'border-red-300 bg-red-50/70' 
                            : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm line-clamp-1">{a.title}</p>
                        <div className="flex items-center gap-1">
                          {a.type === 'birthday' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-700">
                              Birthday
                            </Badge>
                          )}
                          {a.priority === 'urgent' && a.type !== 'birthday' && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              Urgent
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {a.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attendance Trends */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-red-600" />
                Attendance Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTrends ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    Loading trends...
                  </div>
                </div>
              ) : attendanceTrends.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">No attendance data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={attendanceTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    {/* Light background grid for subtle guidance */}
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-800" />
                    {/* Hide axes and labels */}
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={[0, 'dataMax + 2']} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '12px'
                      }}
                      formatter={(value: any) => [`${value} hrs`, 'Average']}
                      labelFormatter={(label) => `${label}`}
                    />
                    {/* Threshold line at 8 hours */}
                    <ReferenceLine
                      y={8}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="hours" 
                      stroke="#E41E26"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6, fill: "#E41E26" }}
                      name="Average Hours"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Unified Team Calendar */}
        <div className="pt-2">
          <CalendarPanel />
        </div>
      </div>
      <AddressConsentModal
        open={showClockConsent}
        onClose={handleClockModalClose}
        onConfirm={handleClockConsentConfirm}
        action={pendingClockAction || 'IN'}
      />
    </AppLayout>
  );
}