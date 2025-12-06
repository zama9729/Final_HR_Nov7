import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { parseSmartMemo, extractReminders, ParsedEntry } from "@/utils/smartMemoParser";
import { format } from "date-fns";
import { Calendar, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SmartMemoProps {
  selectedDate: Date;
  onEventsCreated?: () => void;
}

export function SmartMemo({ selectedDate, onEventsCreated }: SmartMemoProps) {
  const [memoText, setMemoText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<ParsedEntry[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const handlePreview = () => {
    const { cleanedText, reminders } = extractReminders(memoText, new Date());
    const entries = parseSmartMemo(cleanedText, selectedDate);
    
    if (entries.length === 0 && reminders.length === 0) {
      toast({
        title: "No entries found",
        description: "Please enter time ranges in format: 11-12 in meeting, 13-15 worked on issues",
        variant: "destructive",
      });
      return;
    }
    
    setPreviewEntries(entries);
    setShowPreview(true);
  };

  const handleSave = async () => {
    if (!memoText.trim()) {
      toast({
        title: "Empty memo",
        description: "Please enter some text",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { cleanedText, reminders } = extractReminders(memoText, new Date());
      const entries = parseSmartMemo(cleanedText, selectedDate);
      
      if (entries.length === 0 && reminders.length === 0) {
        toast({
          title: "No valid entries",
          description: "Could not parse any time ranges or reminders from the text",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      // Save to backend
      const result = await api.saveSmartMemo({
        memoText: memoText,
        baseDate: format(selectedDate, "yyyy-MM-dd"),
      });

      toast({
        title: "Saved successfully",
        description: `Created ${result.events?.length || 0} calendar event(s) and ${result.reminders?.length || 0} reminder(s)`,
      });

      // Trigger event to refresh reminder countdown immediately
      if (result.reminders && result.reminders.length > 0) {
        window.dispatchEvent(new CustomEvent('reminder-created'));
      }

      setMemoText("");
      setPreviewEntries([]);
      setShowPreview(false);
      
      if (onEventsCreated) {
        onEventsCreated();
      }
    } catch (error: any) {
      console.error("Error saving smart memo:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save memo",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Smart Memo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Textarea
              placeholder="Example: 11-12 in meeting, 13-15 worked on fixing issues&#10;remind me in 30 minutes"
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: HH-HH description or HH:MM-HH:MM description. Add reminders: "remind me in X minutes/hours"
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              variant="outline"
              size="sm"
              disabled={!memoText.trim() || isProcessing}
            >
              Preview
            </Button>
            <Button
              onClick={handleSave}
              size="sm"
              disabled={!memoText.trim() || isProcessing}
              className="flex-1"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Save to Calendar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preview - {format(selectedDate, "MMM d, yyyy")}</DialogTitle>
            <DialogDescription>
              Review the events that will be created
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {previewEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No calendar entries found</p>
            ) : (
              previewEntries.map((entry, idx) => (
                <div key={idx} className="p-3 border rounded-lg">
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{entry.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(entry.startDateTime, "HH:mm")} - {format(entry.endDateTime, "HH:mm")}
                      </p>
                      <p className="text-xs text-muted-foreground italic mt-1">
                        "{entry.sourceText}"
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

