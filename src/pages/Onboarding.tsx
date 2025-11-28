import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";
import { Progress } from "@/components/ui/progress";
import { OnboardingDocsUploader, VERIFICATION_DOC_TYPES } from "@/components/onboarding/OnboardingDocsUploader";
import { Loader2 } from "lucide-react";
import { OnboardingStatusStepper } from "@/components/onboarding/OnboardingStatusStepper";

export const bankDetailsStatusSchema = z.enum(['pending', 'skipped']);

const onboardingSchema = z
  .object({
  // New required personal fields
  fullLegalName: z.string().trim().min(1, "Required").max(200).optional(),
  dateOfBirth: z.string().trim().optional(),
  nationality: z.string().trim().min(1, "Required").optional(),
  personalPhone: z.string().trim().min(10, "Invalid phone").max(15).optional(),
  personalEmail: z.string().email("Invalid email").optional(),
  // Emergency contact
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
  bankAccountNumber: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  bankBranch: z.string().trim().optional(),
  ifscCode: z.string().trim().optional(),
  panNumber: z.string().trim().min(10, "Invalid PAN").max(10),
  aadharNumber: z.string().trim().min(12, "Invalid Aadhar").max(12),
  passportNumber: z.string().trim().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  uanNumber: z
    .string()
    .trim()
    .regex(/^\d{12}$/, { message: "UAN must be 12 digits" })
    .optional(),
  bankDetailsStatus: bankDetailsStatusSchema.default('pending'),
  // New optional fields
  taxRegime: z.enum(["old", "new"]).optional(),
})
  .superRefine((data, ctx) => {
    if (data.bankDetailsStatus !== 'skipped') {
      if (!data.bankAccountNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankAccountNumber'],
          message: 'Required',
        });
      }
      if (!data.bankName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankName'],
          message: 'Required',
        });
      }
      if (!data.bankBranch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bankBranch'],
          message: 'Required',
        });
      }
      if (!data.ifscCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ifscCode'],
          message: 'Required',
        });
      }
    }
  });

export default function Onboarding() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [employeeId, setEmployeeId] = useState<string>("");
  
  const [formData, setFormData] = useState({
    // New personal info fields
    fullLegalName: "",
    dateOfBirth: "",
    nationality: "",
    personalPhone: "",
    personalEmail: "",
    // Existing fields
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
    uanNumber: "",
    bankDetailsStatus: 'pending' as z.infer<typeof bankDetailsStatusSchema>,
    // New optional fields
    taxRegime: "" as "old" | "new" | "",
    dependents: [] as Array<{name: string; relation: string; date_of_birth: string; gender: string}>,
    references: [] as Array<{name: string; phone: string; relation: string}>,
  });

  const [documents, setDocuments] = useState<Array<{ id: string; doc_type: string; file_name: string; uploaded_at: string; status?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const docsFlag = (import.meta.env.VITE_FEATURE_ONBOARDING_V2_DOCS || "true") !== "false";

  const [isUploading, setIsUploading] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [statusProgress, setStatusProgress] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [bankEditMode, setBankEditMode] = useState(false);

  const documentStatusRows = useMemo(() => {
    return VERIFICATION_DOC_TYPES.map((docType) => {
      const match = documents.find((doc) => doc.doc_type === docType.type);
      return {
        ...docType,
        status: match?.status,
        fileName: match?.file_name,
        uploadedAt: match?.uploaded_at,
      };
    });
  }, [documents]);

  useEffect(() => {
    fetchEmployeeId();
  }, [user, isUploading, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedStep = Number(params.get('step'));
    if (!Number.isNaN(requestedStep) && requestedStep >= 1 && requestedStep <= 5) {
      setStep(requestedStep);
    }
  }, [location.search]);

  useEffect(() => {
    if (employeeId) {
      loadExistingOnboardingData();
    }
  }, [employeeId]);

  const fetchEmployeeId = async () => {
    if (!user || isUploading) return; // Don't check status during upload
    
    try {
      const employeeData = await api.checkEmployeePasswordChange();

      // employeeData should have id field from the API
      if (employeeData && employeeData.id) {
        setEmployeeId(employeeData.id);
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

  const loadExistingOnboardingData = async () => {
    if (!employeeId) return;

    try {
      const employee = await api.getEmployee(employeeId);
      
      if (employee?.onboarding_data) {
        const data = employee.onboarding_data;
        
        // Populate form with existing data
        setFormData({
          // New personal info fields
          fullLegalName: data.full_legal_name || "",
          dateOfBirth: data.date_of_birth ? data.date_of_birth.split('T')[0] : "",
          nationality: data.nationality || "",
          personalPhone: data.personal_phone || "",
          personalEmail: data.personal_email || "",
          // Existing fields
          emergencyContactName: data.emergency_contact_name || "",
          emergencyContactPhone: data.emergency_contact_phone || "",
          emergencyContactRelation: data.emergency_contact_relation || "",
          permanentAddress: data.permanent_address || "",
          permanentCity: data.permanent_city || "",
          permanentState: data.permanent_state || "",
          permanentPostalCode: data.permanent_postal_code || "",
          currentAddress: data.current_address || "",
          currentCity: data.current_city || "",
          currentState: data.current_state || "",
          currentPostalCode: data.current_postal_code || "",
          // Keep old fields for backward compatibility
          address: data.current_address || data.address || "",
          city: data.current_city || data.city || "",
          state: data.current_state || data.state || "",
          postalCode: data.current_postal_code || data.postal_code || "",
          bankAccountNumber: data.bank_account_number || "",
          bankName: data.bank_name || "",
          bankBranch: data.bank_branch || "",
          ifscCode: data.ifsc_code || "",
          panNumber: data.pan_number || "",
          aadharNumber: data.aadhar_number || "",
          passportNumber: data.passport_number || "",
          gender: (data.gender as "male" | "female" | "other" | "prefer_not_to_say") || "",
          uanNumber: data.uan_number || "",
          bankDetailsStatus: data.bank_account_number ? 'pending' as const : 'skipped' as const,
          // New optional fields
          taxRegime: (data.tax_regime as "old" | "new") || "",
          dependents: Array.isArray(data.dependents) ? data.dependents : [],
          references: Array.isArray(data.references) ? data.references : [],
        });
        setBankEditMode(false);
      }
    } catch (error: any) {
      console.error('Error loading existing onboarding data:', error);
      // Don't show error toast - it's okay if there's no existing data
    }
  };

  const refreshOnboardingStatus = async () => {
    try {
      setStatusLoading(true);
      const progressData = await api.getOnboardingProgress();
      setStatusProgress(progressData);
    } catch (error) {
      console.error('Error loading onboarding status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    refreshOnboardingStatus();
  }, []);

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const sanitizedFormData = {
        ...formData,
        gender: formData.gender || undefined,
        taxRegime: formData.taxRegime || undefined,
        uanNumber: formData.uanNumber?.trim() ? formData.uanNumber.trim() : undefined,
        passportNumber: formData.passportNumber?.trim() ? formData.passportNumber.trim() : undefined,
        fullLegalName: formData.fullLegalName?.trim() || undefined,
        nationality: formData.nationality?.trim() || undefined,
        personalPhone: formData.personalPhone?.trim() || undefined,
        personalEmail: formData.personalEmail?.trim() || undefined,
        dateOfBirth: formData.dateOfBirth ? formData.dateOfBirth.split('T')[0] : undefined,
      };

      const validated = onboardingSchema.parse(sanitizedFormData);
      setLoading(true);

      // Submit onboarding data via API
      const shouldSendBankDetails = validated.bankDetailsStatus !== 'skipped';

      await api.submitOnboarding(employeeId, {
        // New personal info fields
        fullLegalName: validated.fullLegalName || null,
        dateOfBirth: validated.dateOfBirth || null,
        nationality: validated.nationality || null,
        personalPhone: validated.personalPhone || null,
        personalEmail: validated.personalEmail || null,
        // Existing fields
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
        bankAccountNumber: shouldSendBankDetails ? validated.bankAccountNumber : null,
        bankName: shouldSendBankDetails ? validated.bankName : null,
        bankBranch: shouldSendBankDetails ? validated.bankBranch : null,
        ifscCode: shouldSendBankDetails ? validated.ifscCode : null,
        panNumber: validated.panNumber,
        aadharNumber: validated.aadharNumber,
        passportNumber: validated.passportNumber || null,
        gender: validated.gender || null,
        uanNumber: validated.uanNumber || null,
        bankDetailsStatus: validated.bankDetailsStatus,
        // New optional fields
        taxRegime: validated.taxRegime || null,
        dependents: formData.dependents || [],
        references: formData.references || [],
      });

      toast({
        title: "Onboarding completed",
        description: "Welcome aboard! Redirecting to dashboard...",
      });
      setTimeout(() => navigate('/'), 1200);
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

    setIsUploading(true);
    setUploading(true);
    try {
      // Step 1: Get presigned URL
      const presignResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/onboarding/docs/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { url, key } = await presignResponse.json();

      // Step 2: Upload file directly to MinIO/S3
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Calculate checksum (SHA-256)
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Step 4: Complete upload (save metadata to DB)
      const completeResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/onboarding/docs/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          filename: file.name,
          size: file.size,
          checksum,
          docType: documentType,
          consent: true,
          notes: '',
        }),
      });

      if (!completeResponse.ok) {
        const error = await completeResponse.json();
        throw new Error(error.error || 'Failed to complete upload');
      }

      toast({
        title: "Document uploaded",
        description: `${file.name} uploaded successfully`,
      });

      // Refresh documents list
      fetchDocuments();
      setStep(4);
      refreshOnboardingStatus();
      setBankEditMode(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
      // Stay on page - don't redirect on error
    } finally {
      setIsUploading(false);
      setUploading(false);
    }
  };

  const handleSkipBankDetails = async () => {
    if (!employeeId) {
      toast({
        title: "Error",
        description: "Employee ID not found",
        variant: "destructive",
      });
      return;
    }

    try {
      setSkipLoading(true);
      await api.skipBankDetails(employeeId);
      setFormData((prev) => ({
        ...prev,
        bankDetailsStatus: 'skipped',
        bankAccountNumber: "",
        bankName: "",
        bankBranch: "",
        ifscCode: "",
      }));
      toast({
        title: "Bank details skipped",
        description: "You can provide bank information later. HR will reach out if needed.",
      });
      setStep(3);
      refreshOnboardingStatus();
    } catch (error: any) {
      toast({
        title: "Unable to skip bank details",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setSkipLoading(false);
    }
  };

  const fetchDocuments = async () => {
    if (!employeeId) return;

    try {
      // Use the API client method instead of direct fetch to ensure proper token handling
      const result = await api.getOnboardingDocuments(employeeId);
      if (result.documents) {
        setDocuments(result.documents);
      }
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      // Don't show error toast for this - it's not critical if documents fail to load
    }
  };

  useEffect(() => {
    if (employeeId) {
      fetchDocuments();
    }
  }, [employeeId]);

  const progress = (step / 5) * 100;
  const completedStatusSteps = (statusProgress?.steps_completed || []).map((entry: any) => entry.step);
  const isBankEditable = formData.bankDetailsStatus !== 'skipped' || bankEditMode;
  const skipActionDisabled = skipLoading || (!bankEditMode && formData.bankDetailsStatus === 'skipped');

  const renderDocStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="outline">Not uploaded</Badge>;
    switch (status.toLowerCase()) {
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-900 border-none">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "pending":
      case "uploaded":
        return <Badge variant="outline">Pending review</Badge>;
      default:
        return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
    }
  };

  const handleEnableBankDetails = () => {
    setBankEditMode(true);
    setFormData((prev) => ({
      ...prev,
      bankDetailsStatus: 'pending',
    }));
  };

  return (
    <div className="min-h-screen bg-muted/20 py-10 px-4">
      <div className="w-full max-w-5xl mx-auto">
        <Card className="shadow-xl border bg-background">
          <CardHeader className="space-y-6">
            <div>
              <p className="text-sm uppercase font-semibold text-primary tracking-wide">Onboarding Wizard</p>
              <CardTitle className="text-2xl mt-2">Complete Your Onboarding</CardTitle>
              <CardDescription>
                Provide the required details below. Your progress is saved automatically and you can return anytime.
              </CardDescription>
            </div>
            <div className="space-y-3">
              {statusLoading && !statusProgress ? (
                <p className="text-sm text-muted-foreground">Loading onboarding steps...</p>
              ) : (
                <OnboardingStatusStepper
                  currentStatus={statusProgress?.current_status}
                  completedSteps={completedStatusSteps}
                />
              )}
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">Step {step} of 5</span>
                  <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
                </div>
                <Progress value={progress} />
              </div>
            </div>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Personal & Contact Information</h3>
                <div className="space-y-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="fullLegalName">Full Legal Name *</Label>
                    <Input
                      id="fullLegalName"
                      value={formData.fullLegalName}
                      onChange={(e) => setFormData({ ...formData, fullLegalName: e.target.value })}
                      required
                      placeholder="As per government ID"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfBirth">Date of Birth *</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nationality">Nationality *</Label>
                      <Input
                        id="nationality"
                        value={formData.nationality}
                        onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                        required
                        placeholder="e.g., Indian, US Citizen"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="personalPhone">Personal Phone *</Label>
                      <Input
                        id="personalPhone"
                        value={formData.personalPhone}
                        onChange={(e) => setFormData({ ...formData, personalPhone: e.target.value })}
                        required
                        placeholder="10-digit mobile number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="personalEmail">Personal Email *</Label>
                      <Input
                        id="personalEmail"
                        type="email"
                        value={formData.personalEmail}
                        onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                        required
                        placeholder="your.email@example.com"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-4 pt-4 border-t">
                  <h4 className="text-md font-medium">Emergency Contact *</h4>
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
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Bank Details</h3>
                    <p className="text-sm text-muted-foreground">
                      These details are required for salary disbursement. They stay encrypted and visible only to payroll.
                    </p>
                  </div>
                  {formData.bankDetailsStatus === 'skipped' && !bankEditMode && (
                    <Button size="sm" onClick={handleEnableBankDetails}>
                      Provide bank details now
                    </Button>
                  )}
                </div>
                {formData.bankDetailsStatus === 'skipped' && !bankEditMode && (
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    You chose to skip bank details earlier. Click “Provide bank details now” whenever you are ready.
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="bankAccountNumber">Account Number *</Label>
                  <Input
                    id="bankAccountNumber"
                    value={formData.bankAccountNumber}
                    onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                    required={isBankEditable}
                    disabled={!isBankEditable}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name *</Label>
                    <Input
                      id="bankName"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      required={isBankEditable}
                      disabled={!isBankEditable}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankBranch">Branch *</Label>
                    <Input
                      id="bankBranch"
                      value={formData.bankBranch}
                      onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })}
                      required={isBankEditable}
                      disabled={!isBankEditable}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ifscCode">IFSC Code *</Label>
                  <Input
                    id="ifscCode"
                    value={formData.ifscCode}
                    onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value })}
                    required={isBankEditable}
                    disabled={!isBankEditable}
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Ensure IFSC and account number match your bank records to avoid salary delays.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkipBankDetails}
                      disabled={skipActionDisabled}
                    >
                      {formData.bankDetailsStatus === 'skipped' && !bankEditMode
                        ? 'Bank details skipped'
                        : skipLoading
                        ? 'Skipping...'
                        : 'Skip for now'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Government IDs</h3>
                <div className="space-y-2">
                  <Label htmlFor="uanNumber">UAN Number (Optional)</Label>
                  <Input
                    id="uanNumber"
                    value={formData.uanNumber}
                    onChange={(e) => setFormData({ ...formData, uanNumber: e.target.value })}
                    maxLength={12}
                    placeholder="Enter 12-digit UAN"
                  />
                </div>
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
                  Please upload copies of your verification documents (PAN, Aadhaar, Passport, etc.)
                </p>
                {isUploading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading document... please stay on this page until it finishes.</span>
                  </div>
                )}
                {docsFlag ? (
                  <OnboardingDocsUploader
                    employeeId={employeeId}
                    onRefresh={fetchDocuments}
                    onUploadStart={() => setIsUploading(true)}
                    onUploadEnd={() => setIsUploading(false)}
                    onUploadSuccess={fetchDocuments}
                  />
                ) : (
                  <>
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
                                  {doc.doc_type} • {new Date(doc.uploaded_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Review & Submit</h3>
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium mb-2">Personal Information</p>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      {formData.fullLegalName && <p>Name: {formData.fullLegalName}</p>}
                      {formData.dateOfBirth && <p>DOB: {formData.dateOfBirth}</p>}
                      {formData.nationality && <p>Nationality: {formData.nationality}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Government IDs</p>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      {formData.panNumber && <p>PAN: {formData.panNumber}</p>}
                      {formData.aadharNumber && <p>Aadhaar: {formData.aadharNumber}</p>}
                      {formData.passportNumber && <p>Passport: {formData.passportNumber}</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Documents</p>
                    <div className="rounded-lg border divide-y bg-background">
                      {documentStatusRows.map((doc) => (
                        <div key={doc.type} className="flex items-center justify-between px-3 py-2 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{doc.label}</span>
                            {doc.fileName && (
                              <span className="text-xs text-muted-foreground truncate max-w-[220px]">
                                {doc.fileName}
                              </span>
                            )}
                          </div>
                          {renderDocStatusBadge(doc.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Please review all information before submitting. You can go back to make changes.
                  </p>
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
                <Button type="submit" disabled={loading || uploading}>
                  {loading ? "Submitting..." : "Complete Onboarding"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
  );
}
