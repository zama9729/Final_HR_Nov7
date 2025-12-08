import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface CountdownOverlayProps {
  onComplete: () => void;
}

export function CountdownOverlay({ onComplete }: CountdownOverlayProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="text-center space-y-8">
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground">
          Setting up your organisation
        </h1>
        
        {/* Circular loader with countdown */}
        <div className="relative w-32 h-32 mx-auto">
          {/* Outer circle */}
          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted opacity-20"
            />
            {/* Animated progress circle */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              className="text-primary transition-all duration-1000 ease-linear"
              strokeDasharray={`${(5 - countdown) * 67.86} 339.29`}
            />
          </svg>
          
          {/* Countdown number */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-primary">{countdown}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

