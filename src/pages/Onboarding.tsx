import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  // Permanent address
  permanentAddress: z.string().trim().min(1, "Required").max(500),
  permanentCity: z.string().trim().min(1, "Required"),
  permanentState: z.string().trim().min(1, "Required"),
  permanentPostalCode: z.string().trim().min(1, "Required"),
  // Current address
  currentAddress: z.string().trim().min(1, "Required").max(500),
  currentCity: z.string().trim().min(1, "Required"),
  currentState: z.string().trim().min(1, "Required"),
  currentPostalCode: z.string().trim().min(1, "Required"),
  // Keep old fields for backward compatibility
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  postalCode: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().min(1, "Required"),
  bankName: z.string().trim().min(1, "Required"),
  bankBranch: z.string().trim().min(1, "Required"),
  ifscCode: z.string().trim().min(1, "Required"),
  panNumber: z.string().trim().min(10, "Invalid PAN").max(10),
  aadharNumber: z.string().trim().min(12, "Invalid Aadhar").max(12),
  passportNumber: z.string().trim().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
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
    permanentAddress: "",
    permanentCity: "",
    permanentState: "",
    permanentPostalCode: "",
    currentAddress: "",
    currentCity: "",
    currentState: "",
    currentPostalCode: "",
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
    passportNumber: "",
    gender: "" as "male" | "female" | "other" | "prefer_not_to_say" | "",
  });

  const [documents, setDocuments] = useState<Array<{ id: string; document_type: string; file_name: string; uploaded_at: string }>>([]);
  const [uploading, setUploading] = useState(false);

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
    if (step < 4) setStep(step + 1);
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
        permanentAddress: validated.permanentAddress,
        permanentCity: validated.permanentCity,
        permanentState: validated.permanentState,
        permanentPostalCode: validated.permanentPostalCode,
        currentAddress: validated.currentAddress,
        currentCity: validated.currentCity,
        currentState: validated.currentState,
        currentPostalCode: validated.currentPostalCode,
        // Keep old fields for backward compatibility
        address: validated.address || validated.currentAddress,
        city: validated.city || validated.currentCity,
        state: validated.state || validated.currentState,
        postalCode: validated.postalCode || validated.currentPostalCode,
        bankAccountNumber: validated.bankAccountNumber,
        bankName: validated.bankName,
        bankBranch: validated.bankBranch,
        ifscCode: validated.ifscCode,
        panNumber: validated.panNumber,
        aadharNumber: validated.aadharNumber,
        passportNumber: validated.passportNumber || null,
        gender: validated.gender || null,
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

  const handleDocumentUpload = async (file: File, documentType: string) => {
    if (!employeeId) {
      toast({
        title: "Error",
        description: "Employee ID not found",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('employeeId', employeeId);
      formData.append('documentType', documentType);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/onboarding/upload-document`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload document');
      }

      toast({
        title: "Document uploaded",
        description: `${file.name} uploaded successfully`,
      });

      // Refresh documents list
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const fetchDocuments = async () => {
    if (!employeeId) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/onboarding/documents/${employeeId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const result = await response.json();
      if (result.success && result.documents) {
        setDocuments(result.documents);
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  useEffect(() => {
    if (employeeId) {
      fetchDocuments();
    }
  }, [employeeId]);

  const progress = (step / 4) * 100;

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
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-md font-medium">Personal Information</h4>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Your Gender (Optional)</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => setFormData({ ...formData, gender: value as typeof formData.gender })}
                    >
                      <SelectTrigger id="gender">
                        <SelectValue placeholder="Select your gender (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="passportNumber">Passport Number (Optional)</Label>
                  <Input
                    id="passportNumber"
                    value={formData.passportNumber}
                    onChange={(e) => setFormData({ ...formData, passportNumber: e.target.value })}
                    placeholder="Enter passport number if available"
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Verification Documents</h3>
                <p className="text-sm text-muted-foreground">
                  Please upload copies of your verification documents (PAN, Aadhar, Passport, etc.)
                </p>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="panDocument">PAN Card Document</Label>
                    <Input
                      id="panDocument"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleDocumentUpload(file, 'PAN');
                        }
                      }}
                      disabled={uploading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="aadharDocument">Aadhar Card Document</Label>
                    <Input
                      id="aadharDocument"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleDocumentUpload(file, 'Aadhar');
                        }
                      }}
                      disabled={uploading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="passportDocument">Passport Document (Optional)</Label>
                    <Input
                      id="passportDocument"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleDocumentUpload(file, 'Passport');
                        }
                      }}
                      disabled={uploading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="bankDocument">Bank Statement / Cancelled Cheque</Label>
                    <Input
                      id="bankDocument"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleDocumentUpload(file, 'Bank Statement');
                        }
                      }}
                      disabled={uploading}
                    />
                  </div>
                </div>

                {uploading && (
                  <p className="text-sm text-muted-foreground">Uploading document...</p>
                )}

                {documents.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>Uploaded Documents</Label>
                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="text-sm font-medium">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.document_type} • {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4 pt-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="submit" disabled={loading || uploading}>
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
