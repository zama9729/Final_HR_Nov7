import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Save, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";

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

export default function Timesheets() {
  const [currentWeek, setCurrentWeek] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<Record<string, TimesheetEntry>>({});
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));

  useEffect(() => {
    fetchTimesheet();
  }, [currentWeek, user]);

  const fetchTimesheet = async () => {
    if (!user) return;

    try {
      const { data: employeeData } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!employeeData) return;

      const weekStart = format(currentWeek, "yyyy-MM-dd");
      const weekEnd = format(addDays(currentWeek, 6), "yyyy-MM-dd");

      // Fetch existing timesheet
      const { data: timesheetData } = await supabase
        .from("timesheets")
        .select(`
          *,
          timesheet_entries(*)
        `)
        .eq("employee_id", employeeData.id)
        .eq("week_start_date", weekStart)
        .single();

      if (timesheetData) {
        setTimesheet(timesheetData as any);
        
        // Map entries by date
        const entriesMap: Record<string, TimesheetEntry> = {};
        (timesheetData as any).timesheet_entries?.forEach((entry: any) => {
          entriesMap[entry.work_date] = entry;
        });
        setEntries(entriesMap);
      } else {
        // Initialize empty entries
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
        setTimesheet(null);
      }
    } catch (error) {
      console.error("Error fetching timesheet:", error);
    }
  };

  const updateEntry = (date: string, field: "hours" | "description", value: string | number) => {
    setEntries((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [field]: field === "hours" ? parseFloat(value as string) || 0 : value,
      },
    }));
  };

  const calculateTotal = () => {
    return Object.values(entries).reduce((sum, entry) => sum + (entry.hours || 0), 0);
  };

  const saveTimesheet = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: employeeData } = await supabase
        .from("employees")
        .select("id, tenant_id")
        .eq("user_id", user.id)
        .single();

      if (!employeeData) throw new Error("Employee not found");

      const weekStart = format(currentWeek, "yyyy-MM-dd");
      const weekEnd = format(addDays(currentWeek, 6), "yyyy-MM-dd");
      const totalHours = calculateTotal();

      // Upsert timesheet
      const { data: timesheetData, error: timesheetError } = await supabase
        .from("timesheets")
        .upsert({
          id: timesheet?.id,
          employee_id: employeeData.id,
          tenant_id: employeeData.tenant_id,
          week_start_date: weekStart,
          week_end_date: weekEnd,
          total_hours: totalHours,
          status: "pending",
        })
        .select()
        .single();

      if (timesheetError) throw timesheetError;

      // Delete existing entries
      if (timesheet?.id) {
        await supabase
          .from("timesheet_entries")
          .delete()
          .eq("timesheet_id", timesheet.id);
      }

      // Insert new entries
      const entriesToInsert = Object.values(entries)
        .filter((entry) => entry.hours > 0)
        .map((entry) => ({
          timesheet_id: timesheetData.id,
          tenant_id: employeeData.tenant_id,
          work_date: entry.work_date,
          hours: entry.hours,
          description: entry.description || "",
        }));

      if (entriesToInsert.length > 0) {
        const { error: entriesError } = await supabase
          .from("timesheet_entries")
          .insert(entriesToInsert);

        if (entriesError) throw entriesError;
      }

      toast({
        title: "Success",
        description: "Timesheet saved successfully",
      });

      fetchTimesheet();
    } catch (error) {
      console.error("Error saving timesheet:", error);
      toast({
        title: "Error",
        description: "Failed to save timesheet",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  const isEditable = !timesheet || timesheet.status === "pending";

  return (
    <div className="container mx-auto p-6 space-y-6">
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
            onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
          >
            Previous Week
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
          >
            Next Week
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
              {calculateTotal().toFixed(1)} hrs
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold w-32">Day</th>
                  {weekDays.map((day) => (
                    <th
                      key={day.toISOString()}
                      className={`text-center p-3 font-semibold min-w-[120px] ${
                        isToday(day) ? "bg-primary/10" : ""
                      }`}
                    >
                      <div>{format(day, "EEE")}</div>
                      <div className="text-sm font-normal text-muted-foreground">
                        {format(day, "MMM dd")}
                      </div>
                    </th>
                  ))}
                  <th className="text-center p-3 font-semibold w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3 font-medium">Hours</td>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const entry = entries[dateStr] || { hours: 0, description: "" };
                    return (
                      <td
                        key={dateStr}
                        className={`p-2 ${isToday(day) ? "bg-primary/10" : ""}`}
                      >
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={entry.hours || ""}
                          onChange={(e) => updateEntry(dateStr, "hours", e.target.value)}
                          className="text-center"
                          disabled={!isEditable}
                          placeholder="0"
                        />
                      </td>
                    );
                  })}
                  <td className="p-3 text-center font-bold text-lg">
                    {calculateTotal().toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td className="p-3 font-medium">Description</td>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const entry = entries[dateStr] || { hours: 0, description: "" };
                    return (
                      <td
                        key={dateStr}
                        className={`p-2 ${isToday(day) ? "bg-primary/10" : ""}`}
                      >
                        <Input
                          type="text"
                          value={entry.description || ""}
                          onChange={(e) => updateEntry(dateStr, "description", e.target.value)}
                          placeholder="Task details"
                          disabled={!isEditable}
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
    </div>
  );
}