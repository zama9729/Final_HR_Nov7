import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Building2, Upload, Loader2, Lock, ExternalLink, CheckCircle2, XCircle, Bot, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgSetup } from "@/contexts/OrgSetupContext";

export default function Settings() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const { attendanceSettings, refreshAttendanceSettings } = useOrgSetup();
  const [isLoading, setIsLoading] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [organization, setOrganization] = useState<any>(null);
  const [orgName, setOrgName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [attendanceState, setAttendanceState] = useState({
    capture_method: "timesheets",
    enable_geofence: false,
    enable_kiosk: false,
    kiosk_pin: "",
    kiosk_label: "",
  });
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [geofenceForm, setGeofenceForm] = useState({
    lat: "",
    lng: "",
    radius: "250",
    label: "",
  });
  const [geofenceSaving, setGeofenceSaving] = useState(false);
  const [sslConfig, setSslConfig] = useState({
    enabled: false,
    status: 'unknown' as 'enabled' | 'disabled' | 'unknown',
  });
  const [sslLoading, setSslLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [aiConfigLoading, setAiConfigLoading] = useState(true);
  const [aiConfigSaving, setAiConfigSaving] = useState(false);
  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId),
    [branches, selectedBranchId]
  );
  const geofenceUpdatedAt = selectedBranch?.metadata?.geofence?.updated_at;

  const hydrateGeofenceForm = (branchId: string, sourceList?: any[]) => {
    const collection = sourceList || branches;
    const branch = collection.find((b) => b.id === branchId);
    const existing = branch?.metadata?.geofence || {};
    setGeofenceForm({
      lat: existing.lat !== undefined ? String(existing.lat) : "",
      lng: existing.lng !== undefined ? String(existing.lng) : "",
      radius: existing.radius !== undefined ? String(existing.radius) : "250",
      label: existing.label || "",
    });
  };

  const loadBranchHierarchy = async (preferredBranchId?: string) => {
    try {
      const data = await api.getBranchHierarchy();
      const branchList = data?.branches || [];
      setBranches(branchList);
      if (branchList.length === 0) {
        setSelectedBranchId("");
        setGeofenceForm({ lat: "", lng: "", radius: "250", label: "" });
        return;
      }
      const candidateId =
        (preferredBranchId && branchList.some((b: any) => b.id === preferredBranchId))
          ? preferredBranchId
          : (selectedBranchId && branchList.some((b: any) => b.id === selectedBranchId))
            ? selectedBranchId
            : branchList[0].id;
      setSelectedBranchId(candidateId);
      hydrateGeofenceForm(candidateId, branchList);
    } catch (error) {
      console.error('Error loading branches for geofence:', error);
    }
  };

  useEffect(() => {
    const editable = ['admin', 'ceo', 'director', 'hr'].includes(userRole || '');
    setCanEdit(editable);
    console.log('[Settings] User role:', userRole, 'Can edit:', editable);
    if (user) {
      fetchOrganization();
    }
    refreshAttendanceSettings();
    if (editable) {
      loadBranchHierarchy();
      fetchSslConfig();
      // Load AI config for HR, CEO, and Admin
      if (userRole === 'hr' || userRole === 'ceo' || userRole === 'admin') {
        console.log('[Settings] Loading AI config for role:', userRole);
        loadAIConfig();
      } else {
        console.log('[Settings] Not loading AI config. Role:', userRole, 'Required: hr, ceo, or admin');
      }
    } else {
      setBranches([]);
      setSelectedBranchId("");
    }
  }, [user, userRole, refreshAttendanceSettings]);

  const fetchSslConfig = async () => {
    try {
      setSslLoading(true);
      const isHttps = window.location.protocol === 'https:';
      setSslConfig({
        enabled: isHttps,
        status: isHttps ? 'enabled' : 'disabled',
      });
    } catch (error) {
      console.error('Error fetching SSL config:', error);
      const isHttps = window.location.protocol === 'https:';
      setSslConfig({
        enabled: isHttps,
        status: isHttps ? 'enabled' : 'disabled',
      });
    } finally {
      setSslLoading(false);
    }
  };

  const loadAIConfig = async () => {
    try {
      setAiConfigLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/ai/settings`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setAiConfig(data.configuration || {
          enabled: true,
          can_access_projects: true,
          can_access_timesheets: true,
          can_access_leaves: true,
          can_access_attendance: true,
          can_access_expenses: true,
          can_access_onboarding: true,
          can_access_payroll: true,
          can_access_analytics: true,
          can_access_employee_directory: true,
          can_access_notifications: true,
        });
      }
    } catch (error) {
      console.error('Error loading AI config:', error);
    } finally {
      setAiConfigLoading(false);
    }
  };

  const saveAIConfig = async () => {
    if (!aiConfig) return;
    
    try {
      setAiConfigSaving(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/ai/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify(aiConfig),
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "AI configuration saved successfully",
        });
      } else {
        throw new Error('Failed to save AI configuration');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save AI configuration",
        variant: "destructive",
      });
    } finally {
      setAiConfigSaving(false);
    }
  };

  useEffect(() => {
    if (attendanceSettings) {
      const metadata = attendanceSettings.metadata || {};
      setAttendanceState({
        capture_method: attendanceSettings.capture_method || "timesheets",
        enable_geofence: Boolean(attendanceSettings.enable_geofence),
        enable_kiosk: Boolean(attendanceSettings.enable_kiosk),
        kiosk_pin: metadata.kiosk_pin || "",
        kiosk_label: metadata.kiosk_label || "",
      });
    }
  }, [attendanceSettings]);

  const fetchOrganization = async () => {
    try {
      const org = await api.getOrganization();
      if (org) {
        setOrganization(org);
        setOrgName(org.name || "");
        setLogoPreview(org.logo_url || "");
      }
    } catch (error: any) {
      console.error('Error fetching organization:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch organization details",
        variant: "destructive",
      });
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast({
        title: "Access denied",
        description: "Only Admin, CEO, Director, or HR can update organization settings.",
        variant: "destructive",
      });
      return;
    }

    if (!orgName.trim()) {
      toast({
        title: "Validation error",
        description: "Organization name is required.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const updateData: { name?: string; logo?: File } = {
        name: orgName.trim(),
      };

      if (logoFile) {
        updateData.logo = logoFile;
      }

      const updatedOrg = await api.updateOrganization(updateData);

      toast({
        title: "Settings updated",
        description: "Organization settings have been saved successfully.",
      });

      // Update local state
      setOrganization(updatedOrg);
      setLogoPreview(updatedOrg.logo_url || "");
      setLogoFile(null); // Clear file input
      
      // Refresh organization data
      fetchOrganization();
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update organization settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBranch = (value: string) => {
    setSelectedBranchId(value);
    hydrateGeofenceForm(value);
  };

  const handleGeofenceInputChange = (field: keyof typeof geofenceForm, value: string) => {
    setGeofenceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGeofenceSave = async () => {
    if (!canEdit) {
      toast({
        title: "Access denied",
        description: "Only Admin, CEO, Director, or HR can configure geofencing.",
        variant: "destructive",
      });
      return;
    }
    if (!selectedBranchId) {
      toast({
        title: "Select a branch",
        description: "Choose a branch before saving geofence coordinates.",
        variant: "destructive",
      });
      return;
    }
    const latNum = parseFloat(geofenceForm.lat);
    const lngNum = parseFloat(geofenceForm.lng);
    const radiusNum = parseFloat(geofenceForm.radius);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || !Number.isFinite(radiusNum)) {
      toast({
        title: "Invalid coordinates",
        description: "Latitude, longitude, and radius must be numeric values.",
        variant: "destructive",
      });
      return;
    }
    if (radiusNum <= 0) {
      toast({
        title: "Radius too small",
        description: "Enter a radius greater than zero (in meters).",
        variant: "destructive",
      });
      return;
    }
    setGeofenceSaving(true);
    try {
      await api.updateBranchGeofence(selectedBranchId, {
        lat: latNum,
        lng: lngNum,
        radius: radiusNum,
        label: geofenceForm.label,
      });
      toast({
        title: "Geofence saved",
        description: "Branch geofence updated.",
      });
      await loadBranchHierarchy(selectedBranchId);
    } catch (error: any) {
      toast({
        title: "Failed to save geofence",
        description: error?.message || "Unable to save geofence for this branch.",
        variant: "destructive",
      });
    } finally {
      setGeofenceSaving(false);
    }
  };

  const handleGeofenceClear = async () => {
    if (!selectedBranchId) return;
    setGeofenceSaving(true);
    try {
      await api.updateBranchGeofence(selectedBranchId, { clear: true });
      toast({
        title: "Geofence cleared",
        description: "The geofence for this branch has been removed.",
      });
      await loadBranchHierarchy(selectedBranchId);
    } catch (error: any) {
      toast({
        title: "Failed to clear geofence",
        description: error?.message || "Unable to clear geofence for this branch.",
        variant: "destructive",
      });
    } finally {
      setGeofenceSaving(false);
    }
  };

  const handleAttendanceSave = async () => {
    if (!canEdit) {
      toast({
        title: "Access denied",
        description: "Only Admin, CEO, Director, or HR can update attendance settings.",
        variant: "destructive",
      });
      return;
    }
    setAttendanceSaving(true);
    try {
      await api.updateAttendanceSettings({
        capture_method: attendanceState.capture_method,
        enable_geofence: attendanceState.enable_geofence,
        enable_kiosk: attendanceState.enable_kiosk,
        metadata: {
          kiosk_pin: attendanceState.kiosk_pin || null,
          kiosk_label: attendanceState.kiosk_label || null,
        },
      });
      await refreshAttendanceSettings();
      toast({
        title: "Attendance mode updated",
        description:
          attendanceState.capture_method === "clock_in_out"
            ? "Clock in/out is now active across your organization."
            : "Timesheets are now the default capture method.",
      });
    } catch (error: any) {
      toast({
        title: "Update failed",
        description: error.message || "Unable to save attendance settings",
        variant: "destructive",
      });
    } finally {
      setAttendanceSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your organization settings and preferences</p>
        </div>

        <div className="grid gap-6">
          {canEdit && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Organization Setup</CardTitle>
                  <CardDescription>
                    Edit your organization's company information, structure, and settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/settings/organization-setup'}
                  >
                    Edit Organization Setup
                  </Button>
                </CardContent>
              </Card>

              {(userRole === 'hr' || userRole === 'ceo' || userRole === 'admin') && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle>Organization Rules</CardTitle>
                      <CardDescription>
                        Configure employment rules, probation policies, and organizational policies
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="outline"
                        onClick={() => window.location.href = '/settings/organization-rules'}
                      >
                        Manage Organization Rules
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        <CardTitle>AI Assistant Configuration</CardTitle>
                      </div>
                      <CardDescription>
                        Configure what data the AI Assistant can access. Changes apply to both AI Assistant and AI Conversation.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {aiConfigLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <Label htmlFor="ai-enabled">Enable AI Assistant</Label>
                                <p className="text-sm text-muted-foreground">
                                  Turn AI Assistant on or off for your organization
                                </p>
                              </div>
                              <Switch
                                id="ai-enabled"
                                checked={aiConfig?.enabled ?? true}
                                onCheckedChange={(checked) =>
                                  setAiConfig({ ...aiConfig, enabled: checked })
                                }
                              />
                            </div>

                            <div className="border-t pt-4 space-y-4">
                              <h4 className="font-medium text-sm">Data Access Permissions</h4>
                              <p className="text-sm text-muted-foreground">
                                Select which modules the AI Assistant can access:
                              </p>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                  { key: 'can_access_projects', label: 'Projects', description: 'Access project information and assignments' },
                                  { key: 'can_access_timesheets', label: 'Timesheets', description: 'Access timesheet data and approvals' },
                                  { key: 'can_access_leaves', label: 'Leaves', description: 'Access leave requests and balances' },
                                  { key: 'can_access_attendance', label: 'Attendance', description: 'Access attendance records and clock-in/out data' },
                                  { key: 'can_access_expenses', label: 'Expenses', description: 'Access expense reports and reimbursements' },
                                  { key: 'can_access_onboarding', label: 'Onboarding', description: 'Access onboarding status and new joinees' },
                                  { key: 'can_access_payroll', label: 'Payroll', description: 'Access payroll information and payslips' },
                                  { key: 'can_access_analytics', label: 'Analytics', description: 'Access analytics and KPI data' },
                                  { key: 'can_access_employee_directory', label: 'Employee Directory', description: 'Access employee information and directory' },
                                  { key: 'can_access_notifications', label: 'Notifications', description: 'Send alerts and notifications' },
                                ].map((item) => (
                                  <div
                                    key={item.key}
                                    className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                                  >
                                    <div className="flex items-center h-5 mt-0.5">
                                      <Checkbox
                                        id={item.key}
                                        checked={aiConfig?.[item.key] ?? true}
                                        onCheckedChange={(checked) =>
                                          setAiConfig({
                                            ...aiConfig,
                                            [item.key]: checked,
                                          })
                                        }
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <Label
                                        htmlFor={item.key}
                                        className="text-sm font-medium cursor-pointer"
                                      >
                                        {item.label}
                                      </Label>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {item.description}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end pt-4 border-t">
                            <Button
                              onClick={saveAIConfig}
                              disabled={aiConfigSaving}
                              className="gap-2"
                            >
                              {aiConfigSaving ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <Check className="h-4 w-4" />
                                  Save Changes
                                </>
                              )}
                            </Button>
                        </div>
                      </>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Organization Branding</CardTitle>
              <CardDescription>
                {canEdit 
                  ? "Customize your organization's name and logo" 
                  : "Only Admin, CEO, Director, or HR can modify organization branding"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    disabled={!canEdit || isLoading}
                    placeholder="Your Organization Name"
                  />
              </div>

              <div className="space-y-4">
                <Label>Organization Logo</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 rounded-lg">
                    <AvatarImage src={logoPreview} alt={orgName} />
                    <AvatarFallback className="rounded-lg bg-primary/10">
                      <Building2 className="h-10 w-10 text-primary" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Input
                      id="logo"
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                      onChange={handleLogoChange}
                      disabled={!canEdit || isLoading}
                      className="hidden"
                    />
                    <Label
                      htmlFor="logo"
                      className={`flex items-center gap-2 ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canEdit || isLoading}
                        onClick={() => canEdit && document.getElementById('logo')?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {logoFile ? 'Change Logo' : 'Upload Logo'}
                      </Button>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-2">
                      PNG, JPG or WEBP. Max 5MB.
                    </p>
                  </div>
                </div>
              </div>

              {canEdit && (
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Mode</CardTitle>
              <CardDescription>
                Control how employees submit their time—switch between classic timesheets and live clock in/out.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Capture method</Label>
                <RadioGroup
                  value={attendanceState.capture_method}
                  onValueChange={(value) => {
                    if (!canEdit) return;
                    setAttendanceState((prev) => ({
                      ...prev,
                      capture_method: value as "timesheets" | "clock_in_out",
                    }));
                  }}
                  className="grid gap-4 md:grid-cols-2"
                >
                  <div
                    className={`border rounded-lg p-4 space-y-2 ${
                      attendanceState.capture_method === "timesheets" ? "border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="timesheets" id="attendance-timesheets" disabled={!canEdit} />
                      <Label htmlFor="attendance-timesheets" className="font-semibold">
                        Timesheets (default)
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Keep weekly timesheets as the primary capture workflow.
                    </p>
                  </div>
                  <div
                    className={`border rounded-lg p-4 space-y-2 ${
                      attendanceState.capture_method === "clock_in_out" ? "border-primary" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="clock_in_out" id="attendance-clock" disabled={!canEdit} />
                      <Label htmlFor="attendance-clock" className="font-semibold">
                        Clock In / Clock Out
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Let people punch in via kiosk or mobile. Timesheets continue to auto-generate.
                    </p>
                  </div>
                </RadioGroup>
              </div>

              {attendanceState.capture_method === "clock_in_out" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Geofencing</p>
                      <p className="text-xs text-muted-foreground">Restrict punches to approved coordinates.</p>
                    </div>
                    <Switch
                      disabled={!canEdit || attendanceSaving}
                      checked={attendanceState.enable_geofence}
                      onCheckedChange={(checked) => {
                        if (!canEdit) return;
                        setAttendanceState((prev) => ({ ...prev, enable_geofence: checked }));
                      }}
                    />
                  </div>
                  <div className="border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Kiosk mode</p>
                      <p className="text-xs text-muted-foreground">Allow shared tablets to capture attendance.</p>
                    </div>
                    <Switch
                      disabled={!canEdit || attendanceSaving}
                      checked={attendanceState.enable_kiosk}
                      onCheckedChange={(checked) => {
                        if (!canEdit) return;
                        setAttendanceState((prev) => ({ ...prev, enable_kiosk: checked }));
                      }}
                    />
                  </div>
                </div>
              )}

              {attendanceState.capture_method === "clock_in_out" && attendanceState.enable_kiosk && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Kiosk label</Label>
                    <Input
                      value={attendanceState.kiosk_label}
                      onChange={(e) =>
                        setAttendanceState((prev) => ({ ...prev, kiosk_label: e.target.value }))
                      }
                      placeholder="e.g., Front Desk Tablet"
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Kiosk PIN</Label>
                    <Input
                      value={attendanceState.kiosk_pin}
                      onChange={(e) =>
                        setAttendanceState((prev) => ({ ...prev, kiosk_pin: e.target.value }))
                      }
                      placeholder="Optional PIN to unlock kiosk"
                      disabled={!canEdit}
                    />
                    <p className="text-xs text-muted-foreground">
                      Share this PIN with the kiosk attendant if you want to restrict access.
                    </p>
                  </div>
                </div>
              )}

              {attendanceState.capture_method === "clock_in_out" && attendanceState.enable_geofence && (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-sm">Branch geofence</p>
                      <p className="text-xs text-muted-foreground">
                        Configure latitude, longitude, and a radius in meters for each branch.
                      </p>
                    </div>
                    <div className="w-full md:w-60">
                      <Select
                        value={selectedBranchId || undefined}
                        onValueChange={handleSelectBranch}
                        disabled={!canEdit || branches.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                              {branch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {branches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Add at least one branch before configuring geofencing.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Latitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={geofenceForm.lat}
                            onChange={(e) => handleGeofenceInputChange("lat", e.target.value)}
                            disabled={!canEdit || geofenceSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Longitude</Label>
                          <Input
                            type="number"
                            step="0.000001"
                            value={geofenceForm.lng}
                            onChange={(e) => handleGeofenceInputChange("lng", e.target.value)}
                            disabled={!canEdit || geofenceSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Radius (meters)</Label>
                          <Input
                            type="number"
                            min="10"
                            value={geofenceForm.radius}
                            onChange={(e) => handleGeofenceInputChange("radius", e.target.value)}
                            disabled={!canEdit || geofenceSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Label / Notes</Label>
                          <Input
                            value={geofenceForm.label}
                            onChange={(e) => handleGeofenceInputChange("label", e.target.value)}
                            placeholder="Optional label shown in reports"
                            disabled={!canEdit || geofenceSaving}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button
                          onClick={handleGeofenceSave}
                          disabled={!canEdit || geofenceSaving}
                        >
                          {geofenceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Geofence
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleGeofenceClear}
                          disabled={!canEdit || geofenceSaving}
                        >
                          Clear Geofence
                        </Button>
                        {geofenceUpdatedAt && (
                          <p className="text-xs text-muted-foreground self-center">
                            Last updated {new Date(geofenceUpdatedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {canEdit ? (
                <Button onClick={handleAttendanceSave} disabled={attendanceSaving}>
                  {attendanceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Attendance Settings
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only Admin, CEO, Director, or HR can modify attendance preferences.
                </p>
              )}
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  SSL/HTTPS Configuration
                </CardTitle>
                <CardDescription>
                  Configure SSL/HTTPS for secure connections. See documentation for setup instructions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {sslConfig.status === 'enabled' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400" />
                      )}
                      <div>
                        <p className="font-medium">SSL/HTTPS Status</p>
                        <p className="text-sm text-muted-foreground">
                          {sslConfig.status === 'enabled' 
                            ? 'SSL is enabled and active' 
                            : 'SSL is disabled or not configured'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono text-muted-foreground">
                        {window.location.protocol}//{window.location.host}
                      </p>
                    </div>
                  </div>

                  {sslConfig.status === 'enabled' && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        ✓ Your connection is secure. SSL/HTTPS is properly configured.
                      </p>
                    </div>
                  )}

                  {sslConfig.status === 'disabled' && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                        ⚠ SSL/HTTPS is not enabled. Your connection is not encrypted.
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        For production environments, enable SSL/HTTPS to protect sensitive data.
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">Configuration Files</Label>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded">
                          <span className="text-muted-foreground">Nginx Config:</span>
                          <code className="text-xs">nginx/nginx.conf</code>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded">
                          <span className="text-muted-foreground">SSL Certificates:</span>
                          <code className="text-xs">nginx/ssl/</code>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded">
                          <span className="text-muted-foreground">Docker Compose:</span>
                          <code className="text-xs">docker-compose.ssl.yml</code>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => window.open('/docs/SSL_HTTPS_SETUP.md', '_blank')}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Setup Guide
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.open('/docs/SSL_QUICK_START.md', '_blank')}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Quick Start
                      </Button>
                      <Button
                        variant="outline"
                        onClick={fetchSslConfig}
                        disabled={sslLoading}
                        className="flex items-center gap-2"
                      >
                        {sslLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Refresh Status
                      </Button>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                      <p className="text-xs font-semibold mb-2">Quick Setup Commands:</p>
                      <div className="space-y-1 text-xs font-mono">
                        <div className="p-2 bg-white dark:bg-slate-800 rounded">
                          <span className="text-muted-foreground"># Generate certificates:</span>
                          <br />
                          <span className="text-blue-600 dark:text-blue-400">.\nginx\ssl-setup.ps1</span>
                        </div>
                        <div className="p-2 bg-white dark:bg-slate-800 rounded">
                          <span className="text-muted-foreground"># Start with SSL:</span>
                          <br />
                          <span className="text-blue-600 dark:text-blue-400">docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>Your personal account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={userRole?.toUpperCase() || ''} disabled />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
