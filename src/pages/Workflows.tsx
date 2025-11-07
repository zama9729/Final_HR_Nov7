import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Play, Pause, Edit, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const mockWorkflows: Array<{
  id: number;
  name: string;
  description: string;
  status: string;
  lastRun: string;
  runs: number;
}> = [];

export default function Workflows() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Workflows</h1>
            <p className="text-muted-foreground">Automate your HR processes</p>
          </div>
          <Button asChild>
            <Link to="/workflows/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Workflow
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {mockWorkflows.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No workflows created yet</p>
                <p className="text-sm mt-2">Create your first workflow to automate HR processes</p>
              </CardContent>
            </Card>
          ) : (
            mockWorkflows.map((workflow) => (
              <Card key={workflow.id} className="transition-all hover:shadow-medium">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-xl">{workflow.name}</CardTitle>
                        <Badge
                          variant={
                            workflow.status === "active"
                              ? "default"
                              : workflow.status === "paused"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {workflow.status}
                        </Badge>
                      </div>
                      <CardDescription>{workflow.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/workflows/${workflow.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon">
                        {workflow.status === "active" ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div>
                      <span className="font-medium">{workflow.runs}</span> total runs
                    </div>
                    <div>
                      Last run: <span className="font-medium">{workflow.lastRun}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
