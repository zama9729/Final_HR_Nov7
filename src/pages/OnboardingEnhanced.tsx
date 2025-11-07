import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";
import { Progress } from "@/components/ui/progress";
import { AppLayout } from "@/components/layout/AppLayout";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";

const onboardingSchema = z.object({
  // Personal & Job
  phone: z.string().trim().min(10, "Invalid phone").max(15).optional(),
  dateOfBirth: z.string().optional(),
  jobTitle: z.string().trim().min(1, "Required").optional(),
  managerId: z.string().optional(),
  location: z.string().trim().optional(),
  timezone: z.string().trim().optional(),
  startDate: z.string().optional(),
  workType: z.enum(["remote", "hybrid", "onsite"]).optional(),
  
  // Compliance
  emergencyContactName: z.string().trim().min(1, "Required").max(100),
  emergencyContactPhone: z.string().trim().min(10, "Invalid phone").max(15),
  emergencyContactRelation: z.string().trim().min(1, "Required"),
  panNumber: z.string().trim().min(10, "Invalid PAN").max(10).optional(),
  aadharNumber: z.string().trim().min(12, "Invalid Aadhar").max(12).optional(),
  
  // Address
  permanentAddress: z.string().trim().min(1, "Required").max(500),
  permanentCity: z.string().trim().min(1, "Required"),
  permanentState: z.string().trim().min(1, "Required"),
  permanentPostalCode: z.string().trim().min(1, "Required"),
  currentAddress: z.string().trim().min(1, "Required").max(500),
  currentCity: z.string().trim().min(1, "Required"),
  currentState: z.string().trim().min(1, "Required"),
  currentPostalCode: z.string().trim().min(1, "Required"),
  
  // Bank/Payroll
  bankAccountNumber: z.string().trim().min(1, "Required"),
  bankName: z.string().trim().min(1, "Required"),
  bankBranch: z.string().trim().min(1, "Required"),
  ifscCode: z.string().trim().min(1, "Required"),
  payFrequency: z.string().optional(),
  taxRegime: z.string().optional(),
});

interface Policy {
  policy_key: string;
  display_name: string;
  category: string;
  description?: string;
  value_type: string;
  value: any;
  effective_from: string;
  effective_to?: string;
}

export default function OnboardingEnhanced() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyAcknowledged, setPolicyAcknowledged] = useState(false);
  const [policySignature, setPolicySignature] = useState("");
  
  const [formData, setFormData] = useState({
    phone: "",
    dateOfBirth: "",
    jobTitle: "",
    managerId: "",
    location: "",
    timezone: "",
    startDate: "",
    workType: "" as "remote" | "hybrid" | "onsite" | "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    panNumber: "",
    aadharNumber: "",
    permanentAddress: "",
    permanentCity: "",
    permanentState: "",
    permanentPostalCode: "",
    currentAddress: "",
    currentCity: "",
    currentState: "",
    currentPostalCode: "",
    bankAccountNumber: "",
    bankName: "",
    bankBranch: "",
    ifscCode: "",
    payFrequency: "",
    taxRegime: "",
  });

  useEffect(() => {
    fetchEmployeeId();
    fetchPolicies();
  }, [user]);

  const fetchEmployeeId = async () => {
    if (!user) return;
    
    try {
      const employeeData = await api.checkEmployeePasswordChange();
      if (employeeData && employeeData.id) {
        setEmployeeId(employeeData.id);
        if (employeeData.onboarding_status === 'completed') {
          navigate('/dashboard');
        }
      }
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        console.log('User is not an employee');
        return;
      }
      console.error('Error fetching employee ID:', error);
    }
  };

  const fetchPolicies = async () => {
    try {
      if (user?.id) {
        const policiesData = await api.getEmployeePolicies(user.id);
        setPolicies(policiesData || []);
      }
    } catch (error) {
      console.error('Error fetching policies:', error);
    }
  };

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = onboardingSchema.parse(formData);
      setLoading(true);

      // Submit onboarding data
      await api.submitOnboarding(employeeId, {
        ...validated,
        // Keep existing fields for compatibility
        address: validated.currentAddress,
        city: validated.currentCity,
        state: validated.currentState,
        postalCode: validated.currentPostalCode,
        passportNumber: null,
        gender: null,
      });

      // Log policy acknowledgment
      if (policyAcknowledged && policySignature) {
        // In a real implementation, you'd log this to audit_logs
        console.log('Policy acknowledged:', {
          policies,
          signature: policySignature,
          timestamp: new Date().toISOString()
        });
      }

      toast({
        title: "Onboarding completed",
        description: "Welcome aboard! Redirecting to dashboard...",
      });

      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (error: any) {
      toast({
        title: "Error completing onboarding",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const progress = (step / 5) * 100;
  const policiesByCategory = policies.reduce((acc, policy) => {
    if (!acc[policy.category]) acc[policy.category] = [];
    acc[policy.category].push(policy);
    return acc;
  }, {} as Record<string, Policy[]>);

  return (
    <AppLayout>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle>Complete Your Onboarding</CardTitle>
            <CardDescription>Please fill in your details to complete the onboarding process</CardDescription>
            <Progress value={progress} className="mt-4" />
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Step 1: Personal & Job */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Personal & Job Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="jobTitle">Job Title</Label>
                      <Input
                        id="jobTitle"
                        value={formData.jobTitle}
                        onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="location">Work Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workType">Work Type</Label>
                      <Select
                        value={formData.workType}
                        onValueChange={(value) => setFormData({ ...formData, workType: value as typeof formData.workType })}
                      >
                        <SelectTrigger id="workType">
                          <SelectValue placeholder="Select work type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="remote">Remote</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                          <SelectItem value="onsite">Onsite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Input
                      id="timezone"
                      value={formData.timezone}
                      onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                      placeholder="e.g., Asia/Kolkata"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Compliance */}
              {step === 2 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Compliance & Emergency Contact</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-md font-medium mb-3">Emergency Contact</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="emergencyContactName">Contact Name *</Label>
                          <Input
                            id="emergencyContactName"
                            value={formData.emergencyContactName}
                            onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emergencyContactPhone">Phone *</Label>
                          <Input
                            id="emergencyContactPhone"
                            value={formData.emergencyContactPhone}
                            onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2 mt-2">
                        <Label htmlFor="emergencyContactRelation">Relation *</Label>
                        <Input
                          id="emergencyContactRelation"
                          value={formData.emergencyContactRelation}
                          onChange={(e) => setFormData({ ...formData, emergencyContactRelation: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-md font-medium mb-3">Government IDs</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="panNumber">PAN Number</Label>
                          <Input
                            id="panNumber"
                            value={formData.panNumber}
                            onChange={(e) => setFormData({ ...formData, panNumber: e.target.value })}
                            maxLength={10}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="aadharNumber">Aadhar Number</Label>
                          <Input
                            id="aadharNumber"
                            value={formData.aadharNumber}
                            onChange={(e) => setFormData({ ...formData, aadharNumber: e.target.value })}
                            maxLength={12}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Address */}
              {step === 3 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Address Information</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-md font-medium mb-3">Permanent Address *</h4>
                      <div className="space-y-2">
                        <Label htmlFor="permanentAddress">Address *</Label>
                        <Input
                          id="permanentAddress"
                          value={formData.permanentAddress}
                          onChange={(e) => setFormData({ ...formData, permanentAddress: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div className="space-y-2">
                          <Label htmlFor="permanentCity">City *</Label>
                          <Input
                            id="permanentCity"
                            value={formData.permanentCity}
                            onChange={(e) => setFormData({ ...formData, permanentCity: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="permanentState">State *</Label>
                          <Input
                            id="permanentState"
                            value={formData.permanentState}
                            onChange={(e) => setFormData({ ...formData, permanentState: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="permanentPostalCode">Postal Code *</Label>
                          <Input
                            id="permanentPostalCode"
                            value={formData.permanentPostalCode}
                            onChange={(e) => setFormData({ ...formData, permanentPostalCode: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-md font-medium mb-3">Current Address *</h4>
                      <div className="space-y-2">
                        <Label htmlFor="currentAddress">Address *</Label>
                        <Input
                          id="currentAddress"
                          value={formData.currentAddress}
                          onChange={(e) => setFormData({ ...formData, currentAddress: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div className="space-y-2">
                          <Label htmlFor="currentCity">City *</Label>
                          <Input
                            id="currentCity"
                            value={formData.currentCity}
                            onChange={(e) => setFormData({ ...formData, currentCity: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="currentState">State *</Label>
                          <Input
                            id="currentState"
                            value={formData.currentState}
                            onChange={(e) => setFormData({ ...formData, currentState: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="currentPostalCode">Postal Code *</Label>
                          <Input
                            id="currentPostalCode"
                            value={formData.currentPostalCode}
                            onChange={(e) => setFormData({ ...formData, currentPostalCode: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Bank/Payroll */}
              {step === 4 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Bank & Payroll Details</h3>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-md font-medium mb-3">Bank Details *</h4>
                      <div className="space-y-2">
                        <Label htmlFor="bankAccountNumber">Account Number *</Label>
                        <Input
                          id="bankAccountNumber"
                          value={formData.bankAccountNumber}
                          onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2">
                        <div className="space-y-2">
                          <Label htmlFor="bankName">Bank Name *</Label>
                          <Input
                            id="bankName"
                            value={formData.bankName}
                            onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bankBranch">Branch *</Label>
                          <Input
                            id="bankBranch"
                            value={formData.bankBranch}
                            onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2 mt-2">
                        <Label htmlFor="ifscCode">IFSC Code *</Label>
                        <Input
                          id="ifscCode"
                          value={formData.ifscCode}
                          onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-md font-medium mb-3">Payroll Information</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="payFrequency">Pay Frequency</Label>
                          <Select
                            value={formData.payFrequency}
                            onValueChange={(value) => setFormData({ ...formData, payFrequency: value })}
                          >
                            <SelectTrigger id="payFrequency">
                              <SelectValue placeholder="Select frequency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="biweekly">Bi-weekly</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="taxRegime">Tax Regime</Label>
                          <Select
                            value={formData.taxRegime}
                            onValueChange={(value) => setFormData({ ...formData, taxRegime: value })}
                          >
                            <SelectTrigger id="taxRegime">
                              <SelectValue placeholder="Select regime" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="old">Old Regime</SelectItem>
                              <SelectItem value="new">New Regime</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Policy Acknowledgment */}
              {step === 5 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Policy Acknowledgment</h3>
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {Object.entries(policiesByCategory).map(([category, categoryPolicies]) => (
                      <div key={category} className="space-y-2">
                        <h4 className="text-md font-medium">{category}</h4>
                        <div className="space-y-2 pl-4">
                          {categoryPolicies.map((policy) => (
                            <div key={policy.policy_key} className="border rounded p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-medium">{policy.display_name}</p>
                                  {policy.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{policy.description}</p>
                                  )}
                                  <div className="mt-2">
                                    <p className="text-sm">
                                      <span className="font-medium">Value: </span>
                                      {policy.value_type === 'JSON' ? (
                                        <pre className="text-xs bg-muted p-2 rounded mt-1">
                                          {JSON.stringify(policy.value, null, 2)}
                                        </pre>
                                      ) : (
                                        String(policy.value)
                                      )}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Effective: {new Date(policy.effective_from).toLocaleDateString()}
                                      {policy.effective_to && ` - ${new Date(policy.effective_to).toLocaleDateString()}`}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {policies.length === 0 && (
                      <p className="text-muted-foreground">No policies to acknowledge.</p>
                    )}
                  </div>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="policyAcknowledged"
                        checked={policyAcknowledged}
                        onCheckedChange={(checked) => setPolicyAcknowledged(checked === true)}
                      />
                      <Label htmlFor="policyAcknowledged" className="cursor-pointer">
                        I acknowledge that I have read and understood all the policies listed above.
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="policySignature">E-Signature (Your Full Name) *</Label>
                      <Input
                        id="policySignature"
                        value={policySignature}
                        onChange={(e) => setPolicySignature(e.target.value)}
                        placeholder="Type your full name to sign"
                        required={policyAcknowledged}
                      />
                      <p className="text-xs text-muted-foreground">
                        By typing your name, you are electronically signing this acknowledgment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                )}
                {step < 5 ? (
                  <Button type="button" onClick={handleNext}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={loading || !policyAcknowledged || !policySignature}>
                    {loading ? "Submitting..." : "Complete Onboarding"}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

