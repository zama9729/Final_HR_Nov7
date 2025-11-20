import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Clock, MapPin, LogIn, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useOrgSetup } from "@/contexts/OrgSetupContext";

interface ClockSession {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  duration_minutes: number | null;
  device_in: string | null;
  device_out: string | null;
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
  const { attendanceSettings } = useOrgSetup();
  const [status, setStatus] = useState<ClockStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [punching, setPunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handlePunch = async () => {
    if (!status) return;
    setPunching(true);
    try {
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
              <CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
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
                </div>
                <Button
                  size="lg"
                  onClick={handlePunch}
                  disabled={punching}
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
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
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
      </div>
    </AppLayout>
  );
};

export default ClockInOut;

