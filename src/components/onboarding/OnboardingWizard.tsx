import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Loader2, Plus, X, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

interface CompanyInfo {
  companyName: string;
  legalName: string;
  registeredBusinessName: string;
  registrationNumber: string;
  gstNumber: string;
  cinNumber: string;
  registeredAddress: string;
  phone: string;
  email: string;
  website: string;
}

interface Department {
  id?: string;
  name: string;
  branchId?: string;
}

interface Designation {
  id?: string;
  name: string;
  departmentId?: string;
  reportsTo?: string;
}

interface Grade {
  id?: string;
  name: string;
  level: number;
}

interface EmployeeDefault {
  employmentType: string;
  workLocation: string;
}

interface KeyEmployee {
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  role: string;
}

interface RolePermission {
  roleName: string;
  permissions: {
    hr: boolean;
    payroll: boolean;
    leave: boolean;
    attendance: boolean;
  };
}

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh: refreshOrgSetup } = useOrgSetup();

  // Step 1: Company Information
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    companyName: "",
    legalName: "",
    registeredBusinessName: "",
    registrationNumber: "",
    gstNumber: "",
    cinNumber: "",
    registeredAddress: "",
    phone: "",
    email: "",
    website: "",
  });

  // Step 2: Organisation Structure
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [newDepartment, setNewDepartment] = useState<Department>({ name: "" });
  const [newDesignation, setNewDesignation] = useState<Designation>({ name: "" });
  const [newGrade, setNewGrade] = useState<Grade>({ name: "", level: 1 });
  const [branches, setBranches] = useState<any[]>([]);

  // Step 3: Employee Master Data
  const [employmentTypes, setEmploymentTypes] = useState<string[]>(["Permanent"]);
  const [workLocations, setWorkLocations] = useState<string[]>([]);
  const [newWorkLocation, setNewWorkLocation] = useState("");
  const [keyEmployees, setKeyEmployees] = useState<KeyEmployee[]>([]);
  const [newKeyEmployee, setNewKeyEmployee] = useState<KeyEmployee>({
    firstName: "",
    lastName: "",
    email: "",
    designation: "",
    role: "hr",
  });

  // Step 4: Roles & Access (matrix not needed; backend will use defaults)
  const [rolePermissions] = useState<RolePermission[]>([]);

  // Grade defaults for quick selection
  const gradeDefaults: Array<{ name: string; level: number }> = [
    { name: "A1", level: 1 },
    { name: "A2", level: 2 },
    { name: "A3", level: 3 },
    { name: "A4", level: 4 },
    { name: "A5", level: 5 },
    { name: "B1", level: 6 },
    { name: "B2", level: 7 },
    { name: "C1", level: 8 },
  ];

  useEffect(() => {
    loadBranches();
    loadExistingData();
  }, []);

  const loadExistingData = async () => {
    try {
      const data = await api.getOnboardingData();
      
      if (data.companyInfo) {
        setCompanyInfo(data.companyInfo);
      }
      if (data.departments) {
        setDepartments(data.departments);
      }
      if (data.designations) {
        setDesignations(data.designations);
      }
      if (data.grades) {
        setGrades(data.grades);
      }
      if (data.employmentTypes) {
        setEmploymentTypes(data.employmentTypes);
      }
      if (data.workLocations) {
        setWorkLocations(data.workLocations);
      }
      // rolePermissions ignored in UI (using backend defaults)
    } catch (error) {
      // If data doesn't exist yet, that's fine - we're in initial setup mode
      console.log("No existing onboarding data found, starting fresh");
    }
  };

  const loadBranches = async () => {
    try {
      const data = await api.getBranchHierarchy();
      setBranches(data?.branches || []);
    } catch (error) {
      console.error("Failed to load branches:", error);
    }
  };

  const handleNext = async () => {
    if (currentStep < 4) {
      // Save current step data
      await saveStepData();
      setCurrentStep((prev) => (prev + 1) as Step);
    } else {
      // Final step - complete onboarding
      await handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const saveStepData = async () => {
    setIsSaving(true);
    try {
      // Save step data locally (data will be saved when completing the wizard)
      // This is just for progress tracking - actual data is saved on completion
      console.log(`Step ${currentStep} progress saved`);
    } catch (error: any) {
      toast({
        title: "Failed to save",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Submit onboarding data (this will mark org_setup_status as complete)
      await api.completeOnboarding({
        companyInfo,
        departments,
        designations,
        grades,
        employmentTypes,
        workLocations,
        keyEmployees,
        rolePermissions: [], // matrix not needed; backend applies defaults
      });

      // Refresh org setup status to update the context
      await refreshOrgSetup();

      toast({
        title: "Setup completed!",
        description: "Your organization has been configured successfully.",
      });

      // Small delay to ensure state updates, then redirect
      setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 500);
    } catch (error: any) {
      toast({
        title: "Setup failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addDepartment = () => {
    if (newDepartment.name.trim()) {
      setDepartments([...departments, { ...newDepartment }]);
      setNewDepartment({ name: "" });
    }
  };

  const removeDepartment = (index: number) => {
    setDepartments(departments.filter((_, i) => i !== index));
  };

  const addDesignation = () => {
    if (newDesignation.name.trim()) {
      setDesignations([...designations, { ...newDesignation }]);
      setNewDesignation({ name: "" });
    }
  };

  const removeDesignation = (index: number) => {
    setDesignations(designations.filter((_, i) => i !== index));
  };

  const addGrade = () => {
    if (newGrade.name.trim()) {
      setGrades([...grades, { ...newGrade }]);
      setNewGrade({ name: "", level: 1 });
    }
  };

  const removeGrade = (index: number) => {
    setGrades(grades.filter((_, i) => i !== index));
  };

  const addWorkLocation = () => {
    if (newWorkLocation.trim()) {
      setWorkLocations([...workLocations, newWorkLocation]);
      setNewWorkLocation("");
    }
  };

  const removeWorkLocation = (index: number) => {
    setWorkLocations(workLocations.filter((_, i) => i !== index));
  };

  const addKeyEmployee = () => {
    if (newKeyEmployee.firstName.trim() && newKeyEmployee.email.trim()) {
      setKeyEmployees([...keyEmployees, { ...newKeyEmployee }]);
      setNewKeyEmployee({
        firstName: "",
        lastName: "",
        email: "",
        designation: "",
        role: "hr",
      });
    }
  };

  const removeKeyEmployee = (index: number) => {
    setKeyEmployees(keyEmployees.filter((_, i) => i !== index));
  };

  const updateRolePermission = (roleIndex: number, permission: keyof RolePermission["permissions"], value: boolean) => {
    const updated = [...rolePermissions];
    updated[roleIndex].permissions[permission] = value;
    setRolePermissions(updated);
  };

  const steps = [
    { number: 1, title: "Company Information" },
    { number: 2, title: "Organisation Structure" },
    { number: 3, title: "Employee Master Data" },
    { number: 4, title: "Roles & Access" },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-4xl shadow-large">
        <CardHeader>
          <CardTitle className="text-2xl">Organisation Setup</CardTitle>
          <CardDescription>Complete the following steps to set up your organization</CardDescription>
          
          {/* Progress stepper */}
          <div className="flex items-center justify-between mt-6">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors",
                      currentStep === step.number
                        ? "bg-primary text-primary-foreground"
                        : currentStep > step.number
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {currentStep > step.number ? "✓" : step.number}
                  </div>
                  <p className={cn("text-xs mt-2 text-center", currentStep === step.number ? "font-medium" : "")}>
                    {step.title}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-1 flex-1 mx-2 transition-colors",
                      currentStep > step.number ? "bg-success" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 mt-6">
          {/* Step 1: Company Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={companyInfo.companyName}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalName">Legal Name *</Label>
                  <Input
                    id="legalName"
                    value={companyInfo.legalName}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, legalName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registeredBusinessName">Registered Business Name / Trade Name</Label>
                  <Input
                    id="registeredBusinessName"
                    value={companyInfo.registeredBusinessName}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, registeredBusinessName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input
                    id="registrationNumber"
                    value={companyInfo.registrationNumber}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, registrationNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber">GST Number</Label>
                  <Input
                    id="gstNumber"
                    value={companyInfo.gstNumber}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, gstNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cinNumber">CIN Number</Label>
                  <Input
                    id="cinNumber"
                    value={companyInfo.cinNumber}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, cinNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="registeredAddress">Official Registered Address *</Label>
                <Textarea
                  id="registeredAddress"
                  value={companyInfo.registeredAddress}
                  onChange={(e) => setCompanyInfo({ ...companyInfo, registeredAddress: e.target.value })}
                  rows={3}
                  required
                />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={companyInfo.phone}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={companyInfo.email}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={companyInfo.website}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, website: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Organisation Structure */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Departments */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Departments</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Department name"
                    value={newDepartment.name}
                    onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                    className="flex-1"
                  />
                  <Select
                    value={newDepartment.branchId || ""}
                    onValueChange={(value) => setNewDepartment({ ...newDepartment, branchId: value || undefined })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All branches</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addDepartment} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {departments.map((dept, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>{dept.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeDepartment(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Designations */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Designations / Roles</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Designation name"
                    value={newDesignation.name}
                    onChange={(e) => setNewDesignation({ ...newDesignation, name: e.target.value })}
                    className="flex-1"
                  />
                  <Select
                    value={newDesignation.departmentId || ""}
                    onValueChange={(value) => setNewDesignation({ ...newDesignation, departmentId: value || undefined })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.name} value={dept.name}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newDesignation.reportsTo || ""}
                    onValueChange={(value) => setNewDesignation({ ...newDesignation, reportsTo: value || undefined })}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Reports to" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {designations.map((des) => (
                        <SelectItem key={des.name} value={des.name}>
                          {des.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={addDesignation} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {designations.map((des, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>{des.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeDesignation(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grades */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Grades / Levels</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Select
                      value={newGrade.name}
                      onValueChange={(value) => {
                        const match = gradeDefaults.find((g) => g.name === value);
                        setNewGrade({ name: value, level: match?.level ?? 1 });
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select grade" />
                      </SelectTrigger>
                      <SelectContent>
                        {gradeDefaults.map((g) => (
                          <SelectItem key={g.name} value={g.name}>
                            {g.name} (Level {g.level})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Level"
                      value={newGrade.level}
                      onChange={(e) => setNewGrade({ ...newGrade, level: parseInt(e.target.value) || 1 })}
                      className="w-24"
                    />
                    <Button onClick={addGrade} size="icon">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Pick a grade and adjust the level if needed.
                  </div>
                </div>
                <div className="space-y-2">
                  {grades.map((grade, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>{grade.name} (Level {grade.level})</span>
                      <Button variant="ghost" size="icon" onClick={() => removeGrade(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Employee Master Data */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Default Employment Types</h3>
                <div className="flex flex-wrap gap-2">
                  {["Permanent", "Contract", "Intern", "Part-time", "Consultant"].map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Checkbox
                        id={type}
                        checked={employmentTypes.includes(type)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEmploymentTypes([...employmentTypes, type]);
                          } else {
                            setEmploymentTypes(employmentTypes.filter((t) => t !== type));
                          }
                        }}
                      />
                      <Label htmlFor={type}>{type}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Default Work Locations</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Work location"
                    value={newWorkLocation}
                    onChange={(e) => setNewWorkLocation(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={addWorkLocation} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {workLocations.map((location, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>{location}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeWorkLocation(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Key Employees (Optional)</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <Input
                    placeholder="First name"
                    value={newKeyEmployee.firstName}
                    onChange={(e) => setNewKeyEmployee({ ...newKeyEmployee, firstName: e.target.value })}
                  />
                  <Input
                    placeholder="Last name"
                    value={newKeyEmployee.lastName}
                    onChange={(e) => setNewKeyEmployee({ ...newKeyEmployee, lastName: e.target.value })}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newKeyEmployee.email}
                    onChange={(e) => setNewKeyEmployee({ ...newKeyEmployee, email: e.target.value })}
                  />
                  <Input
                    placeholder="Designation"
                    value={newKeyEmployee.designation}
                    onChange={(e) => setNewKeyEmployee({ ...newKeyEmployee, designation: e.target.value })}
                  />
                  <Select
                    value={newKeyEmployee.role}
                    onValueChange={(value) => setNewKeyEmployee({ ...newKeyEmployee, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ceo">CEO</SelectItem>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={addKeyEmployee} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Employee
                  </Button>
                </div>
                <div className="space-y-2">
                  {keyEmployees.map((emp, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span>
                        {emp.firstName} {emp.lastName} ({emp.email}) - {emp.role}
                      </span>
                      <Button variant="ghost" size="icon" onClick={() => removeKeyEmployee(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Roles & Access */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Permission Matrix</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Role</th>
                      <th className="text-center p-2">HR</th>
                      <th className="text-center p-2">Payroll</th>
                      <th className="text-center p-2">Leave</th>
                      <th className="text-center p-2">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolePermissions.map((rolePerm, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2 font-medium">{rolePerm.roleName}</td>
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={rolePerm.permissions.hr}
                            onCheckedChange={(checked) => updateRolePermission(index, "hr", checked as boolean)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={rolePerm.permissions.payroll}
                            onCheckedChange={(checked) => updateRolePermission(index, "payroll", checked as boolean)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={rolePerm.permissions.leave}
                            onCheckedChange={(checked) => updateRolePermission(index, "leave", checked as boolean)}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={rolePerm.permissions.attendance}
                            onCheckedChange={(checked) => updateRolePermission(index, "attendance", checked as boolean)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex justify-between p-6 border-t">
          <Button variant="outline" onClick={handleBack} disabled={currentStep === 1 || isLoading}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading || isSaving}>
            {isLoading || isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {currentStep === 4 ? "Completing..." : "Saving..."}
              </>
            ) : (
              <>
                {currentStep === 4 ? "Complete Setup" : "Next"}
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}

