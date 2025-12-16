import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock, Save, Check, X, Calendar as CalendarIcon, RotateCcw, Plus, Trash2, Send, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DateRange } from "react-day-picker";

interface TimesheetEntry {
  id?: string;
  work_date: string;
  hours: number;
  description: string;
  project_id?: string | null;
  project_type?: 'assigned' | 'non-billable' | 'internal' | null;
  is_holiday?: boolean;
  source?: string;
  readonly?: boolean;
  clock_in?: string | null;
  clock_out?: string | null;
  manual_in?: string | null;
  manual_out?: string | null;
  hours_worked?: number | null;
  notes?: string | null;
}

interface Timesheet {
  id?: string;
  week_start_date: string;
  week_end_date: string;
  total_hours: number;
  status: string;
  rejection_reason?: string;
  entries: TimesheetEntry[];
  // Optional holiday calendar metadata returned by backend
  holidayCalendar?: any[];
}

interface Shift {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  notes?: string;
}

export default function Timesheets() {
  const [currentWeek, setCurrentWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<Record<string, TimesheetEntry[]>>({});
  const [timesheetData, setTimesheetData] = useState<any>(null);
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayCalendar, setHolidayCalendar] = useState<any>({});
  const [selectedState, setSelectedState] = useState<string>('all');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeState, setEmployeeState] = useState<string>('');
  const [assignedProjects, setAssignedProjects] = useState<Array<{id: string; project_id: string; project_name: string}>>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6),
  });
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasShiftEntries, setHasShiftEntries] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));
  }, [currentWeek]);

  // Sync dateRange with currentWeek
  useEffect(() => {
    setDateRange({
      from: currentWeek,
      to: addDays(currentWeek, 6),
    });
  }, [currentWeek]);

  // Handle date range selection from calendar
  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (range?.from) {
      const weekStart = startOfWeek(range.from, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      
      // If only 'from' is selected, auto-select the full week
      if (!range.to) {
        const fullWeekRange: DateRange = {
          from: weekStart,
          to: weekEnd,
        };
        setDateRange(fullWeekRange);
        setCurrentWeek(weekStart);
        setCalendarOpen(false);
        return;
      }
      
      // If range has both from and to, set currentWeek to start of week containing 'from'
      setDateRange(range);
      setCurrentWeek(weekStart);
      
      // If the range spans multiple weeks, ensure we show the week containing the start date
      const toWeekStart = startOfWeek(range.to, { weekStartsOn: 1 });
      if (toWeekStart.getTime() !== weekStart.getTime()) {
        // If selection spans multiple weeks, use the week containing the start date
        setCurrentWeek(weekStart);
      }
      
      setCalendarOpen(false);
    }
  };

  const fetchEmployeeInfo = async () => {
    try {
      const empId = await api.getEmployeeId();
      setEmployeeId(empId?.id || '');
      
      // Fetch employee state
      if (empId?.id) {
        const data = await api.get(`/api/employees/${empId.id}`);
        setEmployeeState(data.state || '');
        if (!selectedState || selectedState === 'all') {
          setSelectedState(data.state || 'all');
        }
        
        // Fetch assigned projects
        try {
          const projects = await api.getEmployeeProjects(empId.id);
          setAssignedProjects(projects || []);
        } catch (error) {
          console.error('Error fetching assigned projects:', error);
          setAssignedProjects([]);
        }
      }
    } catch (error) {
      console.error('Error fetching employee info:', error);
    }
  };

  // Helper function to normalize date to YYYY-MM-DD format
  const normalizeDate = (date: any): string => {
    if (!date) return '';
    if (typeof date === 'string') {
      // If it's already YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      // If it contains T (ISO format), extract date part
      if (date.includes('T')) {
        return date.split('T')[0];
      }
      // Try to parse as date
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          return format(d, 'yyyy-MM-dd');
        }
      } catch (e) {
        console.warn('Invalid date format:', date);
      }
    }
    if (date instanceof Date) {
      return format(date, 'yyyy-MM-dd');
    }
    // Fallback: try to extract date part
    const dateStr = String(date);
    if (dateStr.includes('T')) {
      return dateStr.split('T')[0];
    }
    return dateStr.substring(0, 10);
  };

  // Check if a date is a holiday (checking all sources)
  const isDateHoliday = (dateStr: string): boolean => {
    // 1. Check entries for this date
    const dayEntries = entries[dateStr];
    if (Array.isArray(dayEntries) && dayEntries.some((e) => e.is_holiday)) return true;
    
    // 2. Check holidays array (normalized dates)
    if (holidays.some(h => normalizeDate(h.date) === dateStr)) return true;
    
    // 3. Check timesheet.holidayCalendar
    if (timesheet?.holidayCalendar && Array.isArray(timesheet.holidayCalendar)) {
      if (timesheet.holidayCalendar.some((h: any) => normalizeDate(h.date) === dateStr)) return true;
    }
    
    // 4. Check holidayCalendar.holidaysByState
    if (holidayCalendar?.holidaysByState) {
      const stateToCheck = selectedState === 'all' ? employeeState : selectedState;
      if (stateToCheck && holidayCalendar.holidaysByState[stateToCheck]) {
        if (holidayCalendar.holidaysByState[stateToCheck].some((h: any) => normalizeDate(h.date) === dateStr)) return true;
      }
      // Also check all states if selectedState is 'all'
      if (selectedState === 'all') {
        for (const stateHolidays of Object.values(holidayCalendar.holidaysByState)) {
          if (Array.isArray(stateHolidays) && stateHolidays.some((h: any) => normalizeDate(h.date) === dateStr)) {
            return true;
          }
        }
      }
    }
    
    return false;
  };

  const fetchHolidays = async () => {
    if (!employeeId) return;
    
    try {
      const currentYear = new Date().getFullYear();
      const stateParam = selectedState === 'all' ? null : selectedState;
      const params = new URLSearchParams({ year: currentYear.toString() });
      if (stateParam) params.append('state', stateParam);
      
      const data = await api.get(`/api/holidays/employee/${employeeId}?${params}`);
      // Normalize dates when setting holidays
      const normalizedHolidays = (data.holidays || []).map((h: any) => ({
        ...h,
        date: normalizeDate(h.date)
      })).filter((h: any) => h.date);
      setHolidays(normalizedHolidays);
    } catch (error) {
      console.error('Error fetching holidays:', error);
    }
  };

  const fetchHolidayCalendar = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const params = new URLSearchParams({ year: currentYear.toString() });
      if (selectedState && selectedState !== 'all') {
        params.append('state', selectedState);
      }
      
      const data = await api.get(`/api/holidays/calendar?${params}`);
      setHolidayCalendar(data);
      if (data.states && data.states.length > 0) {
        setAvailableStates(data.states);
      }
    } catch (error) {
      console.error('Error fetching holiday calendar:', error);
    }
  };

  useEffect(() => {
    fetchEmployeeInfo();
    fetchTimesheet();
    fetchShifts();
  }, [currentWeek, user]);

  // Re-fetch projects when week changes
  useEffect(() => {
    if (employeeId) {
      // Fetch projects for the first day of the week
      const weekStartStr = format(currentWeek, 'yyyy-MM-dd');
      api.getEmployeeProjects(employeeId, weekStartStr)
        .then(projects => setAssignedProjects(projects || []))
        .catch(error => {
          console.error('Error fetching assigned projects:', error);
          setAssignedProjects([]);
        });
    }
  }, [currentWeek, employeeId]);

  useEffect(() => {
    if (employeeId) {
      fetchHolidays();
    }
  }, [employeeId, selectedState, currentWeek]);

  useEffect(() => {
    fetchHolidayCalendar();
  }, [selectedState]);

  // Update entries when holidays change to ensure is_holiday flag is set correctly
  useEffect(() => {
    if (weekDays.length === 0) return;
    
    setEntries((prevEntries) => {
      const updatedEntries = { ...prevEntries };
      
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        
        // Check all holiday sources (without using entries state to avoid circular dependency)
        let isHoliday = false;
        
        // 1. Check holidays array
        if (holidays.some(h => normalizeDate(h.date) === dateStr)) {
          isHoliday = true;
        }
        // 2. Check timesheet.holidayCalendar
        else if (timesheet?.holidayCalendar && Array.isArray(timesheet.holidayCalendar)) {
          if (timesheet.holidayCalendar.some((h: any) => normalizeDate(h.date) === dateStr)) {
            isHoliday = true;
          }
        }
        // 3. Check holidayCalendar.holidaysByState
        else if (holidayCalendar?.holidaysByState) {
          const stateToCheck = selectedState === 'all' ? employeeState : selectedState;
          if (stateToCheck && holidayCalendar.holidaysByState[stateToCheck]) {
            if (holidayCalendar.holidaysByState[stateToCheck].some((h: any) => normalizeDate(h.date) === dateStr)) {
              isHoliday = true;
            }
          }
          // Also check all states if selectedState is 'all'
          if (selectedState === 'all' && !isHoliday) {
            for (const stateHolidays of Object.values(holidayCalendar.holidaysByState)) {
              if (Array.isArray(stateHolidays) && stateHolidays.some((h: any) => normalizeDate(h.date) === dateStr)) {
                isHoliday = true;
                break;
              }
            }
          }
        }
        
        // Update entry array with correct is_holiday flag
        const existingEntries = updatedEntries[dateStr] || [];
        if (existingEntries.length === 0) {
          // Create new entry if it doesn't exist
          updatedEntries[dateStr] = [{
            work_date: dateStr,
            hours: 0,
            description: isHoliday ? "Holiday" : "",
            project_id: null,
            project_type: null,
            is_holiday: isHoliday,
            source: undefined,
          }];
        } else {
          // Update existing entries, but keep holiday entries as-is
          updatedEntries[dateStr] = existingEntries.map(entry => {
            if (isHoliday && !entry.is_holiday) {
              // Convert to holiday entry
              return {
                ...entry,
                is_holiday: true,
                description: "Holiday",
                project_id: null,
                project_type: null,
                source: entry.source,
              };
            } else if (!isHoliday && entry.is_holiday) {
              // Convert from holiday entry to regular entry
              return {
                ...entry,
                is_holiday: false,
                description: entry.description === "Holiday" ? "" : entry.description,
                source: entry.source,
              };
            }
            return entry;
          });
        }
      });
      
      return updatedEntries;
    });
  }, [holidays, holidayCalendar, timesheet, selectedState, employeeState, weekDays]);

  // Ensure entries are initialized
  useEffect(() => {
    if (Object.keys(entries).length === 0 && weekDays.length > 0) {
      const emptyEntries: Record<string, TimesheetEntry[]> = {};
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        emptyEntries[dateStr] = [{
          work_date: dateStr,
          hours: 0,
          description: "",
          project_id: null,
          project_type: null,
          is_holiday: false,
          source: undefined,
        }];
      });
      setEntries(emptyEntries);
    }
  }, [weekDays]);


  const fetchTimesheet = async () => {
    if (!user) return;

    try {
      const weekStart = format(currentWeek, "yyyy-MM-dd");
      const weekEnd = format(addDays(currentWeek, 6), "yyyy-MM-dd");

      // Fetch existing legacy timesheet (projects, manual hours, holidays)
      const fetchedTimesheetData = await api.getTimesheet(weekStart, weekEnd);

      // Fetch attendance-derived punches for this employee and week, then normalize fields
      let attendanceEntries: any[] = [];
      try {
        const empInfo = await api.getEmployeeId();
        if (empInfo?.id) {
          const attendanceData = await api.getEmployeeAttendanceTimesheet(empInfo.id, weekStart, weekEnd);
          const rawEntries = attendanceData?.entries || [];
          attendanceEntries = rawEntries.map((e: any) => ({
            ...e,
            // Normalize work_date and attach clock_in/clock_out fields the UI expects
            work_date:
              typeof e.work_date === "string" && e.work_date.includes("T")
                ? e.work_date.split("T")[0]
                : e.work_date,
            clock_in: e.start_time_utc || null,
            clock_out: e.end_time_utc || null,
          }));

          // Store only the normalized attendance entries for the clock row UI
          setTimesheetData({ entries: attendanceEntries });
        } else {
          setTimesheetData(null);
        }
      } catch (attendanceError) {
        console.error("Error fetching attendance-based timesheet:", attendanceError);
        setTimesheetData(null);
      }

      // Map entries by date - group multiple entries per day
      const entriesMap: Record<string, TimesheetEntry[]> = {};
      const containsShiftEntries = Boolean(
        fetchedTimesheetData?.entries?.some(
          (entry: any) => typeof entry?.source === "string" && entry.source.toLowerCase() === "shift"
        )
      );
      setHasShiftEntries(containsShiftEntries);
      
      // First, process existing timesheet entries if any
      if (fetchedTimesheetData?.entries && Array.isArray(fetchedTimesheetData.entries)) {
        fetchedTimesheetData.entries.forEach((entry: any) => {
          // Convert work_date to YYYY-MM-DD format if it's an ISO string
          let workDate = entry.work_date;
          if (typeof workDate === 'string' && workDate.includes('T')) {
            workDate = workDate.split('T')[0];
          }
          // Ensure work_date is always set
          if (!workDate) {
            console.warn('Entry missing work_date, skipping:', entry);
            return;
          }
          // Group entries by date - multiple entries per day
          if (!entriesMap[workDate]) {
            entriesMap[workDate] = [];
          }
          entriesMap[workDate].push({
            ...entry,
            work_date: workDate,
            hours: typeof entry.hours === 'number' && entry.hours > 0 ? entry.hours : (entry.hours_worked ?? 0) || 0,
            hours_worked: entry.hours_worked ?? entry.hours ?? 0,
            is_holiday: entry.is_holiday || false, // Ensure this is set
            source: entry.source,
            readonly: entry.readonly,
            clock_in: entry.clock_in || null,
            clock_out: entry.clock_out || null,
            manual_in: entry.manual_in || null,
            manual_out: entry.manual_out || null,
            notes: entry.notes || entry.description || '',
          });
        });
      }
      
      // Set holiday calendar and inject holidays into entries
      // Normalize holidays from fetchedTimesheetData
      if (fetchedTimesheetData?.holidayCalendar && Array.isArray(fetchedTimesheetData.holidayCalendar)) {
        const normalizedHolidays = fetchedTimesheetData.holidayCalendar.map((h: any) => ({
          ...h,
          date: normalizeDate(h.date)
        })).filter((h: any) => h.date);
        setHolidays(normalizedHolidays);
      }
      
      // Get all holidays for the current week from all sources
      const getAllHolidaysForWeek = (): Record<string, any> => {
        const holidayMap: Record<string, any> = {};
        
        // From timesheet holidayCalendar
        if (fetchedTimesheetData?.holidayCalendar && Array.isArray(fetchedTimesheetData.holidayCalendar)) {
          fetchedTimesheetData.holidayCalendar.forEach((h: any) => {
            const dateStr = normalizeDate(h.date);
            if (dateStr) {
              holidayMap[dateStr] = { ...h, date: dateStr, name: h.name || 'Holiday' };
            }
          });
        }
        
        // Merge with existing holidays state (they should already be normalized)
        holidays.forEach((h: any) => {
          const dateStr = normalizeDate(h.date);
          if (dateStr) {
            holidayMap[dateStr] = { ...h, date: dateStr, name: h.name || 'Holiday' };
          }
        });
        
        return holidayMap;
      };
      
      const allHolidays = getAllHolidaysForWeek();
      
      // Initialize all week days with entries (including holidays)
      // Also merge clock in/out data from attendance entries
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        
        // Find matching attendance entry that has clock_in/clock_out
        const matchingEntry = attendanceEntries.find((e: any) => {
          const entryDate =
            typeof e.work_date === "string" && e.work_date.includes("T")
              ? e.work_date.split("T")[0]
              : String(e.work_date);
          return entryDate === dateStr;
        });
        
        // If holiday exists for this date, ensure at least one holiday entry
        if (allHolidays[dateStr]) {
          if (!entriesMap[dateStr] || entriesMap[dateStr].length === 0) {
            entriesMap[dateStr] = [{
              work_date: dateStr,
              hours: matchingEntry?.hours_worked ?? matchingEntry?.hours ?? 0,
              hours_worked: matchingEntry?.hours_worked ?? matchingEntry?.hours ?? 0,
              description: "Holiday",
              is_holiday: true,
              project_id: null,
              project_type: null,
              source: undefined,
              clock_in: matchingEntry?.clock_in || null,
              clock_out: matchingEntry?.clock_out || null,
              manual_in: matchingEntry?.manual_in || null,
              manual_out: matchingEntry?.manual_out || null,
              notes: matchingEntry?.notes || matchingEntry?.description || '',
            }];
          } else {
            // Update first entry to holiday if not already, but preserve clock times
            if (!entriesMap[dateStr][0]?.is_holiday) {
              entriesMap[dateStr][0] = {
                ...entriesMap[dateStr][0],
                is_holiday: true,
                description: "Holiday",
                project_id: null,
                project_type: null,
                source: entriesMap[dateStr][0]?.source,
                hours: entriesMap[dateStr][0]?.hours || matchingEntry?.hours_worked || matchingEntry?.hours || 0,
                hours_worked: entriesMap[dateStr][0]?.hours_worked || entriesMap[dateStr][0]?.hours || matchingEntry?.hours_worked || matchingEntry?.hours || 0,
                clock_in: entriesMap[dateStr][0]?.clock_in || matchingEntry?.clock_in || null,
                clock_out: entriesMap[dateStr][0]?.clock_out || matchingEntry?.clock_out || null,
                manual_in: entriesMap[dateStr][0]?.manual_in || matchingEntry?.manual_in || null,
                manual_out: entriesMap[dateStr][0]?.manual_out || matchingEntry?.manual_out || null,
                notes: entriesMap[dateStr][0]?.notes || matchingEntry?.notes || entriesMap[dateStr][0]?.description || '',
              };
            }
          }
        } else if (!entriesMap[dateStr] || entriesMap[dateStr].length === 0) {
          // Create empty entry if it doesn't exist, but include clock times from matching entry
          entriesMap[dateStr] = [{
            work_date: dateStr,
            hours: matchingEntry?.hours_worked ?? matchingEntry?.hours ?? 0,
            hours_worked: matchingEntry?.hours_worked ?? matchingEntry?.hours ?? 0,
            description: "",
            project_id: null,
            project_type: null,
            is_holiday: false,
            source: undefined,
            clock_in: matchingEntry?.clock_in || null,
            clock_out: matchingEntry?.clock_out || null,
            manual_in: matchingEntry?.manual_in || null,
            manual_out: matchingEntry?.manual_out || null,
            notes: matchingEntry?.notes || matchingEntry?.description || '',
          }];
        } else {
          // Ensure existing entries have project_id, project_type, and clock times
          entriesMap[dateStr] = entriesMap[dateStr].map((entry, idx) => ({
            ...entry,
            hours: entry.hours || entry.hours_worked || (idx === 0 ? matchingEntry?.hours_worked || matchingEntry?.hours : 0) || 0,
            hours_worked: entry.hours_worked ?? entry.hours ?? (idx === 0 ? matchingEntry?.hours_worked || matchingEntry?.hours : 0) ?? 0,
            is_holiday: entry.is_holiday || false,
            project_id: entry.project_id || null,
            project_type: entry.project_type || null,
            source: entry.source,
            // Merge clock times from matching entry if not already set
            clock_in: entry.clock_in || (idx === 0 ? matchingEntry?.clock_in : null) || null,
            clock_out: entry.clock_out || (idx === 0 ? matchingEntry?.clock_out : null) || null,
            manual_in: entry.manual_in || (idx === 0 ? matchingEntry?.manual_in : null) || null,
            manual_out: entry.manual_out || (idx === 0 ? matchingEntry?.manual_out : null) || null,
            notes: entry.notes || (idx === 0 ? matchingEntry?.notes : null) || entry.description || '',
          }));
        }
      });
      
      setEntries(entriesMap);
      
      // Set timesheet data if it exists
      if (fetchedTimesheetData && fetchedTimesheetData.id) {
        setTimesheet(fetchedTimesheetData as any);
      } else {
        setTimesheet(null);
      }
    } catch (error) {
      console.error("Error fetching timesheet:", error);
      // Initialize empty entries on error
      const emptyEntries: Record<string, TimesheetEntry[]> = {};
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        emptyEntries[dateStr] = [{
          work_date: dateStr,
          hours: 0,
          description: "",
          project_id: null,
          project_type: null,
          is_holiday: false,
          source: undefined,
        }];
      });
      setEntries(emptyEntries);
      setHasShiftEntries(false);
    }
  };

  const fetchShifts = async () => {
    if (!user) return;

    try {
      // Get employee ID
      const employeeInfo = await api.getEmployeeId();
      if (!employeeInfo || !employeeInfo.id) return;

      // Fetch shifts for the current week
      const shiftsData = await api.getShiftsForEmployee(employeeInfo.id);
      
      // Map shifts by date
      const shiftsMap: Record<string, Shift> = {};
      shiftsData.forEach((shift: any) => {
        const shiftDate = shift.shift_date.split('T')[0]; // Extract date part
        shiftsMap[shiftDate] = {
          id: shift.id,
          shift_date: shiftDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
          shift_type: shift.shift_type,
          notes: shift.notes,
        };
      });
      setShifts(shiftsMap);

      // Auto-fill hours for dates with scheduled shifts
      if (Object.keys(shiftsMap).length > 0) {
        setEntries((prevEntries) => {
          const updatedEntries = { ...prevEntries };
          
          Object.entries(shiftsMap).forEach(([date, shift]) => {
            const dayEntries = updatedEntries[date] || [];
            
            // Calculate hours from shift times
            const [startHour, startMin] = shift.start_time.split(':').map(Number);
            const [endHour, endMin] = shift.end_time.split(':').map(Number);
            
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            
            // Handle overnight shifts (end time before start time)
            let diffMinutes = endMinutes - startMinutes;
            if (diffMinutes < 0) {
              diffMinutes += 24 * 60; // Add 24 hours
            }
            
            const hours = diffMinutes / 60;
            
            // Auto-fill if no manual entry exists or first entry has 0 hours
            if (dayEntries.length === 0 || (dayEntries[0] && (!dayEntries[0].hours || dayEntries[0].hours === 0))) {
              if (dayEntries.length === 0) {
                updatedEntries[date] = [{
                  work_date: date,
                  hours: hours,
                  description: `Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})${shift.notes ? ` - ${shift.notes}` : ''}`,
                  project_id: null,
                  project_type: null,
                  is_holiday: false,
                source: "shift",
                }];
              } else {
                // Update first entry
                updatedEntries[date] = [{
                  ...dayEntries[0],
                  hours: hours,
                  description: `Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})${shift.notes ? ` - ${shift.notes}` : ''}`,
                source: dayEntries[0].source || "shift",
                }];
              }
            } else {
              // Add shift info to description if already has hours
              const existingDesc = dayEntries[0]?.description || '';
              if (!existingDesc.includes('Shift:')) {
                updatedEntries[date] = [{
                  ...dayEntries[0],
                  description: `${existingDesc} | Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})`.trim(),
                source: dayEntries[0].source || "shift",
                }, ...dayEntries.slice(1)];
              }
            }
          });
          
          return updatedEntries;
        });
        setHasShiftEntries(true);
      }
    } catch (error) {
      console.error("Error fetching shifts:", error);
      // Silently fail - shifts are optional
    }
  };

  // Add a new entry for a specific date
  const addEntry = (date: string) => {
    setEntries((prev) => {
      const existingEntries = prev[date] || [];
      const newEntry: TimesheetEntry = {
        work_date: date,
        hours: 0,
        description: "",
        project_id: null,
        project_type: null,
        is_holiday: false,
        source: undefined,
      };
      return {
        ...prev,
        [date]: [...existingEntries, newEntry],
      };
    });
  };

  // Remove an entry by index
  const removeEntry = (date: string, index: number) => {
    setEntries((prev) => {
      const existingEntries = prev[date] || [];
      if (existingEntries.length <= 1) {
        // Keep at least one entry per day
        return prev;
      }
      return {
        ...prev,
        [date]: existingEntries.filter((_, i) => i !== index),
      };
    });
  };

  // Update a specific entry by index
  const updateEntry = (date: string, index: number, field: "hours" | "description" | "project_id" | "project_type", value: string | number | null) => {
    setEntries((prev) => {
      const existingEntries = prev[date] || [];
      const updatedEntries = [...existingEntries];
      if (updatedEntries[index]) {
        updatedEntries[index] = {
          ...updatedEntries[index],
          [field]: field === "hours" ? parseFloat(value as string) || 0 : value,
        };
      }
      return {
        ...prev,
        [date]: updatedEntries,
      };
    });
  };

  const calculateTotal = (): number => {
    try {
      if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
        return 0;
      }
      const total = Object.values(entries).reduce((sum, entryArray) => {
        if (!Array.isArray(entryArray)) return sum;
        const dayTotal = entryArray.reduce((daySum, entry) => {
          if (!entry || typeof entry !== 'object') return daySum;
          let hours = 0;
          if (typeof entry.hours === 'number') {
            hours = entry.hours;
          } else if (typeof entry.hours === 'string') {
            hours = parseFloat(entry.hours) || 0;
          } else {
            hours = 0;
          }
          return daySum + hours;
        }, 0);
        return sum + dayTotal;
      }, 0);
      const result = Number(total);
      return Number.isNaN(result) ? 0 : result;
    } catch (error) {
      console.error('Error calculating total:', error);
      return 0;
    }
  };
  
  // Memoize the total to avoid recalculating on every render
  const totalHours: number = useMemo(() => {
    try {
      const result = calculateTotal();
      const num = Number(result);
      return Number.isFinite(num) ? num : 0;
    } catch (error) {
      return 0;
    }
  }, [entries]);

  const saveTimesheet = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const weekStart = format(currentWeek, "yyyy-MM-dd");
      const weekEnd = format(addDays(currentWeek, 6), "yyyy-MM-dd");
      const hoursToSave = calculateTotal();

      // Prepare entries - flatten multiple entries per day into a single array
      // Convert entries object (Record<string, TimesheetEntry[]>) to flat array
      const entriesArray: any[] = [];
      
      Object.keys(entries).forEach((dateKey) => {
        const entryArray = entries[dateKey] || [];
        
        entryArray.forEach((entry) => {
          // Skip holiday entries only - allow entries with 0 hours so users can add new entries
          if (entry.is_holiday || !entry) {
            return;
          }
          
          // ALWAYS use dateKey as the primary source for work_date
          let workDate = dateKey;
          
          // If entry has work_date, try to normalize it to YYYY-MM-DD format
          if (entry?.work_date) {
            let entryWorkDate = entry.work_date;
            
            // If it's an ISO string, extract just the date part
            if (typeof entryWorkDate === 'string') {
              if (entryWorkDate.includes('T')) {
                entryWorkDate = entryWorkDate.split('T')[0];
              }
              entryWorkDate = entryWorkDate.trim();
              
              // Validate it's a date string
              const dateMatch = entryWorkDate.match(/^\d{4}-\d{2}-\d{2}/);
              if (dateMatch) {
                workDate = dateMatch[0]; // Use normalized entry work_date if valid
              }
            }
          }
          
          // Final validation - ensure work_date is set
          if (!workDate || typeof workDate !== 'string' || workDate.trim() === '') {
            console.error(`Invalid work_date - using dateKey: ${dateKey}`, entry);
            workDate = dateKey; // Force use dateKey as final fallback
          }
          
          // Ensure it's in YYYY-MM-DD format
          const dateMatch = workDate.match(/^\d{4}-\d{2}-\d{2}/);
          if (dateMatch) {
            workDate = dateMatch[0];
          } else {
            console.error(`Invalid date format for dateKey: ${dateKey}, workDate: ${workDate}`);
            // If dateKey itself is invalid, try to format current week day
            const dayIndex = Object.keys(entries).indexOf(dateKey);
            if (dayIndex >= 0 && weekDays[dayIndex]) {
              workDate = format(weekDays[dayIndex], "yyyy-MM-dd");
            } else {
              throw new Error(`Cannot determine work_date for entry with dateKey: ${dateKey}`);
            }
          }
          
          entriesArray.push({
            work_date: workDate, // ALWAYS set work_date
            hours: Number(entry?.hours) || 0,
            description: String(entry?.description || ''),
            project_id: entry?.project_id || null,
            project_type: entry?.project_type || null,
            clock_in: entry?.clock_in || null,
            clock_out: entry?.clock_out || null,
            manual_in: entry?.manual_in || null,
            manual_out: entry?.manual_out || null,
            source: entry?.source || null,
            notes: entry?.notes || entry?.description || '',
            hours_worked: typeof entry?.hours_worked === 'number' ? entry.hours_worked : Number(entry?.hours) || 0,
          });
        });
      });

      // Final validation - ensure all entries have valid work_date and skip holiday entries
      // Allow entries with 0 hours so users can add new entries and fill them in later
      const entriesToSave = entriesArray.filter((entry) => {
        // Skip holiday entries - they're auto-managed by backend
        if (entry.is_holiday) {
          return false;
        }
        // Validate entry has work_date - allow 0 hours for new entries
        const isValid = entry && entry.work_date && entry.work_date.trim() !== '' && (entry.hours >= 0);
        if (!isValid) {
          console.warn('Filtering out invalid entry:', entry);
        }
        return isValid;
      });

      // Log for debugging
      console.log('Saving timesheet:', {
        weekStart,
        weekEnd,
        totalHours: hoursToSave,
        rawEntriesKeys: Object.keys(entries),
        rawEntriesCount: Object.keys(entries).length,
        entriesToSaveCount: entriesToSave.length,
        entriesToSave: entriesToSave,
      });

      // Final check - throw error if any entry is missing work_date
      const invalidEntries = entriesToSave.filter(e => !e || !e.work_date || e.work_date.trim() === '');
      if (invalidEntries.length > 0) {
        console.error('Found entries without work_date after filtering:', invalidEntries);
        throw new Error(`Some entries are missing work_date: ${JSON.stringify(invalidEntries)}`);
      }

      // Save timesheet via API
      const savedTimesheetData = await api.saveTimesheet(weekStart, weekEnd, hoursToSave, entriesToSave);

      if (savedTimesheetData) {
        setTimesheet(savedTimesheetData as any);
        setTimesheetData(savedTimesheetData as any);
        
        // Map entries by date - group multiple entries per day
        const entriesMap: Record<string, TimesheetEntry[]> = {};
        (savedTimesheetData as any).entries?.forEach((entry: any) => {
          // Convert work_date to YYYY-MM-DD format if it's an ISO string
          let workDate = entry.work_date;
          if (typeof workDate === 'string' && workDate.includes('T')) {
            workDate = workDate.split('T')[0];
          }
          // Ensure work_date is always set
          if (!workDate) {
            console.warn('Entry missing work_date, skipping:', entry);
            return;
          }
          // Group entries by date - multiple entries per day
          if (!entriesMap[workDate]) {
            entriesMap[workDate] = [];
          }
          entriesMap[workDate].push({
            ...entry,
            work_date: workDate,
            hours: typeof entry.hours === 'number' && entry.hours > 0 ? entry.hours : (entry.hours_worked ?? 0) || 0,
            hours_worked: entry.hours_worked ?? entry.hours ?? 0,
            clock_in: entry.clock_in || null,
            clock_out: entry.clock_out || null,
            manual_in: entry.manual_in || null,
            manual_out: entry.manual_out || null,
            notes: entry.notes || entry.description || '',
          });
        });
        setEntries(entriesMap);
      }

      toast({
        title: "Success",
        description: "Timesheet saved successfully",
      });
    } catch (error: any) {
      console.error("Error saving timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save timesheet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!timesheet || !timesheet.id) {
      toast({
        title: "Error",
        description: "Please save the timesheet first before submitting",
        variant: "destructive",
      });
      return;
    }

    if (timesheet.status === 'pending_approval' || timesheet.status === 'approved') {
      toast({
        title: "Already Submitted",
        description: "This timesheet has already been submitted for approval",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);
      await api.submitTimesheet(timesheet.id);
      await fetchTimesheet();
      toast({
        title: "Success",
        description: "Timesheet submitted for approval successfully",
      });
    } catch (error: any) {
      console.error("Error submitting timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to submit timesheet",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  // Only allow editing if timesheet is draft, pending (legacy), or doesn't exist yet
  // Once submitted (pending_approval) or approved, it should not be editable
  // Note: 'pending' status is legacy from old code - treat it as editable draft
  const isEditable = !timesheet || timesheet.status === "draft" || timesheet.status === "pending";
  
  // Format time for display (supports raw "HH:mm" or full ISO timestamps)
  const formatTime = (timeStr: string | null | undefined): string => {
    if (!timeStr) return '';
    const trimmed = String(timeStr).trim();

    // If backend already sent a plain time like "09:00" or "09:00:00"
    const plainTimeMatch = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
    if (plainTimeMatch) {
      const [, h, m] = plainTimeMatch;
      return `${h}:${m}`;
    }

    // Otherwise, try to parse as a date/timestamp and format to HH:mm local time
    try {
      const date = new Date(trimmed);
      if (!isNaN(date.getTime())) {
        return format(date, 'HH:mm');
      }
    } catch {
      // ignore
    }
    return '';
  };

  return (
    <AppLayout>
      <div className="space-y-4 p-4">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 pb-3 border-b border-border/30">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold text-foreground">
            Timesheets
          </h1>
          <p className="text-muted-foreground text-sm">Track and manage your work hours</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex flex-wrap gap-2 items-center">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-2 bg-background/50 backdrop-blur-sm"
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "MMM dd, yyyy")
                    )
                  ) : (
                    "Pick a date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={handleDateRangeSelect}
                  numberOfMonths={2}
                  weekStartsOn={1}
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="border-2 bg-background/50 backdrop-blur-sm"
            >
              Today
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
              className="border-2 bg-background/50 backdrop-blur-sm"
            >
              ← Prev
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
              className="border-2 bg-background/50 backdrop-blur-sm"
            >
              Next →
            </Button>
          </div>
        </div>
        {hasShiftEntries && (
          <Alert className="border-primary/30 bg-primary/5 text-primary-foreground/90 dark:bg-primary/10 space-y-2">
            <Info className="h-4 w-4 text-primary dark:text-primary-300" />
            <AlertTitle>Shifts imported from approved schedules</AlertTitle>
            <AlertDescription>
              We pre-filled this week with hours from your published shift roster. Review and adjust any entry before
              submitting—manual edits are still allowed if your worked hours changed.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <Card className="border shadow-sm bg-card/50 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b pb-3">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-base font-semibold text-foreground">
              Week of {format(currentWeek, "MMM dd")} - {format(addDays(currentWeek, 6), "MMM dd, yyyy")}
            </span>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-md border border-primary/20">
              <span className="text-xs font-medium text-muted-foreground">Total:</span>
              <span className="text-xl font-bold text-primary">
                {(totalHours || 0).toFixed(1)}h
              </span>
            </div>
          </CardTitle>
        </CardHeader>
                        <CardContent className="p-3">
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="text-left p-2 font-semibold text-xs w-24 sticky left-0 bg-muted/50 backdrop-blur-sm z-10 border-r">Entry</th>
                                    {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const hasShift = shifts[dateStr];
                    const isHoliday = isDateHoliday(dateStr);
                    return (
                      <th key={dateStr} className={`text-center p-2 font-semibold text-xs min-w-[140px] border-r last:border-r-0 ${isToday(day) ? "bg-primary/10 ring-1 ring-primary/20" : ""}`}>
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs">{format(day, "EEE")}</span>
                            {hasShift && (
                              <CalendarIcon className="h-3 w-3 text-primary" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(day, "MMM dd")}
                          </div>
                          {isHoliday && (
                            <Badge variant="outline" className="mt-0.5 text-[10px] px-1 py-0 h-4 bg-green-100 text-green-700 border-green-300">
                              Holiday
                            </Badge>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center p-2 font-semibold text-xs w-20 bg-muted/20">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Calculate max entries across all days */}
                {(() => {
                  const maxEntries = Math.max(...weekDays.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (entries[dateStr] || []).length;
                  }), 1);

                  // Create rows for each entry index
                  return Array.from({ length: maxEntries }, (_, entryIndex) => {
                    // Check if this is the last row with any data
                    const hasAnyData = weekDays.some(day => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const dayEntries = entries[dateStr] || [];
                      return dayEntries[entryIndex];
                    });

                    if (!hasAnyData && entryIndex > 0) return null;

                    return (
                      <React.Fragment key={`entry-row-${entryIndex}`}>
                        {/* Clock In/Out row - only show for first entry */}
                        {entryIndex === 0 && (
                          <tr className="border-b bg-muted/10 hover:bg-muted/20 transition-colors">
                            <td className="p-1.5 font-medium text-xs sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r">
                              Clock In/Out
                            </td>
                            {weekDays.map((day) => {
                              const dateStr = format(day, "yyyy-MM-dd");
                              const dayEntries = entries[dateStr] || [];
                              const entry = dayEntries[0];
                              const isHoliday = isDateHoliday(dateStr);
                              
                              // Also check timesheetData state for clock times if entry doesn't have them
                              const matchingDataEntry = timesheetData?.entries?.find((e: any) => {
                                const entryDate = typeof e.work_date === 'string' && e.work_date.includes('T') 
                                  ? e.work_date.split('T')[0] 
                                  : String(e.work_date);
                                return entryDate === dateStr;
                              });
                              
                              if (isHoliday) {
                                return (
                                  <td key={dateStr} className={`p-1.5 align-top border-r text-center text-xs text-muted-foreground ${isToday(day) ? "bg-primary/5" : ""}`}>
                                    Holiday
                                  </td>
                                );
                              }
                              
                              // Prefer entry clock times, fallback to matchingDataEntry from backend
                              const rawClockIn = entry?.clock_in || entry?.manual_in || matchingDataEntry?.clock_in || null;
                              const rawClockOut = entry?.clock_out || entry?.manual_out || matchingDataEntry?.clock_out || null;
                              
                              const formattedIn = rawClockIn ? formatTime(rawClockIn) : '';
                              const formattedOut = rawClockOut ? formatTime(rawClockOut) : '';
                              
                              // Treat identical in/out times as "only clock in" to avoid showing 05:30–05:30 etc.
                              const clockIn = formattedIn || null;
                              const clockOut = formattedOut && formattedOut !== formattedIn ? formattedOut : null;
                              
                              if (!clockIn && !clockOut) {
                                return (
                                  <td key={dateStr} className={`p-1.5 align-top border-r text-center text-xs text-muted-foreground ${isToday(day) ? "bg-primary/5" : ""}`}>
                                    No clock in
                                  </td>
                                );
                              }
                              
                              return (
                                <td key={dateStr} className={`p-1.5 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}>
                                  <div className="flex flex-col gap-0.5 text-xs">
                                    {clockIn ? (
                                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                        <Clock className="h-3 w-3" />
                                        <span className="font-medium">In: {clockIn}</span>
                                      </div>
                                    ) : (
                                      <div className="text-muted-foreground">No clock in</div>
                                    )}
                                    {clockOut ? (
                                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                        <Clock className="h-3 w-3" />
                                        <span className="font-medium">Out: {clockOut}</span>
                                      </div>
                                    ) : clockIn ? (
                                      <div className="text-amber-600 dark:text-amber-400 text-xs">Still clocked in</div>
                                    ) : null}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="p-1.5 border-l bg-muted/20"></td>
                          </tr>
                        )}
                                                 {/* Hours row */}
                         <tr className="border-b hover:bg-muted/20 transition-colors">
                           <td className="p-1.5 font-semibold text-xs sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r">
                             {entryIndex === 0 ? "Hours" : ""}
                           </td>
                          {weekDays.map((day) => {
                            const dateStr = format(day, "yyyy-MM-dd");
                            const dayEntries = entries[dateStr] || [{ work_date: dateStr, hours: 0, description: "", project_id: null, project_type: null, is_holiday: false }];
                            const entry = dayEntries[entryIndex];
                            const isHoliday = isDateHoliday(dateStr);
                            const hasShift = shifts[dateStr];

                            if (!entry && entryIndex === 0) {
                              // Create empty entry for first row if missing
                              return (
                                                               <td key={dateStr} className={`p-1.5 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}>
                                   {hasShift && (
                                     <Badge variant="outline" className="mb-1 text-[10px] px-1 py-0 h-4 border">
                                       {shifts[dateStr].shift_type}
                                     </Badge>
                                   )}
                                                                     <Input
                                     type="number"
                                     step="0.5"
                                     min="0"
                                     max="24"
                                     value=""
                                     onChange={(e) => {
                                       // Add new entry
                                       addEntry(dateStr);
                                       // Update the new entry
                                       setTimeout(() => {
                                         const newEntries = entries[dateStr] || [];
                                         if (newEntries.length > 0) {
                                           updateEntry(dateStr, newEntries.length - 1, "hours", e.target.value);
                                         }
                                       }, 0);
                                     }}
                                    className="text-center border-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                                     disabled={!isEditable || (isHoliday && entry?.is_holiday)}
                                     placeholder="0"
                                   />
                                </td>
                              );
                            }

                                                         if (!entry) {
                               return (
                                 <td key={dateStr} className={`p-1.5 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}></td>
                               );
                             }

                             return (
                                                               <td key={dateStr} className={`p-1.5 align-top border-r ${isToday(day) ? "bg-primary/5" : ""} ${isHoliday && entry.is_holiday ? "bg-green-50/50 dark:bg-green-950/20" : ""}`}>
                                 {entryIndex === 0 && hasShift && (
                                   <Badge variant="outline" className="mb-1 text-[10px] px-1 py-0 h-4 border">
                                     {shifts[dateStr].shift_type}
                                   </Badge>
                                 )}
                                                                 <Input
                                   type="number"
                                   step="0.5"
                                   min="0"
                                   max="24"
                                   value={entry.hours || ""}
                                   onChange={(e) => updateEntry(dateStr, entryIndex, "hours", e.target.value)}
                                  className="text-center text-xs border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                                   disabled={!isEditable || (isHoliday && entry.is_holiday)}
                                   placeholder="0"
                                 />
                              </td>
                            );
                          })}
                                                     <td className="p-1.5 text-center font-semibold text-xs border-l bg-muted/20">
                             {entryIndex === 0 ? (totalHours || 0).toFixed(1) : ""}
                           </td>
                        </tr>

                                                 {/* Project/Task row */}
                         <tr className="border-b hover:bg-muted/20 transition-colors">
                           <td className="p-1.5 font-semibold text-xs sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r">
                             {entryIndex === 0 ? (
                               <div className="flex flex-col gap-1">
                                 <span>Project / Task</span>
                                 {isEditable && (
                                   <span className="text-xs text-muted-foreground font-normal">Click + to add entries</span>
                                 )}
                               </div>
                             ) : ""}
                           </td>
                          {weekDays.map((day) => {
                            const dateStr = format(day, "yyyy-MM-dd");
                            const dayEntries = entries[dateStr] || [{ work_date: dateStr, hours: 0, description: "", project_id: null, project_type: null, is_holiday: false }];
                            const entry = dayEntries[entryIndex];
                            const isHoliday = isDateHoliday(dateStr);
                            const isLastEntry = entryIndex === (dayEntries.length - 1);

                                                         if (!entry) {
                               return (
                                 <td key={dateStr} className={`p-3 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}></td>
                               );
                             }

                            // Determine current value for select
                            let currentValue = '';
                            if (isHoliday && entry.is_holiday) {
                              currentValue = 'holiday';
                            } else if (entry.project_id) {
                              currentValue = `project-${entry.project_id}`;
                            } else if (entry.project_type === 'non-billable') {
                              currentValue = 'non-billable';
                            } else if (entry.project_type === 'internal') {
                              currentValue = 'internal';
                            } else {
                              currentValue = '';
                            }

                            return (
                              <td key={dateStr} className={`p-2 align-top ${isToday(day) ? "bg-primary/10" : ""} ${isHoliday && entry.is_holiday ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                                                                 {isHoliday && entry.is_holiday ? (
                                   <Input
                                     type="text"
                                     value="Holiday"
                                     disabled
                                     className="text-green-700 dark:text-green-400 font-medium border-2 border-green-200 dark:border-green-800"
                                     readOnly
                                   />
                                 ) : (
                                   <div className="space-y-2">
                                     <Select
                                       value={currentValue}
                                       onValueChange={(value) => {
                                        if (value === 'holiday') return;

                                        if (value.startsWith('project-')) {
                                          const projectId = value.replace('project-', '');
                                          const project = assignedProjects.find(p => p.project_id === projectId);
                                          updateEntry(dateStr, entryIndex, "project_id", projectId);
                                          updateEntry(dateStr, entryIndex, "project_type", null);
                                          updateEntry(dateStr, entryIndex, "description", project?.project_name || '');
                                        } else if (value === 'non-billable') {
                                          updateEntry(dateStr, entryIndex, "project_id", null);
                                          updateEntry(dateStr, entryIndex, "project_type", 'non-billable');
                                          updateEntry(dateStr, entryIndex, "description", 'Non-billable project');
                                        } else if (value === 'internal') {
                                          updateEntry(dateStr, entryIndex, "project_id", null);
                                          updateEntry(dateStr, entryIndex, "project_type", 'internal');
                                          updateEntry(dateStr, entryIndex, "description", 'Internal project');
                                        } else {
                                          updateEntry(dateStr, entryIndex, "project_id", null);
                                          updateEntry(dateStr, entryIndex, "project_type", null);
                                          updateEntry(dateStr, entryIndex, "description", '');
                                        }
                                      }}
                                                                             disabled={!isEditable}
                                     >
                                       <SelectTrigger className="w-full border-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]">
                                         <SelectValue placeholder="Select project" />
                                       </SelectTrigger>
                                      <SelectContent>
                                        {assignedProjects.length > 0 && (
                                          <>
                                            {assignedProjects.map((proj) => (
                                              <SelectItem key={proj.project_id} value={`project-${proj.project_id}`}>
                                                {proj.project_name}
                                              </SelectItem>
                                            ))}
                                            <div className="border-t my-1" />
                                          </>
                                        )}
                                        <SelectItem value="non-billable">Non-billable project</SelectItem>
                                        <SelectItem value="internal">Internal project</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {/* Add/Remove buttons */}
                                    {isEditable && (
                                      <div className="flex items-center gap-2 mt-2">
                                        {isLastEntry && (
                                          <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => addEntry(dateStr)}
                                            title="Add another entry for this day"
                                          >
                                            <Plus className="h-4 w-4 mr-1" />
                                            <span className="text-xs font-medium">Add Entry</span>
                                          </Button>
                                        )}
                                        {dayEntries.length > 1 && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-3"
                                            onClick={() => removeEntry(dateStr, entryIndex)}
                                            title="Remove this entry"
                                          >
                                            <Trash2 className="h-4 w-4 mr-1" />
                                            <span className="text-xs font-medium">Remove</span>
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                                                     <td className="p-3 border-l bg-muted/20"></td>
                        </tr>
                      </React.Fragment>
                    );
                  });
                })()}

                                 {/* Day totals row */}
                 <tr className="border-t bg-muted/20 font-semibold">
                   <td className="p-2 text-right sticky left-0 bg-muted/50 backdrop-blur-sm z-10 border-r font-semibold text-xs">Day Total</td>
                   {weekDays.map((day) => {
                     const dateStr = format(day, "yyyy-MM-dd");
                     const dayEntries = entries[dateStr] || [];
                     const dayTotal = dayEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                     return (
                       <td key={dateStr} className="p-2 text-center text-sm border-r bg-background/50">
                         {dayTotal.toFixed(1)}
                       </td>
                     );
                   })}
                   <td className="p-2 text-center text-sm bg-primary/10 font-semibold text-primary">
                     {(totalHours || 0).toFixed(1)}
                   </td>
                 </tr>
              </tbody>
            </table>
          </div>

                     {isEditable && (
             <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-border/30">
               <Button 
                 onClick={saveTimesheet} 
                 disabled={loading}
                 variant="default"
                 size="lg"
                 className="px-6 py-2.5 text-base font-semibold"
               >
                 <Save className="h-5 w-5 mr-2" />
                 {loading ? "Saving..." : "Save Draft"}
               </Button>
               {timesheet?.id && timesheet.status !== 'pending_approval' && timesheet.status !== 'approved' && (
                 <Button 
                   onClick={handleSubmit} 
                   disabled={submitting || loading || !timesheet.id}
                   className="px-6 py-2.5 text-base font-semibold border-2 bg-primary hover:bg-primary/90"
                   size="lg"
                 >
                   <Send className="h-5 w-5 mr-2" />
                   {submitting ? "Submitting..." : "Submit for Approval"}
                 </Button>
               )}
             </div>
           )}
           
           {timesheet?.status === "pending_approval" && (
             <div className="mt-6 p-5 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-700 rounded-xl space-y-4 backdrop-blur-sm">
               <div>
                 <p className="font-bold text-lg text-blue-900 dark:text-blue-200">Timesheet Submitted</p>
                 <p className="text-base mt-1 text-blue-800 dark:text-blue-300">Your timesheet has been submitted and is awaiting approval from your manager.</p>
               </div>
             </div>
           )}
        </CardContent>
      </Card>

      {/* Holiday Calendar */}
      <Card className="border-2 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b-2 pb-4">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <span className="flex items-center gap-3 text-xl font-bold">
              <CalendarIcon className="h-6 w-6 text-primary" />
              Holiday Calendar ({new Date().getFullYear()})
            </span>
                        <Select value={selectedState || 'all'} onValueChange={(v) => setSelectedState(v)}>
              <SelectTrigger className="w-[200px] border-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]">
                 <SelectValue placeholder="Select State" />
               </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {holidayCalendar.holidaysByState && Object.keys(holidayCalendar.holidaysByState).length > 0 ? (
            <div className="space-y-4">
              {(selectedState === 'all' ? Object.keys(holidayCalendar.holidaysByState) : [selectedState]).map(state => {
                const stateHolidays = holidayCalendar.holidaysByState[state] || [];
                if (stateHolidays.length === 0) return null;
                return (
                                                   <div key={state} className="border-2 rounded-xl p-5 bg-card/30 backdrop-blur-sm">
                     <h3 className="font-bold text-xl mb-4 text-foreground">{state} ({stateHolidays.length} holidays)</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                       {stateHolidays.map((holiday: any) => {
                         const holidayDate = new Date(holiday.date);
                         const isInCurrentWeek = weekDays.some(d => isSameDay(d, holidayDate));
                         return (
                           <div
                             key={holiday.id}
                             className={`p-3 rounded-lg border-2 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                               isInCurrentWeek ? 'bg-primary/15 border-primary ring-2 ring-primary/30' : 'border-border/50'
                             }`}
                           >
                            <div className="font-medium">{holiday.name}</div>
                            <div className="text-muted-foreground text-xs mt-1">
                              {format(holidayDate, 'MMM dd, yyyy (EEE)')}
                            </div>
                            {holiday.is_national && (
                              <Badge variant="outline" className="mt-1 text-xs">National</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No holidays available for the selected state</p>
              <p className="text-sm mt-2">Contact HR to add holiday lists for your state</p>
            </div>
          )}
        </CardContent>
      </Card>

      </div>
    </AppLayout>
  );
}