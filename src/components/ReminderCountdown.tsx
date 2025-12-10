import { useState, useEffect, useRef } from "react";
import { Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Reminder {
  id: string;
  remind_at: string;
  message: string;
  source_memo_text: string;
  created_at: string;
}

export function ReminderCountdown() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [timeDisplay, setTimeDisplay] = useState<{ minutes: string; seconds: string } | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasPlayedSoundRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    // Fetch immediately
    fetchReminders();

    // Poll for reminders every 2 seconds for more responsive updates
    const interval = setInterval(() => {
      fetchReminders();
    }, 2000);

    // Listen for custom event when reminders are created
    const handleReminderCreated = () => {
      // Small delay to ensure backend has processed the reminder
      setTimeout(() => {
        fetchReminders();
      }, 500);
    };

    window.addEventListener('reminder-created', handleReminderCreated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('reminder-created', handleReminderCreated);
    };
  }, [user]);

  useEffect(() => {
    // Update countdown every second
    const interval = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [reminders]);

  const fetchReminders = async () => {
    if (!user) return;

    try {
      const data = await api.getActiveReminders();
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    }
  };

  const handleCancelReminder = async (reminderId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent popover from closing
    
    try {
      await api.cancelReminder(reminderId);
      // Remove from local state immediately
      setReminders((prev) => prev.filter((r) => r.id !== reminderId));
      toast({
        title: "Reminder cancelled",
        description: "The reminder has been cancelled.",
      });
    } catch (error: any) {
      console.error('Error cancelling reminder:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel reminder",
        variant: "destructive",
      });
    }
  };

  const updateCountdown = () => {
    if (reminders.length === 0) {
      setTimeLeft("");
      setTimeDisplay(null);
      return;
    }

    // Get the nearest reminder
    const nearestReminder = reminders[0];
    const remindAt = new Date(nearestReminder.remind_at);
    const now = new Date();
    const diff = remindAt.getTime() - now.getTime();

    if (diff <= 0) {
      // Time is up!
      if (!hasPlayedSoundRef.current.has(nearestReminder.id)) {
        playSound();
        hasPlayedSoundRef.current.add(nearestReminder.id);
        
        toast({
          title: "Reminder",
          description: nearestReminder.message || "Your reminder is up!",
        });

        // Remove this reminder from the list after a short delay
        setTimeout(() => {
          setReminders((prev) => prev.filter((r) => r.id !== nearestReminder.id));
          hasPlayedSoundRef.current.delete(nearestReminder.id);
        }, 2000);
      }
      setTimeLeft("Now!");
      setTimeDisplay(null);
      return;
    }

    // Format time remaining
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Set display format for cleaner UI
    if (hours > 0) {
      setTimeLeft(`${hours}h ${minutes}m`);
      setTimeDisplay(null);
    } else {
      // Show minutes and seconds separately for cleaner display
      setTimeLeft(`${minutes}m ${seconds}s`);
      setTimeDisplay({
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0')
      });
    }
  };

  const playSound = () => {
    try {
      // Create audio context for beep beep sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Play two short beeps
      const playBeep = (startTime: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = 800; // Beep frequency

        gainNode.gain.setValueAtTime(0, audioContext.currentTime + startTime);
        gainNode.gain.linearRampToValueAtTime(0.4, audioContext.currentTime + startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + startTime + 0.15);

        oscillator.start(audioContext.currentTime + startTime);
        oscillator.stop(audioContext.currentTime + startTime + 0.15);
      };

      // Play two beeps: beep beep
      playBeep(0); // First beep
      playBeep(0.2); // Second beep (after 200ms)
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  };

  // Don't render if no active reminders
  if (reminders.length === 0) {
    return null;
  }

  const nearestReminder = reminders[0];
  const remindAt = new Date(nearestReminder.remind_at);

  return (
    <>
      {/* Hidden audio element for fallback */}
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }}>
        <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURQNUqzn77BdGAg+ltryy3kpBSl+zfLZkD8KFF+16+2pVhQKTqDg8r5sIQUxh9Hz04IzBh5uwO/jmVEUDVKs5++wXRgIPpba8st5KQU" type="audio/wav" />
      </audio>

      <Popover>
        <PopoverTrigger asChild>
          <div className="relative inline-block group">
            <button
              className="relative h-9 w-auto min-w-[60px] flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-md bg-amber-50/50 border border-amber-200/50 hover:bg-amber-50 hover:border-amber-300 transition-all duration-300 focus:outline-none"
              title={`Reminder in ${timeLeft}`}
            >
              {/* Timer icon - simple and clean */}
              <Timer className="h-4 w-4 text-slate-700" />
              
              {/* Countdown text - bold black, clean format */}
              {timeDisplay ? (
                <div className="flex items-baseline gap-0.5 leading-none">
                  <span className="text-[11px] font-bold text-black">{timeDisplay.minutes}</span>
                  <span className="text-[9px] font-bold text-black opacity-60">m</span>
                  <span className="text-[11px] font-bold text-black">{timeDisplay.seconds}</span>
                  <span className="text-[9px] font-bold text-black opacity-60">s</span>
                </div>
              ) : timeLeft ? (
                <span className="text-[10px] font-bold text-black leading-none">
                  {timeLeft}
                </span>
              ) : null}
            </button>
            
            {/* Cancel button - appears on hover */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCancelReminder(nearestReminder.id, e);
              }}
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 shadow-sm"
              title="Cancel reminder"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X className="h-2.5 w-2.5 text-white" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Timer className="h-4 w-4 text-amber-600" />
                Active Reminders
              </h3>
            </div>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No active reminders
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {reminders.map((reminder) => {
                  const remindAtDate = new Date(reminder.remind_at);
                  const now = new Date();
                  const diff = remindAtDate.getTime() - now.getTime();
                  const isDue = diff <= 0;
                  
                  return (
                    <div
                      key={reminder.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isDue
                          ? 'bg-amber-50 border-amber-200 animate-pulse'
                          : 'bg-background border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{reminder.message || "Reminder"}</p>
                          {reminder.source_memo_text && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{reminder.source_memo_text}"
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Timer className="h-3 w-3 text-amber-600" />
                            <p className={`text-xs font-medium ${
                              isDue ? 'text-amber-700' : 'text-muted-foreground'
                            }`}>
                              {isDue 
                                ? "Due now!" 
                                : formatDistanceToNow(remindAtDate, { addSuffix: true })
                              }
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isDue && (
                            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0 mt-1" />
                          )}
                          <button
                            onClick={(e) => handleCancelReminder(reminder.id, e)}
                            className="h-6 w-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors flex-shrink-0"
                            title="Cancel reminder"
                          >
                            <X className="h-3 w-3 text-white" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

