import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Star, Plus, Calendar } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { api } from "@/lib/api";

interface AppraisalCycle {
  id: string;
  cycle_name: string;
  cycle_year: number;
  status: string;
  start_date?: string;
  end_date?: string;
}
interface Employee {
  id: string;
  employee_id: string;
  position: string;
  user_id: string;
  profiles: {
    first_name: string;
    last_name: string;
    email: string;
  };
}
interface PerformanceReview {
  id: string;
  employee_id: string;
  rating: number | null;
  performance_score: number | null;
  strengths: string | null;
  areas_of_improvement: string | null;
  goals: string | null;
  comments: string | null;
  status: string;
  employee_id_display?: string;
  position?: string;
  first_name?: string;
  last_name?: string;
}

export default function Appraisals() {
  const { user, userRole } = useAuth();
  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewData, setReviewData] = useState({
    rating: "",
    performance_score: "",
    strengths: "",
    areas_of_improvement: "",
    goals: "",
    comments: "",
  });
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    cycle_name: "",
    cycle_type: "yearly",
    start_date: "",
    end_date: "",
  });
  useEffect(() => {
    fetchCycles();
    fetchTeamMembers();
  }, [user]);
  useEffect(() => {
    if (selectedCycle) fetchReviews();
  }, [selectedCycle]);

  const fetchCycles = async () => {
    try {
      const data = await api.getAppraisalCycles();
      setCycles(data || []);
    } catch (e: any) {
      toast.error("Failed to fetch appraisal cycles");
    }
  };
  const fetchTeamMembers = async () => {
    try {
      const data = await api.getTeamMembers();
      setTeamMembers(data || []);
    } catch (e: any) {
      toast.error("Failed to fetch team members");
    }
  };
  const fetchReviews = async () => {
    try {
      const data = await api.getPerformanceReviews(selectedCycle);
      setReviews(data || []);
    } catch (e: any) {
      toast.error("Failed to fetch reviews");
    }
  };
  const handleSubmitReview = async () => {
    if (!selectedCycle || !selectedEmployee) {
      toast.error("Please select a cycle and employee");
      return;
    }
    if (!reviewData.rating || !reviewData.performance_score) {
      toast.error("Rating and performance score are required");
      return;
    }
    setLoading(true);
    try {
      await api.submitPerformanceReview({
        appraisal_cycle_id: selectedCycle,
        employee_id: selectedEmployee,
        rating: Number(reviewData.rating),
        performance_score: Number(reviewData.performance_score),
        strengths: reviewData.strengths || undefined,
        areas_of_improvement: reviewData.areas_of_improvement || undefined,
        goals: reviewData.goals || undefined,
        comments: reviewData.comments || undefined,
      });
      toast.success("Review submitted successfully");
      setReviewData({ rating: "", performance_score: "", strengths: "", areas_of_improvement: "", goals: "", comments: "" });
      setSelectedEmployee("");
      fetchReviews();
    } catch (error: any) {
      toast.error("Failed to submit review: " + error.message);
    } finally {
      setLoading(false);
    }
  };
  const handleCreateCycle = async () => {
    if (!cycleForm.cycle_name || !cycleForm.start_date || !cycleForm.end_date) {
      toast.error("Please fill in all required fields");
      return;
    }

    setCreatingCycle(true);
    try {
      const currentYear = new Date().getFullYear();
      await api.createAppraisalCycle({
        cycle_name: cycleForm.cycle_name,
        cycle_year: currentYear,
        start_date: cycleForm.start_date,
        end_date: cycleForm.end_date,
        status: "draft",
      });
      
      toast.success("Appraisal cycle created successfully");
      setCycleDialogOpen(false);
      setCycleForm({ cycle_name: "", cycle_type: "yearly", start_date: "", end_date: "" });
      fetchCycles();
    } catch (error: any) {
      toast.error("Failed to create cycle: " + error.message);
    } finally {
      setCreatingCycle(false);
    }
  };

  const isHROrAbove = userRole === 'hr' || userRole === 'director' || userRole === 'ceo';
  
  const renderStars = (rating: number) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`h-4 w-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`} />
      ))}
    </div>
  );
  return (
    <AppLayout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Performance Appraisals</h1>
        {isHROrAbove && (
          <Button onClick={() => setCycleDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Appraisal Cycle
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Submit Performance Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Appraisal Cycle</Label>
              <Select value={selectedCycle} onValueChange={setSelectedCycle}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cycle" />
                </SelectTrigger>
                <SelectContent>
                  {cycles.map((cycle) => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {cycle.cycle_name} - {cycle.cycle_year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team Member</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.profiles?.first_name} {member.profiles?.last_name} - {member.employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rating (1-5)</Label>
              <Input type="number" min="1" max="5" value={reviewData.rating} onChange={(e) => setReviewData({ ...reviewData, rating: e.target.value })} />
            </div>
            <div>
              <Label>Performance Score (0-5)</Label>
              <Input type="number" step="0.01" min="0" max="5" value={reviewData.performance_score} onChange={(e) => setReviewData({ ...reviewData, performance_score: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Strengths</Label>
            <Textarea value={reviewData.strengths} onChange={(e) => setReviewData({ ...reviewData, strengths: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>Areas of Improvement</Label>
            <Textarea value={reviewData.areas_of_improvement} onChange={(e) => setReviewData({ ...reviewData, areas_of_improvement: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>Goals for Next Cycle</Label>
            <Textarea value={reviewData.goals} onChange={(e) => setReviewData({ ...reviewData, goals: e.target.value })} rows={3} />
          </div>
          <div>
            <Label>Additional Comments</Label>
            <Textarea value={reviewData.comments} onChange={(e) => setReviewData({ ...reviewData, comments: e.target.value })} rows={3} />
          </div>
          <Button onClick={handleSubmitReview} disabled={loading}>Submit Review</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Submitted Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>{review.first_name} {review.last_name}</TableCell>
                  <TableCell>{review.position}</TableCell>
                  <TableCell>{review.rating && renderStars(Number(review.rating))}</TableCell>
                  <TableCell>{review.performance_score}</TableCell>
                  <TableCell className="capitalize">{review.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cycle Management Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Appraisal Cycles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cycles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No appraisal cycles created yet.</p>
              {isHROrAbove && (
                <p className="text-sm">Click "Create Appraisal Cycle" above to get started.</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle Name</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell className="font-medium">{cycle.cycle_name}</TableCell>
                    <TableCell>{cycle.cycle_year}</TableCell>
                    <TableCell>
                      {cycle.start_date ? new Date(cycle.start_date).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {cycle.end_date ? new Date(cycle.end_date).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={cycle.status === 'active' ? 'default' : 'secondary'}>
                        {cycle.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Cycle Dialog */}
      <Dialog open={cycleDialogOpen} onOpenChange={setCycleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Appraisal Cycle</DialogTitle>
            <DialogDescription>
              Create a new yearly or quarterly performance appraisal cycle
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cycle Name</Label>
              <Input
                placeholder="e.g., Q1 2025, Annual Review 2025"
                value={cycleForm.cycle_name}
                onChange={(e) => setCycleForm({ ...cycleForm, cycle_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Cycle Type</Label>
              <Select
                value={cycleForm.cycle_type}
                onValueChange={(value) => setCycleForm({ ...cycleForm, cycle_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={cycleForm.start_date}
                  onChange={(e) => setCycleForm({ ...cycleForm, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={cycleForm.end_date}
                  onChange={(e) => setCycleForm({ ...cycleForm, end_date: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCycleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCycle} disabled={creatingCycle}>
              {creatingCycle ? "Creating..." : "Create Cycle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AppLayout>
  );
}
