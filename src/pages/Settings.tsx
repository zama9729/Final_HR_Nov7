import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Building2, Upload, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
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
    if (user) {
      fetchOrganization();
    }
    refreshAttendanceSettings();
    if (editable) {
      loadBranchHierarchy();
    } else {
      setBranches([]);
      setSelectedBranchId("");
    }
  }, [user, userRole, refreshAttendanceSettings]);

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
