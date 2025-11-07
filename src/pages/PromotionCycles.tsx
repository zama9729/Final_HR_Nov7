import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CheckCircle, Clock, XCircle, Eye, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PromotionCycle {
  id: string;
  org_id: string;
  name: string;
  period: 'QUARTERLY' | 'H1' | 'ANNUAL' | 'CUSTOM';
  start_date: string;
  end_date: string;
  status: 'DRAFT' | 'OPEN' | 'REVIEW' | 'APPROVAL' | 'CLOSED';
  criteria?: any;
  created_at: string;
}

interface PromotionEvaluation {
  id: string;
  cycle_id: string;
  employee_id: string;
  manager_id: string;
  rating: number;
  remarks?: string;
  recommendation: 'NONE' | 'PROMOTE' | 'HOLD';
  attachments?: any;
  submitted_at: string;
}

export default function PromotionCycles() {
  const { toast } = useToast();
  const { user, userRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [cycles, setCycles] = useState<PromotionCycle[]>([]);
  const [evaluations, setEvaluations] = useState<PromotionEvaluation[]>([]);
  const [health, setHealth] = useState({ activeCycle: false, pendingEvaluations: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evaluationDialogOpen, setEvaluationDialogOpen] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<PromotionCycle | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    period: "QUARTERLY" as 'QUARTERLY' | 'H1' | 'ANNUAL' | 'CUSTOM',
    start_date: "",
    end_date: "",
    criteria: "",
  });
  const [evaluationForm, setEvaluationForm] = useState({
    cycle_id: "",
    employee_id: "",
    rating: "",
    remarks: "",
    recommendation: "NONE" as 'NONE' | 'PROMOTE' | 'HOLD',
  });

  useEffect(() => {
    fetchCycles();
    fetchHealth();
    fetchEmployees();
  }, []);

  const fetchCycles = async () => {
    try {
      const data = await api.getCurrentPromotionCycles();
      setCycles(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch promotion cycles",
        variant: "destructive",
      });
    }
  };

  const fetchHealth = async () => {
    try {
      const data = await api.getPromotionHealth();
      setHealth(data);
    } catch (error: any) {
      console.error('Error fetching promotion health:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let criteria = null;
      if (formData.criteria) {
        try {
          criteria = JSON.parse(formData.criteria);
        } catch {
          criteria = { description: formData.criteria };
        }
      }

      await api.createPromotionCycle({
        name: formData.name,
        period: formData.period,
        start_date: formData.start_date,
        end_date: formData.end_date,
        criteria,
      });

      toast({
        title: "Success",
        description: "Promotion cycle created successfully",
      });

      setDialogOpen(false);
      setFormData({
        name: "",
        period: "QUARTERLY",
        start_date: "",
        end_date: "",
        criteria: "",
      });
      fetchCycles();
      fetchHealth();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create promotion cycle",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.submitPromotionEvaluation({
        cycle_id: evaluationForm.cycle_id,
        employee_id: evaluationForm.employee_id,
        rating: parseFloat(evaluationForm.rating),
        remarks: evaluationForm.remarks,
        recommendation: evaluationForm.recommendation,
      });

      toast({
        title: "Success",
        description: "Evaluation submitted successfully",
      });

      setEvaluationDialogOpen(false);
      setEvaluationForm({
        cycle_id: "",
        employee_id: "",
        rating: "",
        remarks: "",
        recommendation: "NONE",
      });
      fetchHealth();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit evaluation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (evalId: string) => {
    try {
      await api.reviewPromotionEvaluation(evalId);
      toast({
        title: "Success",
        description: "Evaluation reviewed",
      });
      fetchHealth();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to review evaluation",
        variant: "destructive",
      });
    }
  };

  const handleApprove = async (evalId: string) => {
    try {
      await api.approvePromotion(evalId);
      toast({
        title: "Success",
        description: "Promotion approved",
      });
      fetchHealth();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve promotion",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      DRAFT: "outline",
      OPEN: "default",
      REVIEW: "secondary",
      APPROVAL: "default",
      CLOSED: "secondary",
    };

    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  const getRecommendationBadge = (recommendation: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      NONE: "outline",
      PROMOTE: "default",
      HOLD: "secondary",
    };

    return <Badge variant={variants[recommendation] || "outline"}>{recommendation}</Badge>;
  };

  const canCreateCycle = ['hr', 'ceo', 'admin', 'director'].includes(userRole || '');
  const canReview = ['hr', 'ceo', 'admin', 'director'].includes(userRole || '');
  const canApprove = ['ceo', 'admin'].includes(userRole || '');
  const canSubmitEvaluation = ['manager', 'hr', 'ceo', 'admin', 'director'].includes(userRole || '');

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Promotion Cycles</h1>
            <p className="text-muted-foreground">Manage promotion cycles and evaluations</p>
          </div>
          {canCreateCycle && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Cycle
            </Button>
          )}
        </div>

        {/* Health Status */}
        <Card>
          <CardHeader>
            <CardTitle>Promotion Health</CardTitle>
            <CardDescription>Current promotion cycle status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${health.activeCycle ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-sm font-medium">
                  {health.activeCycle ? 'Active Cycle' : 'No Active Cycle'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {health.pendingEvaluations} Pending Evaluations
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cycles */}
        <Card>
          <CardHeader>
            <CardTitle>Current Promotion Cycles</CardTitle>
            <CardDescription>Active and recent promotion cycles</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell className="font-medium">{cycle.name}</TableCell>
                    <TableCell>{cycle.period}</TableCell>
                    <TableCell>{new Date(cycle.start_date).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(cycle.end_date).toLocaleDateString()}</TableCell>
                    <TableCell>{getStatusBadge(cycle.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {canSubmitEvaluation && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEvaluationForm({
                                ...evaluationForm,
                                cycle_id: cycle.id,
                              });
                              setEvaluationDialogOpen(true);
                            }}
                          >
                            Submit Evaluation
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {cycles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No active promotion cycles
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Cycle Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Promotion Cycle</DialogTitle>
              <DialogDescription>
                Create a new promotion cycle for your organization
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateCycle} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Cycle Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="period">Period *</Label>
                  <Select
                    value={formData.period}
                    onValueChange={(value) => setFormData({ ...formData, period: value as any })}
                    required
                  >
                    <SelectTrigger id="period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="H1">H1</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                      <SelectItem value="CUSTOM">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="criteria">Criteria (JSON, optional)</Label>
                <Textarea
                  id="criteria"
                  value={formData.criteria}
                  onChange={(e) => setFormData({ ...formData, criteria: e.target.value })}
                  placeholder='{"min_rating": 4.0, "min_tenure_months": 12}'
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create Cycle"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Submit Evaluation Dialog */}
        <Dialog open={evaluationDialogOpen} onOpenChange={setEvaluationDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Submit Promotion Evaluation</DialogTitle>
              <DialogDescription>
                Submit an evaluation for an employee in the promotion cycle
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitEvaluation} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="employee_id">Employee *</Label>
                <Select
                  value={evaluationForm.employee_id}
                  onValueChange={(value) => setEvaluationForm({ ...evaluationForm, employee_id: value })}
                  required
                >
                  <SelectTrigger id="employee_id">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.user_id}>
                        {emp.first_name} {emp.last_name} ({emp.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rating">Rating (0-5) *</Label>
                  <Input
                    id="rating"
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={evaluationForm.rating}
                    onChange={(e) => setEvaluationForm({ ...evaluationForm, rating: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recommendation">Recommendation *</Label>
                  <Select
                    value={evaluationForm.recommendation}
                    onValueChange={(value) => setEvaluationForm({ ...evaluationForm, recommendation: value as any })}
                    required
                  >
                    <SelectTrigger id="recommendation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="PROMOTE">Promote</SelectItem>
                      <SelectItem value="HOLD">Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={evaluationForm.remarks}
                  onChange={(e) => setEvaluationForm({ ...evaluationForm, remarks: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEvaluationDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Evaluation"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

