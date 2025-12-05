import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AuditLogEntry = {
  id: string;
  actor: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  actor_role?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  reason?: string;
  details?: any;
  diff?: any;
  scope?: string;
  created_at: string;
};

const riskActions = new Set([
  "override",
  "break_glass_override",
  "terminate",
  "rehire",
  "payroll_run",
  "payroll_rollback",
  "policy_edit",
  "role_change",
  "compensation_change",
]);

const actionOptions = [
  "",
  "attendance.clocked",
  "override",
  "terminate",
  "rehire",
  "policy_edit",
  "payroll_run",
  "background_check",
  "offboarding",
  "employee_update",
  "employee_create",
  "promotion_create",
  "promotion_approve",
  "promotion_reject",
  "department_create",
  "department_update",
  "team_create",
  "team_update",
  "compensation_change",
  "role_change",
];

export default function AuditLogs() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    action: "",
    entityType: "",
    actorId: "",
    from: "",
    to: "",
    limit: 100,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        action: filters.action || undefined,
        entity_type: filters.entityType || undefined,
        actor_id: filters.actorId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: filters.limit,
      });

      const normalized: AuditLogEntry[] = data.map((entry: AuditLogEntry) => {
        const parseMaybe = (value: any) => {
          if (!value) return null;
          if (typeof value === "object") return value;
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        };
        return {
          ...entry,
          details: parseMaybe(entry.details),
          diff: parseMaybe(entry.diff),
        };
      });

      setLogs(normalized);
    } catch (error: any) {
      console.error("Failed to load audit logs", error);
      toast({
        title: "Unable to load logs",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const highRiskCount = useMemo(
    () => logs.filter((log) => riskActions.has(log.action)).length,
    [logs]
  );

  const clearFilters = () => {
    setFilters({
      action: "",
      entityType: "",
      actorId: "",
      from: "",
      to: "",
      limit: 100,
    });
  };

  const formatDate = (value: string) => {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Immutable change history for your organization. Only CEOs and HRBPs can access this view.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Limit the feed to a specific action, actor, or date range.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  Action
                </label>
                <Select
                  value={filters.action}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, action: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    {actionOptions.map((value) => (
                      <SelectItem key={value || "all"} value={value}>
                        {value ? value : "All actions"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  Entity Type
                </label>
                <Input
                  placeholder="e.g. termination"
                  value={filters.entityType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, entityType: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  Actor ID / Email
                </label>
                <Input
                  placeholder="UUID or email fragment"
                  value={filters.actorId}
                  onChange={(e) => setFilters((prev) => ({ ...prev, actorId: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  Result Limit
                </label>
                <Input
                  type="number"
                  min={10}
                  max={500}
                  value={filters.limit}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      limit: Number(e.target.value) || 100,
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  From
                </label>
                <Input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground tracking-wide block mb-1">
                  To
                </label>
                <Input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={fetchLogs} disabled={loading} variant="default">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              <Button onClick={clearFilters} variant="ghost" disabled={loading}>
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total records</CardDescription>
              <CardTitle className="text-3xl">{logs.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Based on current filters.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>High-risk actions</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                {highRiskCount}
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Overrides, payroll runs, terminations, etc.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Latest event</CardDescription>
              <CardTitle className="text-lg">
                {logs[0] ? formatDate(logs[0].created_at) : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Logs are ordered by most recent first.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Feed</CardTitle>
            <CardDescription>Immutable audit trail with actor, action, and payload snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        No audit entries match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin inline-block text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading &&
                    logs.map((log) => (
                      <TableRow key={log.id} className="align-top">
                        <TableCell className="text-sm">{formatDate(log.created_at)}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {log.actor?.first_name
                                ? `${log.actor.first_name} ${log.actor.last_name ?? ""}`.trim()
                                : log.actor?.email || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {log.actor_role || log.actor?.email || "Unknown role"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col gap-1">
                            <span>{log.action || "—"}</span>
                            {riskActions.has(log.action) && (
                              <Badge variant="destructive" className="w-fit">
                                High risk
                              </Badge>
                            )}
                            {log.scope && (
                              <Badge variant="outline" className="w-fit text-xs">{log.scope}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-mono text-xs text-muted-foreground">
                              {log.entity_type || "—"}
                            </span>
                            <span className="font-mono text-xs truncate max-w-[180px]">
                              {log.entity_id || "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs space-y-2">
                          {log.reason && (
                            <div>
                              <p className="font-medium">Reason</p>
                              <p className="text-muted-foreground">{log.reason}</p>
                            </div>
                          )}
                          {log.details && (
                            <div>
                              <p className="font-medium">Details</p>
                              <pre className="bg-muted rounded p-2 text-[11px] overflow-x-auto max-w-xl">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.diff && (
                            <div>
                              <p className="font-medium">Diff</p>
                              <pre className="bg-muted rounded p-2 text-[11px] overflow-x-auto max-w-xl">
                                {JSON.stringify(log.diff, null, 2)}
                              </pre>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}


