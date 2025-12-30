import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Calendar, Clock, Loader2, CheckCircle2, Edit2, X, AlertCircle, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";

// Helper function to get icon for action type
const getActionIcon = (type: string) => {
  switch (type) {
    case "calendar_event":
      return <Calendar className="h-4 w-4" />;
    case "reminder":
      return <Clock className="h-4 w-4" />;
    default:
      return <Edit2 className="h-4 w-4" />;
  }
};

interface DraftAction {
  intents: string[];
  confidence: number;
  proposedActions: ProposedAction[];
  extractedEntities?: {
    people?: string[];
    dates?: string[];
    times?: string[];
    topics?: string[];
  };
  clarificationNeeded?: boolean;
}

interface ProposedAction {
  type: "calendar_event" | "reminder" | "note" | "task";
  title: string;
  startDateTime?: string;
  duration?: number;
  participants?: string[];
  recurrence?: string | null;
  linkedEntity?: string;
  linkedEntityId?: string;
  description?: string;
  reminderTime?: string;
  message?: string;
  content?: string;
}

interface SmartMemoAIProps {
  selectedDate?: Date;
  onEventsCreated?: () => void;
  currentEntityId?: string;
  currentEntityType?: "employee" | "project" | "appraisal" | "payroll" | null;
  currentEntityName?: string;
  embedded?: boolean;
  onClose?: () => void;
}

export function SmartMemoAI({
  selectedDate = new Date(),
  onEventsCreated,
  currentEntityId,
  currentEntityType,
  currentEntityName,
  embedded = false,
  onClose,
}: SmartMemoAIProps) {
  const [memoText, setMemoText] = useState("");
  const [isInferring, setIsInferring] = useState(false);
  const [draftAction, setDraftAction] = useState<DraftAction | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editingAction, setEditingAction] = useState<number | null>(null);
  const [editedActions, setEditedActions] = useState<ProposedAction[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();
  const location = useLocation();
  const { userRole } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    if (textareaRef.current && !embedded) {
      textareaRef.current.focus();
    }
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !embedded) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [embedded]);

  const handleInfer = async () => {
    if (!memoText.trim()) {
      toast({
        title: "Empty input",
        description: "Please enter some text",
        variant: "destructive",
      });
      return;
    }

    setIsInferring(true);
    try {
      const currentPage = location.pathname.split('/').filter(Boolean)[0] || 'dashboard';
      
      const result = await api.inferSmartMemoIntents({
        memoText,
        currentPage,
        currentEntityId,
        currentEntityType,
        currentEntityName,
      });

      setDraftAction(result);
      setEditedActions([...result.proposedActions]);
      setShowPreview(true);

      if (result.clarificationNeeded || result.confidence < 0.6) {
        toast({
          title: "Low confidence",
          description: "Please review and edit the proposed actions",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error("Error inferring intents:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to analyze your input. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsInferring(false);
    }
  };

  const handleEditAction = (index: number) => {
    setEditingAction(index);
  };

  const handleSaveEdit = (index: number, updatedAction: ProposedAction) => {
    const newActions = [...editedActions];
    newActions[index] = updatedAction;
    setEditedActions(newActions);
    setEditingAction(null);
  };

  const handleRemoveAction = (index: number) => {
    const newActions = editedActions.filter((_, i) => i !== index);
    setEditedActions(newActions);
  };

  const handleExecute = async () => {
    if (editedActions.length === 0) {
      toast({
        title: "No actions",
        description: "Please add at least one action to execute",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      // Validate actions before sending
      const validatedActions = editedActions.map(action => {
        if (action.type === 'reminder') {
          if (!action.reminderTime) {
            throw new Error('Reminder must have a reminder time');
          }
          if (!action.message && !action.title) {
            throw new Error('Reminder must have a message or title');
          }
        }
        return action;
      });

      const result = await api.executeSmartMemoActions({
        confirmedActions: validatedActions,
      });

      console.log('[SmartMemoAI] Execution result:', result);

      const summary = result.summary || {
        calendarEvents: result.results?.calendarEvents?.length || 0,
        reminders: result.results?.reminders?.length || 0,
        notes: result.results?.notes?.length || 0,
      };

      toast({
        title: "Success!",
        description: `Created ${summary.calendarEvents} event(s), ${summary.reminders} reminder(s), ${summary.notes} note(s)`,
      });

      // Trigger refresh
      const reminderCount = summary.reminders || 0;
      if (reminderCount > 0) {
        window.dispatchEvent(new CustomEvent('reminder-created'));
      }

      // Reset state
      setMemoText("");
      setDraftAction(null);
      setEditedActions([]);
      setShowPreview(false);
      setEditingAction(null);

      if (onEventsCreated) {
        onEventsCreated();
      }

      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error("Error executing actions:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to execute actions",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveAsNote = async () => {
    if (!memoText.trim()) {
      return;
    }

    setIsExecuting(true);
    try {
      await api.executeSmartMemoActions({
        confirmedActions: [{
          type: "note",
          title: "Quick Note",
          content: memoText,
          linkedEntity: currentEntityType || undefined,
          linkedEntityId: currentEntityId || undefined,
        }],
      });

      toast({
        title: "Note saved",
        description: "Your note has been saved",
      });

      setMemoText("");
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error("Error saving note:", error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const getIntentBadgeColor = (intent: string) => {
    switch (intent) {
      case "calendar_event":
        return "bg-blue-100 text-blue-800";
      case "reminder":
        return "bg-yellow-100 text-yellow-800";
      case "note":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <>
      <Card className={`shadow-sm ${embedded ? 'border-0 shadow-none' : ''}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Smart Memo AI
            {embedded && (
              <span className="text-xs font-normal text-muted-foreground ml-auto">
                Press Cmd/Ctrl+K to focus
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Textarea
              ref={textareaRef}
              placeholder="Type naturally: 'catch up with John next week about appraisal' or 'remind me tomorrow morning to review payroll'"
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleInfer();
                }
              }}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Type naturally - no rigid syntax required. Press Cmd/Ctrl+Enter to analyze.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleInfer}
              variant="outline"
              size="sm"
              disabled={!memoText.trim() || isInferring}
              className="flex-1"
            >
              {isInferring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze Intent
                </>
              )}
            </Button>
            {memoText.trim() && (
              <Button
                onClick={handleSaveAsNote}
                variant="ghost"
                size="sm"
                disabled={isExecuting}
              >
                Save as Note
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Review Proposed Actions
            </DialogTitle>
            <DialogDescription>
              {draftAction && (
                <div className="flex items-center gap-2 mt-2">
                  <span>Confidence: </span>
                  <Badge
                    variant={draftAction.confidence >= 0.6 ? "default" : "secondary"}
                    className={draftAction.confidence >= 0.6 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}
                  >
                    {(draftAction.confidence * 100).toFixed(0)}%
                  </Badge>
                  {draftAction.intents.map((intent) => (
                    <Badge key={intent} className={getIntentBadgeColor(intent)}>
                      {intent.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {editedActions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No actions detected. Try saving as a note instead.</p>
              </div>
            ) : (
              editedActions.map((action, index) => (
                <ActionPreviewCard
                  key={index}
                  action={action}
                  index={index}
                  isEditing={editingAction === index}
                  onEdit={() => handleEditAction(index)}
                  onSave={(updated) => handleSaveEdit(index, updated)}
                  onCancel={() => setEditingAction(null)}
                  onRemove={() => handleRemoveAction(index)}
                />
              ))
            )}
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {editedActions.length} action{editedActions.length !== 1 ? 's' : ''} ready
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExecute}
                disabled={editedActions.length === 0 || isExecuting}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Create {editedActions.length} Action{editedActions.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ActionPreviewCardProps {
  action: ProposedAction;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updated: ProposedAction) => void;
  onCancel: () => void;
  onRemove: () => void;
}

function ActionPreviewCard({
  action,
  index,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onRemove,
}: ActionPreviewCardProps) {
  const [editedAction, setEditedAction] = useState<ProposedAction>(action);

  useEffect(() => {
    setEditedAction(action);
  }, [action]);

  const handleSave = () => {
    onSave(editedAction);
  };

  if (isEditing) {
    return (
      <Card className="border-2 border-blue-200">
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label>Title</Label>
            <Input
              value={editedAction.title}
              onChange={(e) => setEditedAction({ ...editedAction, title: e.target.value })}
            />
          </div>
          {editedAction.type === "calendar_event" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={editedAction.startDateTime ? format(parseISO(editedAction.startDateTime), "yyyy-MM-dd'T'HH:mm") : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                      setEditedAction({ ...editedAction, startDateTime: date });
                    }}
                  />
                </div>
                <div>
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    value={editedAction.duration || 30}
                    onChange={(e) => setEditedAction({ ...editedAction, duration: parseInt(e.target.value) || 30 })}
                  />
                </div>
              </div>
              {editedAction.description && (
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={editedAction.description || ''}
                    onChange={(e) => setEditedAction({ ...editedAction, description: e.target.value })}
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
          {editedAction.type === "reminder" && (
            <div>
              <Label>Reminder Time</Label>
              <Input
                type="datetime-local"
                value={editedAction.reminderTime ? format(parseISO(editedAction.reminderTime), "yyyy-MM-dd'T'HH:mm") : ''}
                onChange={(e) => {
                  const date = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                  setEditedAction({ ...editedAction, reminderTime: date });
                }}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {getActionIcon(action.type)}
              <Badge className="bg-blue-100 text-blue-800">
                {action.type.replace('_', ' ')}
              </Badge>
            </div>
            <h4 className="font-semibold mb-1">{action.title}</h4>
            {action.type === "calendar_event" && action.startDateTime && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  {format(parseISO(action.startDateTime), "MMM d, yyyy 'at' h:mm a")}
                  {action.duration && ` (${action.duration} min)`}
                </p>
                {action.description && <p className="italic">{action.description}</p>}
              </div>
            )}
            {action.type === "reminder" && action.reminderTime && (
              <p className="text-sm text-muted-foreground">
                Remind at: {format(parseISO(action.reminderTime), "MMM d, yyyy 'at' h:mm a")}
              </p>
            )}
            {action.type === "note" && action.content && (
              <p className="text-sm text-muted-foreground">{action.content}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


