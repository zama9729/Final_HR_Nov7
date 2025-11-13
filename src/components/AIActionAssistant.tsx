import { ComponentType, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sidebar, SidebarHeader, SidebarContent } from "@/components/ui/sidebar";
import {
  Bot,
  Send,
  Loader2,
  Plus,
  Trash2,
  MessageSquare,
  Zap,
  CalendarPlus,
  ClipboardList,
  Users,
  BarChart3,
  ShieldQuestion,
} from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AssistantMessage {
  role: string;
  content?: string;
  name?: string;
  tool_call_id?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  preview?: string;
  message_count?: number;
}

export function AIActionAssistant() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

const QUICK_ACTIONS: Array<{
  key: string;
  title: string;
  description: string;
  prompt: string;
  tooltip: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    key: "create_leave_request",
    title: "Create Leave Request",
    description: "Gather dates, confirm, then submit a new leave request.",
    prompt:
      "I need to create a leave request. Please ask me for the start date, end date, leave type, and reason if needed. Confirm the details with me and then call create_leave_request.",
    tooltip:
      "Guides the conversation to collect dates, leave type, and reason, then calls the leave-request tool.",
    icon: CalendarPlus,
  },
  {
    key: "get_leave_balance",
    title: "Check Leave Balance",
    description: "Retrieve my current leave balance and usage.",
    prompt:
      "Please call get_leave_balance and summarise my remaining balance and leaves taken this year.",
    tooltip:
      "Runs the leave balance tool so you can confirm remaining days and usage at a glance.",
    icon: ClipboardList,
  },
  {
    key: "get_my_leave_requests",
    title: "My Leave Requests",
    description: "List the status of my recent leave requests.",
    prompt:
      "Call get_my_leave_requests and present my recent leave requests with their status.",
    tooltip:
      "Shows the recent leave requests you've submitted, including their approval state.",
    icon: ClipboardList,
  },
  {
    key: "list_pending_leave_requests",
    title: "Pending Approvals",
    description: "Show leave requests waiting for my approval.",
    prompt:
      "If I have approval permissions, call list_pending_leave_requests and show the pending items.",
    tooltip:
      "Lists team leave requests that still need your approval (manager/HR/lead roles).",
    icon: ShieldQuestion,
  },
  {
    key: "get_dashboard_stats",
    title: "Dashboard Summary",
    description: "Fetch key HR metrics for my organisation.",
    prompt:
      "Call get_dashboard_stats and provide a concise summary of the counts returned.",
    tooltip:
      "Pulls top-level counts (active employees, pending leaves, timesheets) for a quick snapshot.",
    icon: BarChart3,
  },
  {
    key: "get_employee_info",
    title: "Find Employee",
    description: "Look up a specific employee's profile information.",
    prompt:
      "Prompt me for the employee identifier I want, then call get_employee_info with that value and report the details.",
    tooltip:
      "Asks which employee you're interested in, then fetches their profile details.",
    icon: Users,
  },
  {
    key: "list_employees",
    title: "List Employees",
    description: "Search employees by department, status, or name.",
    prompt:
      "Ask which filters I want to use (department, status, search text) then call list_employees with those filters and summarise the results.",
    tooltip:
      "Lets you apply filters like department, status, or search keywords to list employees.",
    icon: Users,
  },
];

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const loadConversations = async () => {
    try {
      const data = await api.listAIConversations();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to load conversations", error);
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const data = await api.getAIConversation(conversationId);
      if (data.conversation?.messages) {
        setMessages(data.conversation.messages);
        setCurrentConversationId(conversationId);
        setStreamingContent("");
      }
    } catch (error) {
      console.error("Failed to load conversation", error);
      toast({
        title: "Unable to load conversation",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setStreamingContent("");
    setCurrentConversationId(null);
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await api.deleteAIConversation(conversationId);
      await loadConversations();
      if (currentConversationId === conversationId) {
        startNewConversation();
      }
      toast({
        title: "Conversation deleted",
        variant: "default",
      });
    } catch (error) {
      console.error("Failed to delete conversation", error);
      toast({
        title: "Unable to delete conversation",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  const streamChat = async (
    conversationMessages: AssistantMessage[],
    conversationId: string | null
  ) => {
    const token = localStorage.getItem("auth_token") || "";
    const payloadMessages = conversationMessages.map((msg) => {
      const payload: Record<string, any> = { role: msg.role };
      if (msg.content !== undefined) payload.content = msg.content;
      if (msg.name) payload.name = msg.name;
      if (msg.tool_call_id) payload.tool_call_id = msg.tool_call_id;
      return payload;
    });

    const apiUrl = `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/ai/chat`;
    console.log('[AI Assistant Frontend] Sending request to:', apiUrl);
    console.log('[AI Assistant Frontend] Messages:', payloadMessages.length);
    console.log('[AI Assistant Frontend] Conversation ID:', conversationId);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: payloadMessages,
        enable_functions: true,
        conversation_id: conversationId,
      }),
    });

    console.log('[AI Assistant Frontend] Response status:', response.status, response.statusText);
    console.log('[AI Assistant Frontend] Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("AI Assistant API error:", response.status, text);
      throw new Error(text || `Failed to contact AI assistant (${response.status})`);
    }

    if (!response.body) {
      console.error("AI Assistant response has no body");
      throw new Error("No response body from AI assistant");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    let newConversationId: string | null = conversationId;
    const toolMessages: AssistantMessage[] = [];
    let chunkCount = 0;

    console.log('[AI Assistant Frontend] Starting to read stream...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[AI Assistant Frontend] Stream done. Total chunks:', chunkCount);
        break;
      }
      chunkCount++;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;

      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;

        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") {
          continue;
        }
        if (payload === "[FUNCTION_CALL]") {
          continue;
        }

        try {
          const parsed = JSON.parse(payload);

          if (parsed.type === "tool_result") {
            console.log('[AI Assistant Frontend] Tool result received:', parsed.tool_name);
            const toolContent =
              typeof parsed.result === "string"
                ? parsed.result
                : JSON.stringify(parsed.result, null, 2);
            toolMessages.push({
              role: "tool",
              content: toolContent,
              name: parsed.tool_name,
            });
            setMessages((prev) => [...prev, toolMessages[toolMessages.length - 1]]);
            continue;
          }

          if (parsed.type === "tool_error") {
            console.error('[AI Assistant Frontend] Tool error:', parsed.tool_name, parsed.error);
            toolMessages.push({
              role: "tool",
              content: `Error executing ${parsed.tool_name}: ${parsed.error}`,
            });
            setMessages((prev) => [...prev, toolMessages[toolMessages.length - 1]]);
            continue;
          }

          if (parsed.conversation_id && !newConversationId) {
            newConversationId = parsed.conversation_id;
            setCurrentConversationId(parsed.conversation_id);
          }

          if (parsed.error) {
            console.error('[AI Assistant Frontend] Error from backend:', parsed.error);
            // Set error as assistant text so it displays to user
            assistantText = `Error: ${parsed.error}`;
            setStreamingContent(assistantText);
            // Continue processing to return the error message
            continue;
          }

          const deltaContent =
            parsed.choices?.[0]?.delta?.content ??
            parsed.choices?.[0]?.message?.content ??
            parsed.content ??
            parsed.message;

          if (typeof deltaContent === "string" && deltaContent.length > 0) {
            assistantText += deltaContent;
            setStreamingContent(assistantText);
          }
        } catch (error) {
          // Ignore partial JSON lines
          console.warn('[AI Assistant Frontend] Failed to parse line:', line, error);
          continue;
        }
      }
    }

    console.log('[AI Assistant Frontend] Stream complete. Assistant text length:', assistantText.length, 'Tool messages:', toolMessages.length);
    return { assistantText, conversationId: newConversationId, toolMessages };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    const updatedMessages: AssistantMessage[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];

    setMessages(updatedMessages);
    setInput("");
    setStreamingContent("");
    setIsLoading(true);

    try {
      const { assistantText, conversationId, toolMessages } = await streamChat(
        updatedMessages,
        currentConversationId
      );

      setStreamingContent("");

      if (assistantText.trim().length > 0) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantText },
        ]);
      }

      if (toolMessages.length > 0) {
        setMessages((prev) => [...prev, ...toolMessages]);
      }

      await loadConversations();

      // Update conversation ID but don't reload conversation (it would overwrite messages)
      if (conversationId) {
        setCurrentConversationId(conversationId);
      }
    } catch (error: any) {
      console.error("AI assistant error:", error);
      setStreamingContent("");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error?.message ||
            "Sorry, I couldn't complete that action. Please try again.",
        },
      ]);
      toast({
        title: "Request failed",
        description:
          error?.message || "AI assistant encountered an error executing the action.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

const handleQuickAction = async (prompt: string) => {
  if (isLoading) return;
  setInput("");
  setStreamingContent("");
  const updatedMessages: AssistantMessage[] = [
    ...messages,
    { role: "user", content: prompt },
  ];
  setMessages(updatedMessages);
  setIsLoading(true);

    try {
      const { assistantText, conversationId, toolMessages } = await streamChat(
      updatedMessages,
      currentConversationId
    );

    setStreamingContent("");

    if (assistantText.trim().length > 0) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);
    }

      if (toolMessages.length > 0) {
        setMessages((prev) => [...prev, ...toolMessages]);
      }

    await loadConversations();

    // Update conversation ID but don't reload conversation (it would overwrite messages)
    if (conversationId) {
      setCurrentConversationId(conversationId);
    }
  } catch (error: any) {
    console.error("AI assistant error:", error);
    setStreamingContent("");
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          error?.message ||
          "Sorry, I couldn't complete that action. Please try again.",
      },
    ]);
    toast({
      title: "Request failed",
      description:
        error?.message || "AI assistant encountered an error executing the action.",
      variant: "destructive",
    });
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="flex h-full rounded-lg border bg-background overflow-hidden">
      {/* Sidebar */}
      {isSidebarOpen && (
        <Sidebar className="w-64 border-r flex flex-col">
          <SidebarHeader className="p-3 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Conversations</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={startNewConversation}
                className="h-7 w-7"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </SidebarHeader>
          <SidebarContent className="flex-1 p-2 overflow-auto">
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group rounded-md p-2 cursor-pointer transition-colors ${
                    currentConversationId === conv.id
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => loadConversation(conv.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {conv.title || "New Conversation"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {conv.preview || "No messages yet"}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {format(new Date(conv.updated_at), "MMM d, h:mm a")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {conversations.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-xs">
                  <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p>No conversations yet</p>
                  <p className="mt-1">Start a new chat to begin</p>
                </div>
              )}
            </div>
          </SidebarContent>
        </Sidebar>
      )}

      {/* Main pane */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="text-sm font-medium">AI Assistant (Actions)</span>
            <Badge variant="secondary" className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Tool Calling
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4 space-y-4">
            <Card className="border-dashed">
              <CardContent className="py-4">
                <TooltipProvider>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {QUICK_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Tooltip key={action.key}>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              className="justify-start h-auto py-3 px-4 text-left transition hover:border-primary/60"
                              disabled={isLoading}
                              onClick={() => handleQuickAction(action.prompt)}
                            >
                              <div className="flex items-start gap-3">
                                <Icon className="h-5 w-5 text-primary mt-0.5" />
                                <div>
                                  <p className="text-sm font-medium">
                                    {action.title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {action.description}
                                  </p>
                                </div>
                              </div>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start">
                            <p className="max-w-xs text-xs">
                              {action.tooltip}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </CardContent>
            </Card>

            {messages.length === 0 && !streamingContent && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center space-y-2">
                  <Bot className="h-10 w-10 mx-auto opacity-50" />
                  <p className="text-sm text-muted-foreground">
                    Ask me to perform HR actions like creating leave requests, checking balances, or approving requests.
                  </p>
                </CardContent>
              </Card>
            )}

            {messages.map((msg, idx) => {
              if (msg.role === "tool") {
                return (
                  <div key={`tool-${idx}`} className="flex justify-start">
                    <Card className="max-w-[75%] bg-muted/60 text-xs">
                      <CardContent className="p-3 space-y-2">
                        <Badge variant="outline" className="text-xs">
                          Tool Result
                        </Badge>
                        <pre className="whitespace-pre-wrap text-xs">
                          {msg.content}
                        </pre>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              const isUser = msg.role === "user";
              return (
                <div
                  key={`${msg.role}-${idx}-${msg.content}`}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            })}

            {streamingContent && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {streamingContent}
                    <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1" />
                  </p>
                </div>
              </div>
            )}

            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs text-muted-foreground">
                    Executing requested action...
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleSend();
                }
              }}
              placeholder="Ask me to perform an HR task..."
              disabled={isLoading}
              className="text-sm"
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              size="icon"
              className="h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


