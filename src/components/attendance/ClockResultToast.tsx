import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { MapPin, CheckCircle2, AlertCircle } from "lucide-react";

interface ClockResultToastProps {
  action: 'IN' | 'OUT';
  workType: 'WFO' | 'WFH';
  branchName?: string;
  address?: string;
  timestamp: string;
  error?: string;
}

export function useClockResultToast() {
  const { toast } = useToast();

  const showSuccess = (props: ClockResultToastProps) => {
    const time = new Date(props.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const locationText = props.workType === 'WFO' && props.branchName
      ? `${props.workType} (${props.branchName})`
      : props.workType;

    toast({
      title: `Clocked ${props.action === 'IN' ? 'in' : 'out'} at ${time}`,
      description: (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            <span className="text-sm font-medium">{locationText}</span>
          </div>
          {props.address && (
            <p className="text-xs text-muted-foreground">{props.address}</p>
          )}
        </div>
      ),
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    });
  };

  const showError = (error: string) => {
    toast({
      title: "Clock action failed",
      description: error,
      variant: "destructive",
      icon: <AlertCircle className="h-4 w-4" />,
    });
  };

  return { showSuccess, showError };
}


