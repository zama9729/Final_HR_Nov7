import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { Loader2, User, Activity, Eye, Calendar } from "lucide-react";

export const PayrollAuditLogs = () => {
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["payroll-audit-logs"],
    queryFn: async () => {
      const result = await api.auditLogs.get({
        entity_type: "payroll_run,payroll_run_adjustment,payroll_cycle,reimbursement_run",
        limit: 50,
      });
      return result;
    },
  });

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatAction = (action: string) => {
    // Convert action to readable format
    const actionMap: Record<string, string> = {
      payroll_run_created: "Created Run",
      payroll_run_processed: "Processed Run",
      payroll_run_adjustment_created: "Created Adjustment",
      payroll_run_adjustment_updated: "Updated Adjustment",
      payroll_run_adjustment_deleted: "Deleted Adjustment",
      payroll_cycle_created: "Created Cycle",
      payroll_cycle_processed: "Processed Cycle",
      reimbursement_run_created: "Created Reimbursement Run",
      reimbursement_run_processed: "Processed Reimbursement Run",
    };

    return actionMap[action] || action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getActorName = (actor: any) => {
    if (!actor) return "System";
    const firstName = actor.first_name || "";
    const lastName = actor.last_name || "";
    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    return actor.email || "Unknown";
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role?.toLowerCase()) {
      case "ceo":
        return "default";
      case "hr":
        return "secondary";
      case "accountant":
        return "outline";
      default:
        return "outline";
    }
  };

  const truncateDetails = (details: any, maxLength: number = 50) => {
    if (!details) return "No details";
    const str = typeof details === "string" ? details : JSON.stringify(details);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "...";
  };

  const formatJson = (obj: any) => {
    if (!obj) return "No data";
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const auditLogs = logs || [];

  if (auditLogs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No audit logs found for payroll activities.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date/Time
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Actor
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Action
                </div>
              </TableHead>
              <TableHead>Details</TableHead>
              <TableHead>View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-sm">
                  {formatDateTime(log.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{getActorName(log.actor)}</span>
                    {log.actor_role && (
                      <Badge variant={getRoleBadgeVariant(log.actor_role)} className="w-fit text-xs">
                        {log.actor_role.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{formatAction(log.action)}</span>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="truncate text-sm text-muted-foreground">
                    {truncateDetails(log.details || log.diff, 60)}
                  </div>
                </TableCell>
                <TableCell>
                  {(log.details || log.diff) && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-96 max-h-[500px] p-0" align="end">
                        <div className="p-4 border-b">
                          <h4 className="font-semibold text-sm">Audit Log Details</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDateTime(log.created_at)}
                          </p>
                        </div>
                        <ScrollArea className="h-[400px] p-4">
                          <div className="space-y-4">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Action</p>
                              <p className="text-sm">{formatAction(log.action)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-1">Actor</p>
                              <p className="text-sm">{getActorName(log.actor)}</p>
                              {log.actor_role && (
                                <Badge variant={getRoleBadgeVariant(log.actor_role)} className="mt-1 text-xs">
                                  {log.actor_role.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            {log.entity_type && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Entity Type</p>
                                <p className="text-sm">{log.entity_type}</p>
                              </div>
                            )}
                            {log.reason && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Reason</p>
                                <p className="text-sm">{log.reason}</p>
                              </div>
                            )}
                            {(log.details || log.diff) && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Details / Diff</p>
                                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64">
                                  {formatJson(log.diff || log.details)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

