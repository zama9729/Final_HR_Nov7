import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays } from "date-fns";

interface ProbationPanelProps {
  employeeId: string;
  canEdit: boolean;
}

export function ProbationPanel({ employeeId, canEdit }: ProbationPanelProps) {
  const { toast } = useToast();
  const [probation, setProbation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    probation_start: "",
    probation_days: 90,
    allowed_leave_days: 3,
    auto_confirm_at_end: false,
    requires_mid_probation_review: true,
  });

  const fetchProbation = async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const data = await api.getEmployeeProbation(employeeId);
      setProbation(data);
      if (!data) {
        setForm((prev) => ({
          ...prev,
          probation_start: new Date().toISOString().slice(0, 10),
        }));
      }
    } catch (error: any) {
      console.error("Failed to load probation", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProbation();
  }, [employeeId]);

  const handleCreate = async () => {
    try {
      await api.createProbation({ employee_id: employeeId, ...form });
      toast({ title: "Probation created" });
      fetchProbation();
    } catch (error: any) {
      toast({
        title: "Failed to create probation",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleConfirm = async () => {
    try {
      await api.confirmProbation(probation.id);
      toast({ title: "Probation confirmed" });
      fetchProbation();
    } catch (error: any) {
      toast({
        title: "Confirmation failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const daysRemaining = probation
    ? differenceInCalendarDays(new Date(probation.probation_end), new Date())
    : null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Probation</CardTitle>
        {probation && (
          <Badge variant={probation.status === "completed" ? "default" : "secondary"}>
            {probation.status?.replace("_", " ")}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading probation details...</p>}
        {!loading && probation && (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Start</p>
                <p className="font-medium">{new Date(probation.probation_start).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">End</p>
                <p className="font-medium">{new Date(probation.probation_end).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Allowed leave days</p>
                <p className="font-medium">{probation.allowed_leave_days}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Auto confirm</p>
                <p className="font-medium">{probation.auto_confirm_at_end ? "Yes" : "No"}</p>
              </div>
            </div>
            {daysRemaining !== null && (
              <p className="text-sm text-muted-foreground">
                {daysRemaining >= 0 ? `${daysRemaining} days remaining` : "Probation end date passed"}
              </p>
            )}
            {canEdit && probation.status !== "confirmed" && (
              <Button onClick={handleConfirm}>Confirm Probation</Button>
            )}
          </>
        )}
        {!loading && !probation && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="probation_start">Start Date</Label>
                <Input
                  id="probation_start"
                  type="date"
                  value={form.probation_start}
                  onChange={(event) => setForm((prev) => ({ ...prev, probation_start: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min={30}
                  value={form.probation_days}
                  onChange={(event) => setForm((prev) => ({ ...prev, probation_days: Number(event.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Allowed leave days</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.allowed_leave_days}
                  onChange={(event) => setForm((prev) => ({ ...prev, allowed_leave_days: Number(event.target.value) }))}
                />
              </div>
              <div className="flex items-center justify-between space-x-2 border rounded-lg px-4 py-3">
                <div className="space-y-0.5">
                  <Label className="text-sm">Auto confirm at end</Label>
                  <p className="text-xs text-muted-foreground">Automatically confirm if no blockers.</p>
                </div>
                <Switch
                  checked={form.auto_confirm_at_end}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, auto_confirm_at_end: checked }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between space-x-2 border rounded-lg px-4 py-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Mid-review required</Label>
                <p className="text-xs text-muted-foreground">Ask manager to submit review during probation.</p>
              </div>
              <Switch
                checked={form.requires_mid_probation_review}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, requires_mid_probation_review: checked }))}
              />
            </div>
            {canEdit && (
              <Button onClick={handleCreate}>Create Probation</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

