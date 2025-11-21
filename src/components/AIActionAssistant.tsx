import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ListFilter,
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
  const [showUtilityPanel, setShowUtilityPanel] = useState(true);
  const [conversationSearch, setConversationSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const filteredConversations = useMemo(() => {
    if (!conversationSearch.trim()) return conversations;
    const term = conversationSearch.toLowerCase();
    return conversations.filter((conv) =>
      (conv.title || "").toLowerCase().includes(term) ||
      (conv.preview || "").toLowerCase().includes(term)
    );
  }, [conversations, conversationSearch]);

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
    <div className="flex h-full flex-col gap-4 lg:grid lg:grid-cols-[280px,minmax(0,1fr)] lg:gap-6">
      <div className={`${showUtilityPanel ? "flex" : "hidden lg:flex"} flex-col gap-4`}>
        <Card className="flex flex-col">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Conversations</CardTitle>
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={startNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              placeholder="Search history"
              className="h-8 text-xs"
            />
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-56 lg:h-[360px]">
              <div className="space-y-1 p-2">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      currentConversationId === conv.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{conv.title || "New Conversation"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{conv.preview || "No messages yet"}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(conv.updated_at), "MMM d, h:mm a")}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </button>
                ))}

                {filteredConversations.length === 0 && (
                  <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                    <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-60" />
                    No conversations found
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick automations</CardTitle>
            <p className="text-xs text-muted-foreground">
              Pre-filled prompts to execute HR workflows faster.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <TooltipProvider>
              <div className="space-y-2">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Tooltip key={action.key}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-3 py-3 text-left"
                          disabled={isLoading}
                          onClick={() => handleQuickAction(action.prompt)}
                        >
                          <Icon className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{action.title}</p>
                            <p className="text-xs text-muted-foreground">{action.description}</p>
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{action.tooltip}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col rounded-2xl border bg-card/70 backdrop-blur">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            AI Assistant · Actions
            <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Tool calling
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 lg:hidden"
            onClick={() => setShowUtilityPanel((prev) => !prev)}
          >
            <ListFilter className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-4 p-4">
            {messages.length === 0 && !streamingContent && (
              <Card className="border-dashed text-center text-muted-foreground">
                <CardContent className="py-10">
                  <Bot className="mx-auto mb-3 h-10 w-10 opacity-50" />
                  <p className="text-sm">
                    Ask me to create leave requests, pull KPIs, or approve workflows. I will confirm before executing tools.
                  </p>
                </CardContent>
              </Card>
            )}

            {messages.map((msg, idx) => {
              if (msg.role === "tool") {
                return (
                  <div key={`tool-${idx}`} className="flex justify-start">
                    <Card className="max-w-[80%] border-l-4 border-primary bg-muted/40 text-xs">
                      <CardContent className="space-y-2 p-3">
                        <Badge variant="outline" className="text-[10px]">
                          Tool result
                        </Badge>
                        <pre className="whitespace-pre-wrap">{msg.content}</pre>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              const isUser = msg.role === "user";
              return (
                <div key={`${msg.role}-${idx}-${msg.content}`} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            })}

            {streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-4 py-2 text-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {streamingContent}
                    <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-current" />
                  </p>
                </div>
              </div>
            )}

            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Executing requested action…
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background/60 p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  handleSend();
                }
              }}
              placeholder="Ask me to perform an HR task…"
              disabled={isLoading}
              className="text-sm"
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon" className="h-9 w-9">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


