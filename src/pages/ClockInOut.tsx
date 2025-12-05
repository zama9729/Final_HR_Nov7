import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Clock, MapPin, LogIn, LogOut, Home, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { AddressConsentModal } from "@/components/attendance/AddressConsentModal";
import { useClockResultToast } from "@/components/attendance/ClockResultToast";

interface ClockSession {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  duration_minutes: number | null;
  device_in: string | null;
  device_out: string | null;
  work_type?: string | null;
  geo_in?: { lat?: number; lng?: number };
  geo_out?: { lat?: number; lng?: number };
}

interface ClockStatusResponse {
  tenant_id: string;
  employee_id: string;
  capture_method: string;
  enable_geofence: boolean;
  enable_kiosk: boolean;
  is_clock_mode: boolean;
  is_clocked_in: boolean;
  open_session: ClockSession | null;
  sessions: ClockSession[];
}

const ClockInOut = () => {
  const { toast } = useToast();
  const { showSuccess, showError } = useClockResultToast();
  const { attendanceSettings } = useOrgSetup();
  const [status, setStatus] = useState<ClockStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'IN' | 'OUT' | null>(null);

  const captureMethod = useMemo(
    () => attendanceSettings?.capture_method || status?.capture_method || "timesheets",
    [attendanceSettings?.capture_method, status?.capture_method]
  );

  const isClockMode = captureMethod === "clock_in_out";

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getClockStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load clock status");
    } finally {
      setLoading(false);
    }
  };

  const handlePunchClick = () => {
    if (!status) return;
    const action = status.is_clocked_in ? "OUT" : "IN";
    
    // Always use new clock API with geolocation and consent
    setPendingAction(action);
    setShowConsentModal(true);
  };

  const handleConsentConfirm = async (data: {
    lat?: number;
    lon?: number;
    address_text: string;
    capture_method: 'geo' | 'manual' | 'kiosk' | 'unknown';
    consent: boolean;
  }) => {
    if (!pendingAction || !status) return;

    setShowConsentModal(false);
    setPunching(true);

    try {
      const result = await api.clock({
        action: pendingAction,
        ts: new Date().toISOString(),
        lat: data.lat,
        lon: data.lon,
        address_text: data.address_text,
        capture_method: data.capture_method,
        consent: data.consent,
      });

      showSuccess({
        action: pendingAction,
        workType: result.work_type,
        branchName: undefined, // Branch name can be fetched separately if needed
        address: data.address_text,
        timestamp: new Date().toISOString(),
      });

      await fetchStatus();
    } catch (err: any) {
      showError(err?.message || "Unable to record attendance");
    } finally {
      setPunching(false);
      setPendingAction(null);
    }
  };

  const handlePunchLegacy = async () => {
    if (!status) return;
    setPunching(true);
    try {
      const requestLocation = () =>
        new Promise<GeolocationPosition | undefined>((resolve) => {
          if (!("geolocation" in navigator)) {
            resolve(undefined);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos),
            () => resolve(undefined),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
          );
        });

      let geoPayload;
      if (status.enable_geofence) {
        const geo = await requestLocation();
        if (!geo) {
          toast({
            title: "Location required",
            description: "Please enable location access to record attendance.",
            variant: "destructive",
          });
          setPunching(false);
          return;
        }
        geoPayload = {
          lat: geo.coords.latitude,
          lng: geo.coords.longitude,
          accuracy: geo.coords.accuracy,
        };
      } else {
        const geo = await requestLocation();
        if (geo) {
          geoPayload = {
            lat: geo.coords.latitude,
            lng: geo.coords.longitude,
            accuracy: geo.coords.accuracy,
          };
        }
      }

      const type = status.is_clocked_in ? "OUT" : "IN";
      await api.clockPunch({
        type,
        location: geoPayload,
      });

      toast({
        title: type === "IN" ? "Clocked in" : "Clocked out",
        description: type === "IN" ? "Enjoy your workday!" : "Enjoy your time off!",
      });

      await fetchStatus();
    } catch (err: any) {
      toast({
        title: "Punch failed",
        description: err?.message || "Unable to record attendance",
        variant: "destructive",
      });
    } finally {
      setPunching(false);
    }
  };

  const formatTime = (value?: string | null) =>
    value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  const formatDate = (value?: string) =>
    value ? new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—";

  const formatDuration = (minutes?: number | null) => {
    if (!minutes || minutes <= 0) return "—";
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hrs) return `${mins}m`;
    if (!mins) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  };

  // Calculate WFH/WFO analytics
  const workTypeAnalytics = useMemo(() => {
    if (!status?.sessions || status.sessions.length === 0) {
      return { wfh: 0, wfo: 0, total: 0 };
    }

    const wfh = status.sessions.filter((s) => s.work_type === "WFH").length;
    const wfo = status.sessions.filter((s) => s.work_type === "WFO").length;
    const total = status.sessions.length;

    return { wfh, wfo, total };
  }, [status?.sessions]);

  if (!isClockMode) {
    return (
      <AppLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>Clock In / Out</CardTitle>
              <CardDescription>The organization is currently set to Timesheets mode.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Switch the attendance capture method to “Clock In / Clock Out” under Settings to use live punch tracking.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Clock className="h-7 w-7 text-primary" />
            Clock In / Out
          </h1>
          <p className="text-muted-foreground">Record your workday punches and review today’s activity.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-red-500">{error}</CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-col gap-4">
                  <div>
                    <CardTitle>Status</CardTitle>
                    <CardDescription>
                      {status?.is_clocked_in
                        ? "You are currently clocked in."
                        : "You are currently clocked out."}
                    </CardDescription>
                  </div>
                  {status?.enable_geofence && (
                    <Badge variant="secondary" className="w-fit flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Geofence enforced
                    </Badge>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between pt-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {status?.is_clocked_in
                        ? `Clocked in at ${formatTime(status?.open_session?.clock_in_at)}`
                        : "No open session"}
                    </p>
                    {status?.open_session?.device_in && (
                      <p className="text-xs text-muted-foreground">
                        Device: {status.open_session.device_in}
                      </p>
                    )}
                    {status?.open_session?.work_type && (
                      <Badge
                        variant={status.open_session.work_type === "WFO" ? "default" : "secondary"}
                        className="w-fit flex items-center gap-1"
                      >
                        {status.open_session.work_type === "WFO" ? (
                          <Building2 className="h-3 w-3" />
                        ) : (
                          <Home className="h-3 w-3" />
                        )}
                        {status.open_session.work_type}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="lg"
                    onClick={handlePunchClick}
                    disabled={punching || showConsentModal}
                    className={`w-full md:w-auto ${status?.is_clocked_in ? "bg-destructive hover:bg-destructive/90" : ""}`}
                  >
                    {punching ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Recording...
                      </>
                    ) : status?.is_clocked_in ? (
                      <>
                        <LogOut className="mr-2 h-4 w-4" />
                        Clock Out
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Clock In
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Work Location Analytics</CardTitle>
                  <CardDescription>WFH vs WFO distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  {workTypeAnalytics.total > 0 ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                        <Home className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Work From Home</p>
                          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {workTypeAnalytics.wfh}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                        <Building2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="text-xs text-muted-foreground">Work From Office</p>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {workTypeAnalytics.wfo}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No attendance data available yet.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent sessions</CardTitle>
                <CardDescription>Your last punches (latest first).</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Clock In</TableHead>
                      <TableHead>Clock Out</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Work Type</TableHead>
                      <TableHead>Devices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {status?.sessions && status.sessions.length > 0 ? (
                      status.sessions.map((session) => (
                        <TableRow key={session.id}>
                          <TableCell>{formatDate(session.clock_in_at)}</TableCell>
                          <TableCell>{formatTime(session.clock_in_at)}</TableCell>
                          <TableCell>{formatTime(session.clock_out_at)}</TableCell>
                          <TableCell>{formatDuration(session.duration_minutes)}</TableCell>
                          <TableCell>
                            {session.work_type ? (
                              <Badge
                                variant={session.work_type === "WFO" ? "default" : "secondary"}
                                className="flex items-center gap-1 w-fit"
                              >
                                {session.work_type === "WFO" ? (
                                  <Building2 className="h-3 w-3" />
                                ) : (
                                  <Home className="h-3 w-3" />
                                )}
                                {session.work_type}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {session.device_in && (
                              <span className="block">In: {session.device_in}</span>
                            )}
                            {session.device_out && (
                              <span className="block">Out: {session.device_out}</span>
                            )}
                            {!session.device_in && !session.device_out && "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                          No punches recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {showConsentModal && pendingAction && (
          <AddressConsentModal
            open={showConsentModal}
            onClose={() => {
              setShowConsentModal(false);
              setPendingAction(null);
            }}
            onConfirm={handleConsentConfirm}
            action={pendingAction}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default ClockInOut;

