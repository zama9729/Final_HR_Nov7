import { useState, useEffect } from "react";
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
  });
  const [attendanceSaving, setAttendanceSaving] = useState(false);

  useEffect(() => {
    // Admin, CEO, Director, HR can edit
    setCanEdit(['admin', 'ceo', 'director', 'hr'].includes(userRole || ''));
    if (user) {
      fetchOrganization();
    }
    refreshAttendanceSettings();
  }, [user, userRole, refreshAttendanceSettings]);

  useEffect(() => {
    if (attendanceSettings) {
      setAttendanceState({
        capture_method: attendanceSettings.capture_method || "timesheets",
        enable_geofence: Boolean(attendanceSettings.enable_geofence),
        enable_kiosk: Boolean(attendanceSettings.enable_kiosk),
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
                      onCheckedChange={(checked) =>
                        setAttendanceState((prev) => ({ ...prev, enable_geofence: checked }))
                      }
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
                      onCheckedChange={(checked) =>
                        setAttendanceState((prev) => ({ ...prev, enable_kiosk: checked }))
                      }
                    />
                  </div>
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
