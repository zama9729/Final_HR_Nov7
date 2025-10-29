import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Plus, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Employee {
  id: string;
  user_id: string;
  employee_id: string;
  profiles: {
    first_name: string;
    last_name: string;
  };
}

interface Shift {
  id: string;
  employee_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  status: string;
  notes?: string;
  employees: {
    employee_id: string;
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
}

export default function ShiftManagement() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // Manual shift form
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [shiftType, setShiftType] = useState("regular");
  const [notes, setNotes] = useState("");

  // AI roster form
  const [rosterStartDate, setRosterStartDate] = useState("");
  const [rosterEndDate, setRosterEndDate] = useState("");
  const [requirements, setRequirements] = useState("");

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, []);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, user_id, employee_id, profiles(first_name, last_name)")
        .eq("status", "active");

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast({
        title: "Error",
        description: "Failed to load employees",
        variant: "destructive",
      });
    }
  };

  const fetchShifts = async () => {
    try {
      const { data, error } = await supabase
        .from("shifts")
        .select(`
          *,
          employees(
            employee_id,
            profiles(first_name, last_name)
          )
        `)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error("Error fetching shifts:", error);
    }
  };

  const createShift = async () => {
    if (!selectedEmployee || !shiftDate || !startTime || !endTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: profile } = await supabase.auth.getUser();
      const { data: tenantData } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", profile.user?.id)
        .single();

      const shiftData = {
        tenant_id: tenantData?.tenant_id,
        employee_id: selectedEmployee,
        shift_date: shiftDate,
        start_time: startTime,
        end_time: endTime,
        shift_type: shiftType,
        notes: notes,
        status: "scheduled",
        created_by: profile.user?.id,
      };

      const { error } = await supabase.from("shifts").insert(shiftData);

      if (error) throw error;

      // Send notification
      await supabase.functions.invoke("notify-shift-created", {
        body: { shifts: [shiftData] },
      });

      toast({
        title: "Success",
        description: "Shift created successfully",
      });

      // Reset form
      setSelectedEmployee("");
      setShiftDate("");
      setStartTime("");
      setEndTime("");
      setNotes("");
      fetchShifts();
    } catch (error) {
      console.error("Error creating shift:", error);
      toast({
        title: "Error",
        description: "Failed to create shift",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateRoster = async () => {
    if (!rosterStartDate || !rosterEndDate || employees.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select dates and ensure employees are available",
        variant: "destructive",
      });
      return;
    }

    setAiGenerating(true);
    try {
      const employeeData = employees.map(emp => ({
        id: emp.id,
        name: `${emp.profiles.first_name} ${emp.profiles.last_name}`,
      }));

      const { data, error } = await supabase.functions.invoke("generate-roster", {
        body: {
          startDate: rosterStartDate,
          endDate: rosterEndDate,
          employees: employeeData,
          requirements: requirements || "Standard 8-hour shifts with fair distribution",
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      // Insert generated shifts
      const { data: profile } = await supabase.auth.getUser();
      const { data: tenantData } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", profile.user?.id)
        .single();

      const shiftsToInsert = data.roster.map((shift: any) => ({
        tenant_id: tenantData?.tenant_id,
        employee_id: shift.employee_id,
        shift_date: shift.shift_date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        shift_type: shift.shift_type || "regular",
        notes: shift.notes,
        status: "scheduled",
        created_by: profile.user?.id,
      }));

      const { error: insertError } = await supabase
        .from("shifts")
        .insert(shiftsToInsert);

      if (insertError) throw insertError;

      // Send notifications
      await supabase.functions.invoke("notify-shift-created", {
        body: { shifts: shiftsToInsert },
      });

      toast({
        title: "Success",
        description: `AI generated ${shiftsToInsert.length} shifts successfully`,
      });

      // Reset form
      setRosterStartDate("");
      setRosterEndDate("");
      setRequirements("");
      fetchShifts();
    } catch (error: any) {
      console.error("Error generating roster:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate roster",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Shift Management</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Manual Shift Creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Manual Shift
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.profiles.first_name} {emp.profiles.last_name} ({emp.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>Shift Type</Label>
              <Select value={shiftType} onValueChange={setShiftType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </div>

            <Button onClick={createShift} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Shift"}
            </Button>
          </CardContent>
        </Card>

        {/* AI Roster Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI-Powered Roster Generation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={rosterStartDate}
                onChange={(e) => setRosterStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={rosterEndDate}
                onChange={(e) => setRosterEndDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Requirements (Optional)</Label>
              <Textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="E.g., 'Need 2 people per morning shift, prefer to avoid consecutive night shifts'"
                rows={4}
              />
            </div>

            <Button
              onClick={generateRoster}
              disabled={aiGenerating}
              className="w-full"
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Roster with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Shifts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Current Shifts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No shifts scheduled yet. Create one manually or generate a roster with AI.
            </p>
          ) : (
            <div className="space-y-2">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {shift.employees.profiles.first_name}{" "}
                      {shift.employees.profiles.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(shift.shift_date), "MMM dd, yyyy")} •{" "}
                      {shift.start_time} - {shift.end_time}
                    </p>
                    {shift.notes && (
                      <p className="text-sm text-muted-foreground italic mt-1">
                        {shift.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2 py-1 text-xs rounded bg-primary/10 text-primary">
                      {shift.shift_type}
                    </span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {shift.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
