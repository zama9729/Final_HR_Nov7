import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { parseSmartMemo, extractReminders, ParsedEntry, extractMentions } from "@/utils/smartMemoParser";
import { format } from "date-fns";
import { Calendar, Clock, Loader2, CheckCircle2, User, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SmartMemoProps {
  selectedDate: Date;
  onEventsCreated?: () => void;
}

interface EmployeeSuggestion {
  id: string;
  user_id: string;
  employee_id: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  team: string;
}

interface MentionData {
  employee_id: string;
  user_id: string;
  mention_text: string;
  start_index: number;
  end_index: number;
}

export function SmartMemoEnhanced({ selectedDate, onEventsCreated }: SmartMemoProps) {
  const [memoText, setMemoText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<ParsedEntry[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 });
  const [currentMentionQuery, setCurrentMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [mentions, setMentions] = useState<Map<string, MentionData>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Debounced employee search
  const searchEmployees = useCallback(async (query: string) => {
    // Allow empty query to show all employees (when user just types @)
    try {
      const searchQuery = query.trim() || "";
      console.log('Searching employees with query:', searchQuery);
      const result = await api.get(`/api/calendar/employees/search?q=${encodeURIComponent(searchQuery)}`);
      console.log('Search results:', result);
      setSuggestions(result.employees || []);
    } catch (error: any) {
      console.error("Error searching employees:", error);
      setSuggestions([]);
    }
  }, []);

  // Handle text input and detect @mentions
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setMemoText(value);

    // Detect @mention trigger
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex !== -1) {
      // Check if @ is followed by word characters or nothing (for initial @)
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Match word characters or empty string (for just @)
      const match = afterAt.match(/^(\w*)/);
      
      if (match) {
        const mentionQuery = match[1] || "";
        setCurrentMentionQuery(mentionQuery);
        setMentionStartIndex(lastAtIndex);
        
        setShowSuggestions(true);
        // Search even if query is empty (to show all employees when just @ is typed)
        console.log('Triggering employee search for:', mentionQuery);
        searchEmployees(mentionQuery);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }

    // Update mentions map when text changes
    updateMentionsFromText(value);
  };

  // Update mentions map from text
  const updateMentionsFromText = (text: string) => {
    const extracted = extractMentions(text);
    const newMentions = new Map<string, MentionData>();
    
    extracted.forEach((mention) => {
      const mentionKey = `${mention.startIndex}-${mention.endIndex}`;
      // Try to find matching employee from existing mentions
      const existingMention = Array.from(mentions.values()).find(
        m => m.mention_text === mention.text
      );
      
      if (existingMention) {
        newMentions.set(mentionKey, {
          ...existingMention,
          start_index: mention.startIndex,
          end_index: mention.endIndex
        });
      }
    });
    
    setMentions(newMentions);
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (employee: EmployeeSuggestion) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = memoText.substring(0, mentionStartIndex);
    const afterMention = memoText.substring(textareaRef.current?.selectionStart || memoText.length);
    // Use full name or first name for mention
    const mentionText = `@${employee.name.split(' ')[0]}`;
    
    const newText = `${beforeMention}${mentionText} ${afterMention}`;
    setMemoText(newText);
    
    // Store mention data
    const mentionKey = `${mentionStartIndex}-${mentionStartIndex + mentionText.length}`;
    setMentions(prev => {
      const updated = new Map(prev);
      updated.set(mentionKey, {
        employee_id: employee.id,
        user_id: employee.user_id,
        mention_text: mentionText,
        start_index: mentionStartIndex,
        end_index: mentionStartIndex + mentionText.length
      });
      return updated;
    });
    
    setShowSuggestions(false);
    setCurrentMentionQuery("");
    setMentionStartIndex(-1);
    
    // Focus back on textarea and update cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursorPos = mentionStartIndex + mentionText.length + 1;
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        // Trigger onChange to update mentions
        const event = new Event('input', { bubbles: true });
        textareaRef.current.dispatchEvent(event);
      }
    }, 0);
  };

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (suggestions[selectedSuggestionIndex]) {
          handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    }
  };

  // Render text with highlighted mentions
  const renderTextWithMentions = (text: string) => {
    if (!text) return null;
    
    const parts: Array<{ text: string; isMention: boolean; mentionData?: MentionData }> = [];
    let lastIndex = 0;
    
    // Sort mentions by start index
    const sortedMentions = Array.from(mentions.values()).sort((a, b) => a.start_index - b.start_index);
    
    sortedMentions.forEach((mention) => {
      // Add text before mention
      if (mention.start_index > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, mention.start_index),
          isMention: false
        });
      }
      
      // Add mention
      parts.push({
        text: text.substring(mention.start_index, mention.end_index),
        isMention: true,
        mentionData: mention
      });
      
      lastIndex = mention.end_index;
    });
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        isMention: false
      });
    }
    
    return (
      <div className="whitespace-pre-wrap">
        {parts.map((part, idx) => {
          if (part.isMention && part.mentionData) {
            return (
              <span
                key={idx}
                className="bg-blue-100 text-blue-700 px-1 rounded cursor-pointer hover:bg-blue-200"
                onClick={() => navigate(`/employees/${part.mentionData!.employee_id}`)}
                title={`Click to view ${part.mentionData.mention_text} profile`}
              >
                {part.text}
              </span>
            );
          }
          return <span key={idx}>{part.text}</span>;
        })}
      </div>
    );
  };

  const handlePreview = () => {
    const { cleanedText, reminders } = extractReminders(memoText, new Date());
    const entries = parseSmartMemo(cleanedText, selectedDate);
    
    if (entries.length === 0 && reminders.length === 0) {
      toast({
        title: "No entries found",
        description: "Please enter time ranges in format: 11-12 meeting with @Summie",
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

      // Prepare mentions data - extract from text and resolve employee IDs
      const extractedMentions = extractMentions(memoText);
      const mentionsArray: MentionData[] = [];
      
      // First, use stored mentions (from dropdown selection)
      const storedMentionsMap = new Map(Array.from(mentions.values()).map(m => [m.start_index, m]));
      
      // For each extracted mention, use stored data or try to resolve
      for (const mention of extractedMentions) {
        const storedMention = storedMentionsMap.get(mention.startIndex);
        if (storedMention) {
          mentionsArray.push(storedMention);
        } else {
          // Try to resolve mention by searching for employee name
          const mentionName = mention.text.substring(1); // Remove @
          try {
            const searchResult = await api.getEmployeesSearch(mentionName);
            if (searchResult.employees && searchResult.employees.length > 0) {
              // Use first match
              const employee = searchResult.employees[0];
              mentionsArray.push({
                employee_id: employee.id,
                user_id: employee.user_id,
                mention_text: mention.text,
                start_index: mention.startIndex,
                end_index: mention.endIndex
              });
            }
          } catch (error) {
            console.warn('Could not resolve mention:', mention.text, error);
          }
        }
      }

      console.log('Saving memo with mentions:', mentionsArray);

      // Save to backend
      const result = await api.saveSmartMemo({
        memoText: memoText,
        baseDate: format(selectedDate, "yyyy-MM-dd"),
        mentions: mentionsArray
      });

      toast({
        title: "Saved successfully",
        description: `Created ${result.events?.length || 0} calendar event(s) and ${result.reminders?.length || 0} reminder(s)`,
      });

      if (result.reminders && result.reminders.length > 0) {
        window.dispatchEvent(new CustomEvent('reminder-created'));
      }

      // Trigger calendar refresh event
      window.dispatchEvent(new CustomEvent('calendar-events-updated'));

      setMemoText("");
      setPreviewEntries([]);
      setShowPreview(false);
      setMentions(new Map());
      
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
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder="Example: 11-12 meeting with @Summie, 13-15 worked on issues&#10;remind me in 30 minutes"
              value={memoText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              rows={4}
              className="resize-none"
            />
            {showSuggestions && (
              <div
                ref={suggestionsRef}
                className="absolute z-[9999] w-full mt-1 bg-white dark:bg-gray-800 border-2 border-blue-300 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                style={{ top: '100%', left: 0, marginTop: '4px' }}
              >
                {suggestions.length > 0 ? (
                  suggestions.map((employee, idx) => (
                    <div
                      key={employee.id}
                      className={cn(
                        "px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors",
                        idx === selectedSuggestionIndex && "bg-blue-50 dark:bg-blue-900/20"
                      )}
                      onClick={() => handleSelectSuggestion(employee)}
                      onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{employee.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {employee.designation} • {employee.department}
                            {employee.team !== 'No Team' && ` • ${employee.team}`}
                          </div>
                        </div>
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))
                ) : currentMentionQuery.length > 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No employees found matching "{currentMentionQuery}"
                  </div>
                ) : (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Type a name after @ to search...
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1 mt-2">
              <p className="text-xs text-muted-foreground">
                <strong>Format:</strong> HH-HH description (e.g., "11-12 meeting with @John")
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>@mentions:</strong> Type @ followed by a name to mention someone. They'll be added to the calendar event.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Reminders:</strong> Add "remind me in X minutes/hours" for reminders
              </p>
            </div>
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

