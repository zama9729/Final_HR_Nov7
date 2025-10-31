import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Clock, Save, Check, X, Calendar as CalendarIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface TimesheetEntry {
  id?: string;
  work_date: string;
  hours: number;
  description: string;
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
  const [entries, setEntries] = useState<Record<string, TimesheetEntry>>({});
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidayCalendar, setHolidayCalendar] = useState<any>({});
  const [selectedState, setSelectedState] = useState<string>('all');
  const [availableStates, setAvailableStates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [employeeState, setEmployeeState] = useState<string>('');
  const { user } = useAuth();
  const { toast } = useToast();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

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
      }
    } catch (error) {
      console.error('Error fetching employee info:', error);
    }
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
        setHolidays(data.holidays || []);
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

  useEffect(() => {
    if (employeeId) {
      fetchHolidays();
    }
  }, [employeeId, selectedState, currentWeek]);

  useEffect(() => {
    fetchHolidayCalendar();
  }, [selectedState]);

  // Ensure entries are initialized
  useEffect(() => {
    if (Object.keys(entries).length === 0 && weekDays.length > 0) {
      const emptyEntries: Record<string, TimesheetEntry> = {};
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        emptyEntries[dateStr] = {
          work_date: dateStr,
          hours: 0,
          description: "",
        };
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

      // Map entries by date (including holidays)
      const entriesMap: Record<string, TimesheetEntry> = {};
      
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
          // Use the date as the key and ensure work_date is set on the entry
          entriesMap[workDate] = {
            ...entry,
            work_date: workDate,
          };
        });
      }
      
      // Set holiday calendar and inject holidays into entries
      const holidayMap: Record<string, any> = {};
      if (timesheetData?.holidayCalendar && Array.isArray(timesheetData.holidayCalendar)) {
        setHolidays(timesheetData.holidayCalendar);
        timesheetData.holidayCalendar.forEach((h: any) => {
          const holidayDate = String(h.date).split('T')[0]; // Ensure YYYY-MM-DD format
          holidayMap[holidayDate] = h;
        });
      }
      
      // Initialize all week days with entries (including holidays)
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        // If holiday exists for this date, create/update holiday entry
        if (holidayMap[dateStr]) {
          entriesMap[dateStr] = {
            ...(entriesMap[dateStr] || {}),
            work_date: dateStr,
            hours: 0,
            description: "Holiday",
            is_holiday: true,
          };
        } else if (!entriesMap[dateStr]) {
          // Create empty entry if it doesn't exist
          entriesMap[dateStr] = {
            work_date: dateStr,
            hours: 0,
            description: "",
          };
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
      const emptyEntries: Record<string, TimesheetEntry> = {};
      weekDays.forEach((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        emptyEntries[dateStr] = {
          work_date: dateStr,
          hours: 0,
          description: "",
        };
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
            if (updatedEntries[date]) {
              // Calculate hours from shift times
              const startTime = parseFloat(shift.start_time.replace(':', '.'));
              let endTime = parseFloat(shift.end_time.replace(':', '.'));
              
              // Handle overnight shifts
              if (endTime < startTime) {
                endTime += 24;
              }
              
              const hours = endTime - startTime;
              
              // Auto-fill if no manual entry exists or hours are 0
              if (!updatedEntries[date].hours || updatedEntries[date].hours === 0) {
                updatedEntries[date] = {
                  ...updatedEntries[date],
                  hours,
                  description: `Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})${shift.notes ? ` - ${shift.notes}` : ''}`,
                };
              } else {
                // Add shift info to description if already has hours
                const existingDesc = updatedEntries[date].description || '';
                if (!existingDesc.includes('Shift:')) {
                  updatedEntries[date] = {
                    ...updatedEntries[date],
                    description: `${existingDesc} | Shift: ${shift.shift_type} (${shift.start_time} - ${shift.end_time})`.trim(),
                  };
                }
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

  const updateEntry = (date: string, field: "hours" | "description", value: string | number) => {
    setEntries((prev) => ({
      ...prev,
      [date]: {
        work_date: date, // Always ensure work_date is set
        ...prev[date],
        [field]: field === "hours" ? parseFloat(value as string) || 0 : value,
      },
    }));
  };

  const calculateTotal = (): number => {
    try {
      if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
        return 0;
      }
      const total = Object.values(entries).reduce((sum, entry) => {
        if (!entry || typeof entry !== 'object') return sum;
        let hours = 0;
        if (typeof entry.hours === 'number') {
          hours = entry.hours;
        } else if (typeof entry.hours === 'string') {
          hours = parseFloat(entry.hours) || 0;
        } else {
          hours = 0;
        }
        return sum + hours;
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

      // Prepare entries - ensure all required fields are present
      // Convert entries object to array, using the key as work_date if missing
      const entriesArray = Object.keys(entries)
        .filter((dateKey) => {
          const entry = entries[dateKey];
          // Only include entries that have hours > 0
          return entry && (Number(entry.hours) || 0) > 0;
        })
        .map((dateKey) => {
          const entry = entries[dateKey];
          
          // ALWAYS use dateKey as the primary source for work_date (it's the key in the entries object)
          // dateKey should be in YYYY-MM-DD format
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
          
          return {
            work_date: workDate, // ALWAYS set work_date
            hours: Number(entry?.hours) || 0,
            description: String(entry?.description || ''),
          };
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
        
        // Map entries by date
        const entriesMap: Record<string, TimesheetEntry> = {};
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
          // Use the date as the key and ensure work_date is set on the entry
          entriesMap[workDate] = {
            ...entry,
            work_date: workDate,
          };
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

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isEditable = !timesheet || timesheet.status === "pending";

  return (
    <AppLayout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Timesheets</h1>
          <p className="text-muted-foreground">Track your work hours for the week</p>
        </div>
        <div className="flex gap-2 items-center">
          {timesheet?.status && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              timesheet.status === "approved" 
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : timesheet.status === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}>
              {timesheet.status === "approved" && <Check className="inline h-4 w-4 mr-1" />}
              {timesheet.status === "rejected" && <X className="inline h-4 w-4 mr-1" />}
              {timesheet.status === "pending" && <Clock className="inline h-4 w-4 mr-1" />}
              {timesheet.status.charAt(0).toUpperCase() + timesheet.status.slice(1)}
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
          >
            ← Prev
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-[200px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(currentWeek, "MMM dd")} - {format(addDays(currentWeek, 6), "MMM dd, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={currentWeek}
                onSelect={(date) => {
                  if (date) {
                    setCurrentWeek(startOfWeek(date, { weekStartsOn: 1 }));
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
          >
            Next →
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              Week of {format(currentWeek, "MMM dd")} - {format(addDays(currentWeek, 6), "MMM dd, yyyy")}
            </span>
            <span className="text-2xl font-bold">
              {(totalHours || 0).toFixed(1)} hrs
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold w-32">Day</th>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const hasShift = shifts[dateStr];
                    return (
                      <th
                        key={day.toISOString()}
                        className={`text-center p-3 font-semibold min-w-[120px] ${
                          isToday(day) ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {format(day, "EEE")}
                          {hasShift && (
                            <Calendar className="h-3 w-3 text-primary" title="Scheduled shift" />
                          )}
                        </div>
                        <div className="text-sm font-normal text-muted-foreground">
                          {format(day, "MMM dd")}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center p-3 font-semibold w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3 font-medium">Hours</td>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const entry = entries[dateStr] || { work_date: dateStr, hours: 0, description: "" };
                    const hasShift = shifts[dateStr];
                    const isHoliday = entry.is_holiday || holidays.some(h => h.date === dateStr);
                    const holidayName = holidays.find(h => h.date === dateStr)?.name;
                    return (
                      <td
                        key={dateStr}
                        className={`p-2 ${isToday(day) ? "bg-primary/10" : ""} ${hasShift ? "relative" : ""} ${isHoliday ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                      >
                        {hasShift && (
                          <Badge variant="outline" className="absolute -top-2 -right-1 text-xs">
                            {shifts[dateStr].shift_type}
                          </Badge>
                        )}
                        {isHoliday && (
                          <Badge variant="outline" className="mb-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <Calendar className="h-3 w-3 mr-1" />
                            Holiday
                          </Badge>
                        )}
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={entry.hours || ""}
                          onChange={(e) => updateEntry(dateStr, "hours", e.target.value)}
                          className="text-center"
                          disabled={!isEditable || isHoliday}
                          placeholder="0"
                        />
                      </td>
                    );
                  })}
                  <td className="p-3 text-center font-bold text-lg">
                    {(totalHours || 0).toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Description</td>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const entry = entries[dateStr] || { work_date: dateStr, hours: 0, description: "" };
                    const isHoliday = entry.is_holiday || holidays.some(h => h.date === dateStr);
                    const holidayName = holidays.find(h => h.date === dateStr)?.name;
                    return (
                      <td
                        key={dateStr}
                        className={`p-2 ${isToday(day) ? "bg-primary/10" : ""} ${isHoliday ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                      >
                        <Input
                          type="text"
                          value={isHoliday ? "Holiday" : (entry.description || "")}
                          onChange={(e) => {
                            if (!isHoliday) {
                              updateEntry(dateStr, "description", e.target.value);
                            }
                          }}
                          placeholder="Task details"
                          disabled={!isEditable || isHoliday}
                          className={isHoliday ? "text-green-700 dark:text-green-400 font-medium" : ""}
                          readOnly={isHoliday}
                        />
                      </td>
                    );
                  })}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {isEditable && (
            <div className="flex justify-end gap-2 mt-6">
              <Button onClick={saveTimesheet} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Saving..." : "Save Timesheet"}
              </Button>
            </div>
          )}

          {timesheet?.status === "rejected" && timesheet.rejection_reason && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="font-semibold text-destructive">Rejection Reason:</p>
              <p className="text-sm mt-1">{timesheet.rejection_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holiday Calendar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Holiday Calendar ({new Date().getFullYear()})
            </span>
            <Select value={selectedState || 'all'} onValueChange={(v) => setSelectedState(v)}>
              <SelectTrigger className="w-[180px]">
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
                  <div key={state} className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-3">{state} ({stateHolidays.length} holidays)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {stateHolidays.map((holiday: any) => {
                        const holidayDate = new Date(holiday.date);
                        const isInCurrentWeek = weekDays.some(d => isSameDay(d, holidayDate));
                        return (
                          <div
                            key={holiday.id}
                            className={`p-2 rounded border text-sm ${
                              isInCurrentWeek ? 'bg-primary/10 border-primary' : ''
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
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
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