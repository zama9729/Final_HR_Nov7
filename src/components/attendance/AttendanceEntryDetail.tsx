import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, User, Building2 } from "lucide-react";

interface AttendanceEntryDetailProps {
  entry: {
    id: string;
    action: 'IN' | 'OUT';
    timestamp: string;
    lat?: number;
    lon?: number;
    address_text?: string;
    capture_method: 'geo' | 'manual' | 'kiosk' | 'unknown';
    consent: boolean;
    consent_ts?: string;
    work_type: 'WFO' | 'WFH';
    branch_name?: string;
  };
}

export function AttendanceEntryDetail({ entry }: AttendanceEntryDetailProps) {
  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const getMapUrl = () => {
    if (entry.lat && entry.lon) {
      return `https://www.google.com/maps?q=${entry.lat},${entry.lon}`;
    }
    return null;
  };

  const captureMethodLabels = {
    geo: 'GPS Location',
    manual: 'Manual Entry',
    kiosk: 'Kiosk',
    unknown: 'Unknown',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Attendance Entry Details
        </CardTitle>
        <CardDescription>
          {formatTime(entry.timestamp)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={entry.action === 'IN' ? 'default' : 'secondary'}>
            {entry.action}
          </Badge>
          <Badge variant={entry.work_type === 'WFO' ? 'default' : 'outline'}>
            {entry.work_type}
          </Badge>
          {entry.branch_name && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {entry.branch_name}
            </Badge>
          )}
        </div>

        {entry.address_text && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Location
            </div>
            <p className="text-sm text-muted-foreground pl-6">
              {entry.address_text}
            </p>
            {getMapUrl() && (
              <a
                href={getMapUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline pl-6"
              >
                View on map
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Capture Method</p>
            <p className="font-medium">{captureMethodLabels[entry.capture_method]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Consent</p>
            <p className="font-medium">
              {entry.consent ? (
                <span className="text-green-600">Given</span>
              ) : (
                <span className="text-muted-foreground">Not given</span>
              )}
            </p>
          </div>
        </div>

        {entry.consent_ts && (
          <div className="text-xs text-muted-foreground">
            Consent recorded: {new Date(entry.consent_ts).toLocaleString()}
          </div>
        )}

        {entry.lat && entry.lon && (
          <div className="text-xs text-muted-foreground">
            Coordinates: {entry.lat.toFixed(6)}, {entry.lon.toFixed(6)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


