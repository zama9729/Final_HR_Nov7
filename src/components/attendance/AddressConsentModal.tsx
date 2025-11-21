import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddressConsentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: {
    lat?: number;
    lon?: number;
    address_text: string;
    capture_method: 'geo' | 'manual' | 'kiosk' | 'unknown';
    consent: boolean;
  }) => void;
  action: 'IN' | 'OUT';
}

export function AddressConsentModal({
  open,
  onClose,
  onConfirm,
  action,
}: AddressConsentModalProps) {
  const [consentGiven, setConsentGiven] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [geoData, setGeoData] = useState<{
    lat: number;
    lon: number;
    address: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setConsentGiven(false);
      setLoading(false);
      setError(null);
      setManualAddress("");
      setUseManual(false);
      setGeoData(null);
    }
  }, [open]);

  const handleAllow = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!("geolocation" in navigator)) {
        setError("Geolocation is not supported by your browser.");
        setUseManual(true);
        setLoading(false);
        return;
      }

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
      });

      const { latitude, longitude } = position.coords;
      
      // Try to reverse geocode to get address
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18`,
          {
            headers: {
              'User-Agent': 'HR-Suite/1.0'
            }
          }
        );
        const data = await response.json();
        const address = data.display_name || `${latitude}, ${longitude}`;
        
        setGeoData({ lat: latitude, lon: longitude, address });
        setConsentGiven(true);
      } catch (geocodeError) {
        // Use coordinates as fallback
        setGeoData({
          lat: latitude,
          lon: longitude,
          address: `${latitude}, ${longitude}`,
        });
        setConsentGiven(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to get location. Please enter address manually.");
      setUseManual(true);
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = () => {
    setUseManual(true);
    setConsentGiven(false);
  };

  const handleManualSubmit = () => {
    if (!manualAddress.trim()) {
      setError("Please enter an address");
      return;
    }

    onConfirm({
      address_text: manualAddress.trim(),
      capture_method: 'manual',
      consent: false,
    });
  };

  const handleConfirmWithGeo = () => {
    if (!geoData) return;

    onConfirm({
      lat: geoData.lat,
      lon: geoData.lon,
      address_text: geoData.address,
      capture_method: 'geo',
      consent: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Location Permission Required</DialogTitle>
          <DialogDescription>
            To record your attendance, we need to capture your current location.
            This helps determine whether you're working from office (WFO) or from home (WFH).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!useManual && !consentGiven && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Address will be saved for attendance audit and may be used to determine WFO / WFH status.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleAllow}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Allow
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDeny}
                  variant="outline"
                  disabled={loading}
                  className="flex-1"
                >
                  Deny
                </Button>
              </div>
            </div>
          )}

          {useManual && !consentGiven && (
            <div className="space-y-3">
              <Label htmlFor="manual-address">Enter your address manually</Label>
              <Input
                id="manual-address"
                placeholder="e.g., MG Road, Bangalore, Karnataka"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleManualSubmit();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                The address will be used to determine your work location.
              </p>
            </div>
          )}

          {consentGiven && geoData && (
            <div className="space-y-3">
              <Alert>
                <MapPin className="h-4 w-4" />
                <AlertDescription>
                  <strong>Location detected:</strong>
                  <br />
                  {geoData.address}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter>
          {useManual && !consentGiven && (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleManualSubmit} disabled={!manualAddress.trim()}>
                Confirm
              </Button>
            </>
          )}

          {consentGiven && geoData && (
            <>
              <Button variant="outline" onClick={() => setUseManual(true)}>
                Use Manual Address
              </Button>
              <Button onClick={handleConfirmWithGeo}>
                Confirm Location
              </Button>
            </>
          )}

          {!useManual && !consentGiven && !loading && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


