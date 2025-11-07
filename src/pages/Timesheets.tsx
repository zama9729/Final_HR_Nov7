import React, { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Clock, Save, Check, X, Calendar as CalendarIcon, RotateCcw, Plus, Trash2, CheckCircle2, XCircle, Hourglass } from "lucide-react";
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
}

interface Timesheet {
  id?: string;
  week_start_date: string;
  week_end_date: string;
  total_hours: number;
  status: string;
  rejection_reason?: string;
  entries: TimesheetEntry[];
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
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayCalendar, setHolidayCalendar] = useState<any>({});
  const [selectedState, setSelectedState] = useState<string>('all');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeState, setEmployeeState] = useState<string>('');
  const [assignedProjects, setAssignedProjects] = useState<Array<{id: string; project_id: string; project_name: string}>>([]);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenComment, setReopenComment] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfWeek(new Date(), { weekStartsOn: 1 }),
    to: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 6),
  });
  const { user } = useAuth();
  const { toast } = useToast();

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
        const resp = await fetch(
          `${import.meta.env.VITE_API_URL}/api/employees/${empId.id}`,
          { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
        );
        if (resp.ok) {
          const data = await resp.json();
          setEmployeeState(data.state || '');
          if (!selectedState || selectedState === 'all') {
            setSelectedState(data.state || 'all');
          }
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
    // 1. Check entry.is_holiday flag
    const entry = entries[dateStr];
    if (entry?.is_holiday) return true;
    
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
      
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/holidays/employee/${employeeId}?${params}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      
      if (resp.ok) {
        const data = await resp.json();
        // Normalize dates when setting holidays
        const normalizedHolidays = (data.holidays || []).map((h: any) => ({
          ...h,
          date: normalizeDate(h.date)
        })).filter((h: any) => h.date);
        setHolidays(normalizedHolidays);
      }
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
      
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/api/holidays/calendar?${params}`,
        { headers: { Authorization: `Bearer ${api.token || localStorage.getItem('auth_token')}` } }
      );
      
      if (resp.ok) {
        const data = await resp.json();
        setHolidayCalendar(data);
        if (data.states && data.states.length > 0) {
          setAvailableStates(data.states);
        }
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
              };
            } else if (!isHoliday && entry.is_holiday) {
              // Convert from holiday entry to regular entry
              return {
                ...entry,
                is_holiday: false,
                description: entry.description === "Holiday" ? "" : entry.description,
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

      // Fetch existing timesheet (this now returns holidays even if timesheet doesn't exist)
      const timesheetData = await api.getTimesheet(weekStart, weekEnd);

      // Map entries by date - group multiple entries per day
      const entriesMap: Record<string, TimesheetEntry[]> = {};
      
      // First, process existing timesheet entries if any
      if (timesheetData?.entries && Array.isArray(timesheetData.entries)) {
        timesheetData.entries.forEach((entry: any) => {
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
            is_holiday: entry.is_holiday || false, // Ensure this is set
          });
        });
      }
      
      // Set holiday calendar and inject holidays into entries
      // Normalize holidays from timesheetData
      if (timesheetData?.holidayCalendar && Array.isArray(timesheetData.holidayCalendar)) {
        const normalizedHolidays = timesheetData.holidayCalendar.map((h: any) => ({
          ...h,
          date: normalizeDate(h.date)
        })).filter((h: any) => h.date);
        setHolidays(normalizedHolidays);
      }
      
      // Get all holidays for the current week from all sources
      const getAllHolidaysForWeek = (): Record<string, any> => {
        const holidayMap: Record<string, any> = {};
        
        // From timesheet holidayCalendar
        if (timesheetData?.holidayCalendar && Array.isArray(timesheetData.holidayCalendar)) {
          timesheetData.holidayCalendar.forEach((h: any) => {
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
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        
        // If holiday exists for this date, ensure at least one holiday entry
        if (allHolidays[dateStr]) {
          if (!entriesMap[dateStr] || entriesMap[dateStr].length === 0) {
            entriesMap[dateStr] = [{
              work_date: dateStr,
              hours: 0,
              description: "Holiday",
              is_holiday: true,
              project_id: null,
              project_type: null,
            }];
          } else {
            // Update first entry to holiday if not already
            if (!entriesMap[dateStr][0]?.is_holiday) {
              entriesMap[dateStr][0] = {
                ...entriesMap[dateStr][0],
                is_holiday: true,
                description: "Holiday",
                project_id: null,
                project_type: null,
              };
            }
          }
        } else if (!entriesMap[dateStr] || entriesMap[dateStr].length === 0) {
          // Create empty entry if it doesn't exist
          entriesMap[dateStr] = [{
            work_date: dateStr,
            hours: 0,
            description: "",
            project_id: null,
            project_type: null,
            is_holiday: false,
          }];
        } else {
          // Ensure existing entries have project_id and project_type
          entriesMap[dateStr] = entriesMap[dateStr].map(entry => ({
            ...entry,
            is_holiday: entry.is_holiday || false,
            project_id: entry.project_id || null,
            project_type: entry.project_type || null,
          }));
        }
      });
      
      setEntries(entriesMap);
      
      // Set timesheet data if it exists
      if (timesheetData && timesheetData.id) {
        setTimesheet(timesheetData as any);
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
        }];
      });
      setEntries(emptyEntries);
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
                }];
              } else {
                // Update first entry
                updatedEntries[date] = [{
                  ...dayEntries[0],
                  hours: hours,
                  description: `Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})${shift.notes ? ` - ${shift.notes}` : ''}`,
                }];
              }
            } else {
              // Add shift info to description if already has hours
              const existingDesc = dayEntries[0]?.description || '';
              if (!existingDesc.includes('Shift:')) {
                updatedEntries[date] = [{
                  ...dayEntries[0],
                  description: `${existingDesc} | Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})`.trim(),
                }, ...dayEntries.slice(1)];
              }
            }
          });
          
          return updatedEntries;
        });
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
          // Skip holiday entries and entries with no hours
          if (entry.is_holiday || !entry || (Number(entry.hours) || 0) <= 0) {
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
          });
        });
      });

      // Final validation - ensure all entries have valid work_date and skip holiday entries
      const entriesToSave = entriesArray.filter((entry) => {
        // Skip holiday entries - they're auto-managed by backend
        if (entry.is_holiday) {
          return false;
        }
        const isValid = entry && entry.work_date && entry.work_date.trim() !== '' && entry.hours > 0;
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
      const timesheetData = await api.saveTimesheet(weekStart, weekEnd, hoursToSave, entriesToSave);

      if (timesheetData) {
        setTimesheet(timesheetData as any);
        
        // Map entries by date - group multiple entries per day
        const entriesMap: Record<string, TimesheetEntry[]> = {};
        (timesheetData as any).entries?.forEach((entry: any) => {
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

  const handleReopen = () => {
    if (!timesheet) return;
    setReopenComment("");
    setReopenDialogOpen(true);
  };

  const confirmReopen = async () => {
    if (!timesheet || !reopenComment.trim()) {
      toast({
        title: "Error",
        description: "Please provide a comment for reopening",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      // Call API to reopen the timesheet
      await api.approveTimesheet(timesheet.id!, 'return', reopenComment.trim());
      setReopenDialogOpen(false);
      setReopenComment("");
      await fetchTimesheet();
      toast({
        title: "Success",
        description: "Timesheet reopened successfully. You can now edit and resubmit.",
      });
    } catch (error: any) {
      console.error("Error reopening timesheet:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reopen timesheet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isEditable = !timesheet || timesheet.status === "pending";

  return (
    <AppLayout>
      <div className="space-y-8 p-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 pb-6 border-b border-border/40">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Timesheets
          </h1>
          <p className="text-muted-foreground text-lg">Track and manage your work hours for the week</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {timesheet?.status && (
            <div className={`px-5 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 shadow-lg border-2 backdrop-blur-sm ${
              timesheet.status === "approved" 
                ? "bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border-green-300 dark:from-green-950/40 dark:to-emerald-950/40 dark:text-green-400 dark:border-green-700"
                : timesheet.status === "rejected"
                ? "bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border-red-300 dark:from-red-950/40 dark:to-rose-950/40 dark:text-red-400 dark:border-red-700"
                : "bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 border-amber-300 dark:from-amber-950/40 dark:to-yellow-950/40 dark:text-amber-400 dark:border-amber-700"
            }`}>
              {timesheet.status === "approved" && (
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              )}
              {timesheet.status === "rejected" && (
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              )}
              {timesheet.status === "pending" && (
                <Hourglass className="h-6 w-6 text-amber-600 dark:text-amber-400 animate-pulse" />
              )}
              <span className="text-base">
                {timesheet.status.charAt(0).toUpperCase() + timesheet.status.slice(1)}
              </span>
            </div>
          )}
          
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
      </div>

      <Card className="border-2 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b-2 pb-4">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <span className="text-xl font-bold text-foreground">
              Week of {format(currentWeek, "MMM dd")} - {format(addDays(currentWeek, 6), "MMM dd, yyyy")}
            </span>
            <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
              <span className="text-sm font-medium text-muted-foreground">Total Hours:</span>
              <span className="text-3xl font-bold text-primary">
                {(totalHours || 0).toFixed(1)} hrs
              </span>
            </div>
          </CardTitle>
        </CardHeader>
                        <CardContent className="p-6">
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 bg-muted/30">
                  <th className="text-left p-4 font-bold w-32 sticky left-0 bg-muted/50 backdrop-blur-sm z-10 border-r">Entry</th>
                                    {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const hasShift = shifts[dateStr];
                    const isHoliday = isDateHoliday(dateStr);
                    return (
                      <th key={dateStr} className={`text-center p-4 font-bold min-w-[180px] border-r last:border-r-0 ${isToday(day) ? "bg-primary/15 ring-2 ring-primary/30" : ""}`}>
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{format(day, "EEE")}</span>
                            {hasShift && (
                              <CalendarIcon className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="text-sm font-medium text-muted-foreground">
                            {format(day, "MMM dd")}
                          </div>
                          {isHoliday && (
                            <Badge variant="outline" className="mt-1 text-xs bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700">
                              <CalendarIcon className="h-3 w-3 mr-1" />
                              Holiday
                            </Badge>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center p-4 font-bold w-28 bg-muted/30">Total</th>
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
                                                 {/* Hours row */}
                         <tr className="border-b hover:bg-muted/20 transition-colors">
                           <td className="p-3 font-bold sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r">
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
                                                               <td key={dateStr} className={`p-3 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}>
                                   {hasShift && (
                                     <Badge variant="outline" className="mb-2 text-xs border-2">
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
                                     className="text-center border-2 transition-all duration-200 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                                     disabled={!isEditable || (isHoliday && entry?.is_holiday)}
                                     placeholder="0"
                                   />
                                </td>
                              );
                            }

                                                         if (!entry) {
                               return (
                                 <td key={dateStr} className={`p-3 align-top border-r ${isToday(day) ? "bg-primary/5" : ""}`}></td>
                               );
                             }

                             return (
                                                               <td key={dateStr} className={`p-3 align-top border-r ${isToday(day) ? "bg-primary/5" : ""} ${isHoliday && entry.is_holiday ? "bg-green-50/50 dark:bg-green-950/20" : ""}`}>
                                 {entryIndex === 0 && hasShift && (
                                   <Badge variant="outline" className="mb-2 text-xs border-2">
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
                                   className="text-center border-2 transition-all duration-200 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                                   disabled={!isEditable || (isHoliday && entry.is_holiday)}
                                   placeholder="0"
                                 />
                              </td>
                            );
                          })}
                                                     <td className="p-3 text-center font-bold border-l bg-muted/20">
                             {entryIndex === 0 ? (totalHours || 0).toFixed(1) : ""}
                           </td>
                        </tr>

                                                 {/* Project/Task row */}
                         <tr className="border-b hover:bg-muted/20 transition-colors">
                           <td className="p-3 font-bold sticky left-0 bg-background/95 backdrop-blur-sm z-10 border-r">
                             {entryIndex === 0 ? "Project / Task" : ""}
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
                                       <SelectTrigger className="w-full border-2 transition-all duration-200 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]">
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
                                      <div className="flex items-center gap-1">
                                        {isLastEntry && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0"
                                            onClick={() => addEntry(dateStr)}
                                            title="Add another entry for this day"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                        {dayEntries.length > 1 && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                            onClick={() => removeEntry(dateStr, entryIndex)}
                                            title="Remove this entry"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
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
                 <tr className="border-t-2 bg-muted/20 font-bold">
                   <td className="p-4 text-right sticky left-0 bg-muted/50 backdrop-blur-sm z-10 border-r font-bold">Day Total</td>
                   {weekDays.map((day) => {
                     const dateStr = format(day, "yyyy-MM-dd");
                     const dayEntries = entries[dateStr] || [];
                     const dayTotal = dayEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                     return (
                       <td key={dateStr} className="p-4 text-center text-xl border-r bg-background/50">
                         {dayTotal.toFixed(1)}
                       </td>
                     );
                   })}
                   <td className="p-4 text-center text-xl bg-primary/10 font-bold text-primary">
                     {(totalHours || 0).toFixed(1)}
                   </td>
                 </tr>
              </tbody>
            </table>
          </div>

                     {isEditable && (
             <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border/40">
               <Button 
                 onClick={saveTimesheet} 
                 disabled={loading}
                 className="px-6 py-2.5 text-base font-semibold border-2"
                 size="lg"
               >
                 <Save className="h-5 w-5 mr-2" />
                 {loading ? "Saving..." : "Save Timesheet"}
               </Button>
             </div>
           )}

                     {timesheet?.status === "rejected" && (
             <div className="mt-6 p-5 bg-destructive/10 border-2 border-destructive/30 rounded-xl space-y-4 backdrop-blur-sm">
               <div>
                 <p className="font-bold text-lg text-destructive mb-2">Rejection Reason:</p>
                 <p className="text-base mt-1 text-destructive/90">{timesheet.rejection_reason}</p>
               </div>
               <Button onClick={handleReopen} variant="outline" size="sm" className="border-2">
                 <RotateCcw className="h-4 w-4 mr-2" />
                 Reopen for Editing
               </Button>
             </div>
           )}

           {timesheet?.status === "approved" && (
             <div className="mt-6 p-5 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-700 rounded-xl space-y-4 backdrop-blur-sm">
               <div>
                 <p className="font-bold text-lg text-blue-900 dark:text-blue-200">Timesheet Approved</p>
                 <p className="text-base mt-1 text-blue-800 dark:text-blue-300">This timesheet has been approved by your manager.</p>
               </div>
               <Button onClick={handleReopen} variant="outline" size="sm" className="border-2">
                 <RotateCcw className="h-4 w-4 mr-2" />
                 Request to Edit
               </Button>
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
               <SelectTrigger className="w-[200px] border-2 transition-all duration-200 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] focus:ring-2 focus:ring-blue-500/70 focus:shadow-[0_0_20px_rgba(59,130,246,0.4)]">
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
                             className={`p-3 rounded-lg border-2 text-sm transition-all duration-200 hover:ring-2 hover:ring-blue-500/50 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] ${
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

      {/* Reopen Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Timesheet</DialogTitle>
            <DialogDescription>
              Provide a comment explaining why you're reopening this timesheet for editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="reopen-comment">Comment</Label>
              <Textarea
                id="reopen-comment"
                placeholder="Enter your comment..."
                value={reopenComment}
                onChange={(e) => setReopenComment(e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmReopen} disabled={!reopenComment.trim() || loading}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {loading ? "Reopening..." : "Reopen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AppLayout>
  );
}