import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCcw, Edit, Loader2 } from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Workflow = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

const statusVariant = (status?: string | null) => {
  switch ((status || "").toLowerCase()) {
    case "published":
      return "default";
    case "active":
      return "default";
    case "paused":
      return "secondary";
    case "draft":
      return "outline";
    default:
      return "outline";
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listWorkflows();
      setWorkflows(data?.workflows || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load workflows");
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePublish = useCallback(
    async (id: string) => {
      try {
        setActionId(id);
        await api.publishWorkflow(id);
        await fetchWorkflows();
      } catch (err: any) {
        alert(err?.message || "Failed to publish workflow");
      } finally {
        setActionId(null);
      }
    },
    [fetchWorkflows]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this workflow? This cannot be undone.")) return;
      try {
        setActionId(id);
        await api.deleteWorkflow(id);
        await fetchWorkflows();
      } catch (err: any) {
        alert(err?.message || "Failed to delete workflow");
      } finally {
        setActionId(null);
      }
    },
    [fetchWorkflows]
  );

  useEffect(() => {
    console.log("API Object:", api);
    console.log("Has listWorkflows:", typeof api.listWorkflows);
    fetchWorkflows();
  }, [fetchWorkflows]);

  const emptyState = useMemo(
    () => (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>No workflows created yet</p>
          <p className="text-sm mt-2">Create your first workflow to automate HR processes</p>
        </CardContent>
      </Card>
    ),
    []
  );

  const errorState = useMemo(
    () =>
      error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-6 text-destructive text-sm">
            {error}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={fetchWorkflows} disabled={loading}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null,
    [error, fetchWorkflows, loading]
  );

  const loadingState = useMemo(
    () =>
      Array.from({ length: 3 }).map((_, idx) => (
        <Card key={`workflow-skel-${idx}`} className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/3 mb-2" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-4 bg-muted rounded w-1/4" />
            </div>
          </CardContent>
        </Card>
      )),
    []
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Workflows</h1>
            <p className="text-muted-foreground">Automate your HR processes</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchWorkflows} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            </Button>
            <Button asChild>
              <Link to="/workflows/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Workflow
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {errorState}
          {loading
            ? loadingState
            : workflows.length === 0
              ? emptyState
              : workflows.map((workflow) => (
                <Card key={workflow.id} className="transition-all hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <CardTitle className="text-xl">{workflow.name}</CardTitle>
                          <Badge variant={statusVariant(workflow.status)} className="uppercase tracking-wide text-xs">
                              {workflow.status || "draft"}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm">
                          {workflow.description || "No description provided"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Updated:</span> {formatDateTime(workflow.updated_at)}
                      </div>
                      <div>
                        <span className="font-medium">Created:</span> {formatDateTime(workflow.created_at)}
                      </div>
                        <div>
                          <span className="font-medium">Published:</span>{" "}
                          {formatDateTime(workflow.published_at)}
                        </div>
                      <div>
                        <span className="font-medium">Nodes:</span>{" "}
                        {Array.isArray((workflow as any)?.workflow_json?.nodes)
                          ? (workflow as any).workflow_json.nodes.length
                          : "—"}
                      </div>
                    </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/workflows/${workflow.id}/edit`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          disabled={actionId === workflow.id || workflow.status?.toLowerCase() === "published"}
                          onClick={() => handlePublish(workflow.id)}
                        >
                          {actionId === workflow.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <></>
                          )}
                          {workflow.status?.toLowerCase() === "published" ? "Published" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionId === workflow.id}
                          onClick={() => handleDelete(workflow.id)}
                        >
                          {actionId === workflow.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Delete
                        </Button>
                      </div>
                  </CardContent>
                </Card>
              ))}
        </div>
      </div>
    </AppLayout>
  );
}
