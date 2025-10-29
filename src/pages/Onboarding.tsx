import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";
import { Progress } from "@/components/ui/progress";

const onboardingSchema = z.object({
  emergencyContactName: z.string().trim().min(1, "Required").max(100),
  emergencyContactPhone: z.string().trim().min(10, "Invalid phone").max(15),
  emergencyContactRelation: z.string().trim().min(1, "Required"),
  address: z.string().trim().min(1, "Required").max(500),
  city: z.string().trim().min(1, "Required"),
  state: z.string().trim().min(1, "Required"),
  postalCode: z.string().trim().min(1, "Required"),
  bankAccountNumber: z.string().trim().min(1, "Required"),
  bankName: z.string().trim().min(1, "Required"),
  bankBranch: z.string().trim().min(1, "Required"),
  ifscCode: z.string().trim().min(1, "Required"),
  panNumber: z.string().trim().min(10, "Invalid PAN").max(10),
  aadharNumber: z.string().trim().min(12, "Invalid Aadhar").max(12),
});

export default function Onboarding() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [employeeId, setEmployeeId] = useState<string>("");
  
  const [formData, setFormData] = useState({
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    bankAccountNumber: "",
    bankName: "",
    bankBranch: "",
    ifscCode: "",
    panNumber: "",
    aadharNumber: "",
  });

  useEffect(() => {
    fetchEmployeeId();
  }, [user]);

  const fetchEmployeeId = async () => {
    if (!user) return;
    
    try {
      const employeeData = await api.checkEmployeePasswordChange();

      // employeeData should have id field from the API
      if (employeeData && employeeData.id) {
        setEmployeeId(employeeData.id);
        if (employeeData.onboarding_status === 'completed') {
          navigate('/dashboard');
        }
      } else {
        console.warn('No employee record found for user');
      }
    } catch (error: any) {
      // If employee doesn't exist, that's okay - might not be an employee yet
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        console.log('User is not an employee');
        return;
      }
      console.error('Error fetching employee ID:', error);
    }
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = onboardingSchema.parse(formData);
      setLoading(true);

      // Submit onboarding data via API
      await api.submitOnboarding(employeeId, {
        emergencyContactName: validated.emergencyContactName,
        emergencyContactPhone: validated.emergencyContactPhone,
        emergencyContactRelation: validated.emergencyContactRelation,
        address: validated.address,
        city: validated.city,
        state: validated.state,
        postalCode: validated.postalCode,
        bankAccountNumber: validated.bankAccountNumber,
        bankName: validated.bankName,
        bankBranch: validated.bankBranch,
        ifscCode: validated.ifscCode,
        panNumber: validated.panNumber,
        aadharNumber: validated.aadharNumber,
      });

      toast({
        title: "Onboarding completed",
        description: "Welcome aboard! Redirecting to dashboard...",
      });

      setTimeout(() => navigate('/'), 1500);
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

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Complete Your Onboarding</CardTitle>
          <CardDescription>Please fill in your details to complete the onboarding process</CardDescription>
          <Progress value={progress} className="mt-4" />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Emergency Contact</h3>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactName">Contact Name *</Label>
                  <Input
                    id="emergencyContactName"
                    value={formData.emergencyContactName}
                    onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactPhone">Phone *</Label>
                    <Input
                      id="emergencyContactPhone"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactRelation">Relation *</Label>
                    <Input
                      id="emergencyContactRelation"
                      value={formData.emergencyContactRelation}
                      onChange={(e) => setFormData({ ...formData, emergencyContactRelation: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code *</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Bank Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="bankAccountNumber">Account Number *</Label>
                  <Input
                    id="bankAccountNumber"
                    value={formData.bankAccountNumber}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="ifscCode">IFSC Code *</Label>
                  <Input
                    id="ifscCode"
                    value={formData.ifscCode}
                    onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Government IDs</h3>
                <div className="space-y-2">
                  <Label htmlFor="panNumber">PAN Number *</Label>
                  <Input
                    id="panNumber"
                    value={formData.panNumber}
                    onChange={(e) => setFormData({ ...formData, panNumber: e.target.value })}
                    maxLength={10}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aadharNumber">Aadhar Number *</Label>
                  <Input
                    id="aadharNumber"
                    value={formData.aadharNumber}
                    onChange={(e) => setFormData({ ...formData, aadharNumber: e.target.value })}
                    maxLength={12}
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={loading}>
                  {loading ? "Submitting..." : "Complete Onboarding"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
