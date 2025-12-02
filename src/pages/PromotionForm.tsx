import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Save, Send } from "lucide-react";
import { format } from "date-fns";

export default function PromotionForm() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEdit = Boolean(id);
  const appraisalIdFromQuery = searchParams.get('appraisalId');
  const employeeIdFromQuery = searchParams.get('employeeId');

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    employee_id: '',
    appraisal_id: '',
    old_designation: '',
    old_grade: '',
    old_department_id: '',
    old_ctc: '',
    new_designation: '',
    new_grade: '',
    new_department_id: '',
    new_ctc: '',
    reason_text: '',
    effective_date: format(new Date(), 'yyyy-MM-dd'),
    status: 'DRAFT' as 'DRAFT' | 'PENDING_APPROVAL',
  });

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
    if (isEdit && id) {
      fetchPromotion(id);
    } else if (appraisalIdFromQuery && employeeIdFromQuery) {
      // Pre-fill form from appraisal
      handleEmployeeChange(employeeIdFromQuery);
      setFormData(prev => ({ ...prev, appraisal_id: appraisalIdFromQuery, employee_id: employeeIdFromQuery }));
    }
  }, [isEdit, id, appraisalIdFromQuery, employeeIdFromQuery]);

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await api.getBranches();
      setDepartments(data || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchPromotion = async (promoId: string) => {
    try {
      setLoading(true);
      const promo = await api.getPromotion(promoId);
      setFormData({
        employee_id: promo.employee_id,
        appraisal_id: promo.appraisal_id || '',
        old_designation: promo.old_designation || '',
        old_grade: promo.old_grade || '',
        old_department_id: promo.old_department_id || '',
        old_ctc: promo.old_ctc?.toString() || '',
        new_designation: promo.new_designation,
        new_grade: promo.new_grade || '',
        new_department_id: promo.new_department_id || '',
        new_ctc: promo.new_ctc?.toString() || '',
        reason_text: promo.reason_text || '',
        effective_date: promo.effective_date,
        status: promo.status,
      });
      
      // Fetch appraisals for this employee
      if (promo.employee_id) {
        await fetchAppraisals(promo.employee_id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch promotion",
        variant: "destructive",
      });
      navigate('/promotions');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppraisals = async (employeeId: string) => {
    try {
      // This would need an API endpoint to fetch appraisals for an employee
      // For now, we'll leave it empty
      setAppraisals([]);
    } catch (error) {
      console.error('Error fetching appraisals:', error);
    }
  };

  const handleEmployeeChange = async (employeeId: string) => {
    setFormData(prev => ({ ...prev, employee_id: employeeId }));
    
    if (employeeId) {
      try {
        const employee = await api.getEmployee(employeeId);
        setFormData(prev => ({
          ...prev,
          old_designation: employee.position || '',
          old_department_id: employee.department || '',
        }));
        await fetchAppraisals(employeeId);
      } catch (error) {
        console.error('Error fetching employee:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent, submitForApproval = false) => {
    e.preventDefault();
    
    if (!formData.employee_id || !formData.new_designation || !formData.effective_date) {
      toast({
        title: "Validation Error",
        description: "Employee, new designation, and effective date are required",
        variant: "destructive",
      });
      return;
    }

    // Validate effective date is not in the past
    const effectiveDate = new Date(formData.effective_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    effectiveDate.setHours(0, 0, 0, 0);
    
    if (effectiveDate < today) {
      toast({
        title: "Validation Error",
        description: "Effective date cannot be in the past",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const payload = {
        ...formData,
        old_ctc: formData.old_ctc ? parseFloat(formData.old_ctc) : undefined,
        new_ctc: formData.new_ctc ? parseFloat(formData.new_ctc) : undefined,
        appraisal_id: formData.appraisal_id || undefined,
        old_department_id: formData.old_department_id || undefined,
        new_department_id: formData.new_department_id || undefined,
        status: submitForApproval ? 'PENDING_APPROVAL' : 'DRAFT',
      };

      if (isEdit && id) {
        await api.updatePromotion(id, payload);
        if (submitForApproval) {
          await api.submitPromotion(id);
        }
        toast({
          title: "Success",
          description: submitForApproval 
            ? "Promotion submitted for approval" 
            : "Promotion updated successfully",
        });
      } else {
        await api.createPromotion(payload);
        toast({
          title: "Success",
          description: submitForApproval 
            ? "Promotion created and submitted for approval" 
            : "Promotion created successfully",
        });
      }
      
      navigate('/promotions');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save promotion",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedEmployee = employees.find(e => e.id === formData.employee_id);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/promotions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {isEdit ? 'Edit Promotion' : 'New Promotion'}
            </h1>
            <p className="text-muted-foreground">
              {isEdit ? 'Update promotion details' : 'Create a new promotion proposal'}
            </p>
          </div>
        </div>

        <form onSubmit={(e) => handleSubmit(e, false)}>
          <Card>
            <CardHeader>
              <CardTitle>Promotion Details</CardTitle>
              <CardDescription>
                Fill in the promotion information. Old values will be auto-filled from employee profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Employee Selection */}
              <div className="space-y-2">
                <Label htmlFor="employee_id">Employee *</Label>
                <Select
                  value={formData.employee_id}
                  onValueChange={handleEmployeeChange}
                  required
                  disabled={isEdit}
                >
                  <SelectTrigger id="employee_id">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.profiles?.first_name} {emp.profiles?.last_name} - {emp.position || 'Employee'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Link to Appraisal (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="appraisal_id">Linked Appraisal (Optional)</Label>
                <Select
                  value={formData.appraisal_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, appraisal_id: value }))}
                >
                  <SelectTrigger id="appraisal_id">
                    <SelectValue placeholder="Select appraisal (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {appraisals.length > 0 ? (
                      appraisals.map((appr) => (
                        <SelectItem key={appr.id} value={appr.id}>
                          {appr.cycle_name} {appr.cycle_year} - Rating: {appr.rating || 'N/A'}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>No appraisals found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Old vs New Designation */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="old_designation">Current Designation</Label>
                  <Input
                    id="old_designation"
                    value={formData.old_designation}
                    onChange={(e) => setFormData(prev => ({ ...prev, old_designation: e.target.value }))}
                    placeholder="e.g., Software Engineer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_designation">New Designation *</Label>
                  <Input
                    id="new_designation"
                    value={formData.new_designation}
                    onChange={(e) => setFormData(prev => ({ ...prev, new_designation: e.target.value }))}
                    placeholder="e.g., Senior Software Engineer"
                    required
                  />
                </div>
              </div>

              {/* Old vs New Grade */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="old_grade">Current Grade</Label>
                  <Input
                    id="old_grade"
                    value={formData.old_grade}
                    onChange={(e) => setFormData(prev => ({ ...prev, old_grade: e.target.value }))}
                    placeholder="e.g., L3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_grade">New Grade</Label>
                  <Input
                    id="new_grade"
                    value={formData.new_grade}
                    onChange={(e) => setFormData(prev => ({ ...prev, new_grade: e.target.value }))}
                    placeholder="e.g., L4"
                  />
                </div>
              </div>

              {/* Old vs New Department */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="old_department_id">Current Department</Label>
                  <Select
                    value={formData.old_department_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, old_department_id: value }))}
                  >
                    <SelectTrigger id="old_department_id">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_department_id">New Department</Label>
                  <Select
                    value={formData.new_department_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, new_department_id: value }))}
                  >
                    <SelectTrigger id="new_department_id">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None (No change)</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Old vs New CTC */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="old_ctc">Current CTC (Optional)</Label>
                  <Input
                    id="old_ctc"
                    type="number"
                    value={formData.old_ctc}
                    onChange={(e) => setFormData(prev => ({ ...prev, old_ctc: e.target.value }))}
                    placeholder="e.g., 500000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_ctc">New CTC (Optional)</Label>
                  <Input
                    id="new_ctc"
                    type="number"
                    value={formData.new_ctc}
                    onChange={(e) => setFormData(prev => ({ ...prev, new_ctc: e.target.value }))}
                    placeholder="e.g., 600000"
                  />
                </div>
              </div>

              {/* Effective Date */}
              <div className="space-y-2">
                <Label htmlFor="effective_date">Effective Date *</Label>
                <Input
                  id="effective_date"
                  type="date"
                  value={formData.effective_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, effective_date: e.target.value }))}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The date from which the new designation/role will be active
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason_text">Reason / Justification</Label>
                <Textarea
                  id="reason_text"
                  value={formData.reason_text}
                  onChange={(e) => setFormData(prev => ({ ...prev, reason_text: e.target.value }))}
                  placeholder="Explain the reason for this promotion (performance, appraisal, etc.)"
                  rows={4}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={loading}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isEdit ? 'Update Draft' : 'Save as Draft'}
                </Button>
                <Button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={loading}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isEdit ? 'Update & Submit' : 'Create & Submit'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/promotions')}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppLayout>
  );
}

